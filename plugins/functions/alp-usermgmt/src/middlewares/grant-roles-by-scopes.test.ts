/**
 * `grant-roles-by-scopes` reconciles the portal database *from* the access
 * token's role claims — its own claims, not an authorization change — so it
 * must NOT stamp `authz_changed_at`. Doing so would mark the caller's own
 * token stale for a change it supplied, forcing a renewal that returns
 * identical claims: invisible in production except as unexplained re-login
 * churn on every first login. That's the property pinned here.
 *
 * Run: deno test --allow-env --no-check src/middlewares/grant-roles-by-scopes.test.ts
 */
import { assertEquals } from '@std/assert'

// Must be set before the module is evaluated: grant-roles-by-scopes captures
// USER_MGMT__IDP_SUBJECT_PROP into a module-level const at import time.
Deno.env.set('USER_MGMT__IDP_SUBJECT_PROP', 'sub')

const { Container } = await import('typedi')
const { CONTAINER_KEY, IDP_SCOPE_ROLE } = await import('../const.ts')
const { env } = await import('../env.ts')
const { UserService } = await import('../services/UserService.ts')
const { UserGroupService } = await import('../services/UserGroupService.ts')
const { B2cGroupService } = await import('../services/B2cGroupService.ts')
const { EntitlementsSyncService } = await import('../services/EntitlementsSyncService.ts')
const { LogtoAPI } = await import('../api/LogtoAPI.ts')
const { grantRolesByScopes } = await import('./grant-roles-by-scopes.ts')

const IDP_USER_ID = 'idp-user-1'
const USER_ID = 'db-user-1'

const base64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** An unsigned JWT: the middleware only calls jwt.decode, it does not verify. */
const makeBearer = (payload: Record<string, unknown>) =>
  `Bearer ${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.signature`

type GroupCall = { method: 'register' | 'withdraw'; userId: string; options: any }

/**
 * Replaces every collaborator the reconciliation reaches, and records the calls
 * that matter. Nothing here touches a database or Logto.
 */
const installStubs = () => {
  const groupCalls: GroupCall[] = []
  const rawQueries: string[] = []

  Container.set(LogtoAPI, { getUser: () => Promise.resolve(null), deleteUser: () => Promise.resolve() })
  Container.set(UserService, {
    getUserByIdpUserId: () => Promise.resolve({ id: USER_ID, idpUserId: IDP_USER_ID }),
    getUserByUsername: () => Promise.resolve({ id: USER_ID, idpUserId: IDP_USER_ID })
  })
  Container.set(EntitlementsSyncService, {
    sync: () => Promise.resolve(),
    getManagedDatasetCodes: () => Promise.resolve(new Set<string>())
  })
  Container.set(B2cGroupService, {
    getGroupBySystemRole: (_system: string, role: string) => Promise.resolve({ id: `group-for-${role}` }),
    getGroupByStudyRole: () => Promise.resolve({ id: 'group-study' }),
    createGroup: () => Promise.resolve()
  })
  Container.set(UserGroupService, {
    getUserGroup: () => Promise.resolve({ id: 'ug-1' }),
    registerUserToGroup: (userId: string, _g: string, _trx: any, options: any) => {
      groupCalls.push({ method: 'register', userId, options })
      return Promise.resolve()
    },
    withdrawUserFromGroup: (userId: string, _g: string, _trx: any, options: any) => {
      groupCalls.push({ method: 'withdraw', userId, options })
      return Promise.resolve()
    }
  })
  Container.set(CONTAINER_KEY.DB_CONNECTION, {
    raw: (sql: string) => {
      rawQueries.push(sql)
      return Promise.resolve({ rows: [] })
    }
  })

  return { groupCalls, rawQueries }
}

/**
 * Sets the env this middleware branches on, and restores it afterwards. These
 * are properties of the exported `env` object, read at call time.
 */
const withEnv = async (fn: () => Promise<void>) => {
  const previous = {
    autoProvision: env.IDP_AUTO_PROVISION_USERS,
    tenantId: env.APP_TENANT_ID,
    systemName: env.ALP_SYSTEM_NAME,
    relyingParty: env.IDP_RELYING_PARTY
  }
  env.IDP_AUTO_PROVISION_USERS = true
  env.APP_TENANT_ID = 'tenant-1'
  env.ALP_SYSTEM_NAME = 'alp'
  env.IDP_RELYING_PARTY = 'logto'
  try {
    await fn()
  } finally {
    env.IDP_AUTO_PROVISION_USERS = previous.autoProvision
    env.APP_TENANT_ID = previous.tenantId
    env.ALP_SYSTEM_NAME = previous.systemName
    env.IDP_RELYING_PARTY = previous.relyingParty
  }
}

const run = async () => {
  const stubs = installStubs()

  const req: any = {
    body: { sync: true },
    headers: {
      authorization: makeBearer({
        sub: IDP_USER_ID,
        email: 'researcher@d2e.local',
        // A grant and a revoke in the same pass, so both call shapes are seen.
        roles: [IDP_SCOPE_ROLE.SYSTEM_ADMIN]
      })
    }
  }
  const res: any = {
    statusCode: undefined as number | undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send() {
      return this
    }
  }

  let nextCalled = false
  let nextErr: unknown
  await grantRolesByScopes(req, res, (err?: unknown) => {
    nextCalled = true
    nextErr = err
  })

  return { ...stubs, req, res, nextCalled, nextErr }
}

Deno.test('reconciliation never stamps authz_changed_at', async () => {
  await withEnv(async () => {
    const { groupCalls } = await run()

    // Every register/withdraw issued by the reconciliation must opt out of
    // stamping. Stamping here would invalidate the very token that supplied the
    // claims, costing a forced renewal on every first login.
    assertEquals(groupCalls.length > 0, true)
    for (const call of groupCalls) {
      assertEquals(call.options?.skipAuthzStamp, true, `${call.method} did not pass skipAuthzStamp`)
    }
  })
})

Deno.test('the reconciliation grants and revokes according to token scopes', async () => {
  await withEnv(async () => {
    const { groupCalls } = await run()

    // Sanity: the token carried SYSTEM_ADMIN only, so that role is granted and
    // the other two system roles are revoked. This pins that suppressing the
    // stamp did not suppress the reconciliation itself.
    assertEquals(groupCalls.some(c => c.method === 'register'), true)
    assertEquals(groupCalls.some(c => c.method === 'withdraw'), true)
    assertEquals(groupCalls.every(c => c.userId === USER_ID), true)
  })
})
