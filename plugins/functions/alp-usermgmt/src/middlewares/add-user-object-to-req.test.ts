/**
 * Proves `addUserObjToReq` acts on the freshness comparison (`authz-freshness.test.ts`
 * proves the comparison itself): a fresh token reaches the next handler, a stale
 * one is rejected with a 401 and never does — which matters because it's
 * registered ahead of every router, stopping a stale token from reaching
 * `grant-roles-by-scopes` and reconciling its outdated claims into the database.
 *
 * Run: deno test --allow-env --no-check src/middlewares/add-user-object-to-req.test.ts
 */
import { assertEquals } from '@std/assert'

// Must be set before the middleware module is evaluated: it captures
// USER_MGMT__IDP_SUBJECT_PROP into a module-level const at import time.
Deno.env.set('USER_MGMT__IDP_SUBJECT_PROP', 'sub')

const { Container } = await import('typedi')
const { UserService } = await import('../services/UserService.ts')
const { User } = await import('../entities/User.ts')
const { SERVICE_USER_ID } = await import('../const.ts')
const { addUserObjToReq } = await import('./add-user-object-to-req.ts')

const CHANGED_AT = new Date(1_700_000_000_000)
const IAT_BEFORE_CHANGE = 1_699_999_000
const IAT_AFTER_CHANGE = 1_700_000_010
const IDP_USER_ID = 'idp-user-1'
const USER_ID = 'db-user-1'

const base64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** An unsigned JWT: the middleware only calls jwt.decode, it does not verify. */
const makeBearer = (payload: Record<string, unknown>) =>
  `Bearer ${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.signature`

const makeReq = (payload: Record<string, unknown>) =>
  ({ headers: { authorization: makeBearer(payload) } }) as any

const makeRes = () => ({
  statusCode: undefined as number | undefined,
  headers: {} as Record<string, string>,
  body: undefined as any,
  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
    return this
  },
  status(code: number) {
    this.statusCode = code
    return this
  },
  send(body?: unknown) {
    this.body = body
    return this
  }
})

const stubUser = (user: InstanceType<typeof User> | undefined) => {
  Container.set(UserService, { getUserByIdpUserId: () => Promise.resolve(user) })
}

const dbUser = (authzChangedAt: Date | null) =>
  new User({
    id: USER_ID,
    username: 'researcher@d2e.local',
    idpUserId: IDP_USER_ID,
    active: true,
    authzChangedAt
  } as any)

const run = async (payload: Record<string, unknown>) => {
  const req = makeReq(payload)
  const res = makeRes()
  let nextCalled = false
  await addUserObjToReq(req, res as any, () => {
    nextCalled = true
  })
  return { req, res, nextCalled }
}

Deno.test('a fresh token passes through and populates req.user', async () => {
  stubUser(dbUser(CHANGED_AT))
  const { req, res, nextCalled } = await run({ sub: IDP_USER_ID, iat: IAT_AFTER_CHANGE })

  assertEquals(nextCalled, true)
  assertEquals(res.statusCode, undefined)
  assertEquals(req.user.userId, USER_ID)
  assertEquals(req.user.idpUserId, IDP_USER_ID)
})

Deno.test('a stale token is rejected with the machine-readable 401', async () => {
  stubUser(dbUser(CHANGED_AT))
  const { req, res, nextCalled } = await run({ sub: IDP_USER_ID, iat: IAT_BEFORE_CHANGE })

  assertEquals(res.statusCode, 401)
  assertEquals(res.headers['x-token-stale'], '1')
  assertEquals(res.body, {
    code: 'AUTHZ_STALE_TOKEN',
    message: 'Authorization changed; token refresh required'
  })
  // The whole point: no downstream handler runs, so grant-roles-by-scopes
  // never gets to reconcile the database from this token's stale claims.
  assertEquals(nextCalled, false)
  assertEquals(req.user, undefined)
})

Deno.test('a token with no iat is rejected once a change is recorded', async () => {
  stubUser(dbUser(CHANGED_AT))
  const { res, nextCalled } = await run({ sub: IDP_USER_ID })

  assertEquals(res.statusCode, 401)
  assertEquals(res.headers['x-token-stale'], '1')
  assertEquals(nextCalled, false)
})

Deno.test('a token with no iat passes when no change is recorded', async () => {
  stubUser(dbUser(null))
  const { res, nextCalled } = await run({ sub: IDP_USER_ID })

  assertEquals(nextCalled, true)
  assertEquals(res.statusCode, undefined)
})

Deno.test('a null authz_changed_at passes, so deploying the migration logs nobody out', async () => {
  stubUser(dbUser(null))
  const { res, nextCalled } = await run({ sub: IDP_USER_ID, iat: IAT_BEFORE_CHANGE })

  assertEquals(nextCalled, true)
  assertEquals(res.statusCode, undefined)
})

Deno.test('a user with no usermgmt row passes (first login / auto-provisioning)', async () => {
  stubUser(undefined)
  const { req, res, nextCalled } = await run({ sub: IDP_USER_ID, iat: IAT_BEFORE_CHANGE })

  assertEquals(nextCalled, true)
  assertEquals(res.statusCode, undefined)
  assertEquals(req.user.userId, '')
})

Deno.test('an M2M service token is never subject to the freshness gate', async () => {
  stubUser(dbUser(CHANGED_AT))
  const { req, res, nextCalled } = await run({
    sub: 'client-abc',
    client_id: 'client-abc',
    iat: IAT_BEFORE_CHANGE
  })

  assertEquals(nextCalled, true)
  assertEquals(res.statusCode, undefined)
  assertEquals(req.user.userId, SERVICE_USER_ID)
})

Deno.test('a request with no authorization header is untouched', async () => {
  stubUser(dbUser(CHANGED_AT))
  const req = { headers: {} } as any
  const res = makeRes()
  let nextCalled = false
  await addUserObjToReq(req, res as any, () => {
    nextCalled = true
  })

  assertEquals(nextCalled, true)
  assertEquals(res.statusCode, undefined)
})
