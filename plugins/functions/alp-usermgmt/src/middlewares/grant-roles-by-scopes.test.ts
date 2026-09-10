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
const { CONTAINER_KEY, IDP_SCOPE_ROLE, ROLES } = await import('../const.ts')
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

type GroupCall = { method: 'register' | 'withdraw'; userId: string; groupId: string; options: any }

/**
 * The group ids the B2cGroupService stub below hands back, so an assertion can
 * name the role it expects rather than settling for "something was registered".
 */
const groupFor = (role: string) => `group-for-${role}`

/** Group ids seen for one call shape, sorted so assertions can compare exactly. */
const groupIds = (calls: GroupCall[], method: GroupCall['method']) =>
  calls.filter(c => c.method === method).map(c => c.groupId).sort()

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
    registerUserToGroup: (userId: string, groupId: string, _trx: any, options: any) => {
      groupCalls.push({ method: 'register', userId, groupId, options })
      return Promise.resolve()
    },
    withdrawUserFromGroup: (userId: string, groupId: string, _trx: any, options: any) => {
      groupCalls.push({ method: 'withdraw', userId, groupId, options })
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
const withEnv = async (fn: () => Promise<void>, groupRoleMapping = '{}') => {
  const previous = {
    autoProvision: env.IDP_AUTO_PROVISION_USERS,
    tenantId: env.APP_TENANT_ID,
    systemName: env.ALP_SYSTEM_NAME,
    relyingParty: env.IDP_RELYING_PARTY,
    groupRoleMapping: env.IDP_GROUP_ROLE_MAPPING
  }
  env.IDP_AUTO_PROVISION_USERS = true
  env.APP_TENANT_ID = 'tenant-1'
  env.ALP_SYSTEM_NAME = 'alp'
  env.IDP_RELYING_PARTY = 'logto'
  env.IDP_GROUP_ROLE_MAPPING = groupRoleMapping
  try {
    await fn()
  } finally {
    env.IDP_AUTO_PROVISION_USERS = previous.autoProvision
    env.APP_TENANT_ID = previous.tenantId
    env.ALP_SYSTEM_NAME = previous.systemName
    env.IDP_RELYING_PARTY = previous.relyingParty
    env.IDP_GROUP_ROLE_MAPPING = previous.groupRoleMapping
  }
}

const run = async (tokenOverrides: Record<string, unknown> = {}) => {
  const stubs = installStubs()

  const req: any = {
    body: { sync: true },
    headers: {
      authorization: makeBearer({
        sub: IDP_USER_ID,
        email: 'researcher@d2e.local',
        // A grant and a revoke in the same pass, so both call shapes are seen.
        roles: [IDP_SCOPE_ROLE.SYSTEM_ADMIN],
        ...tokenOverrides
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

    // The token carried SYSTEM_ADMIN only, so that role is granted and the other
    // two system roles are revoked. This pins that suppressing the stamp did not
    // suppress the reconciliation itself.
    assertEquals(groupIds(groupCalls, 'register'), [groupFor(ROLES.ALP_SYSTEM_ADMIN)])
    assertEquals(
      groupIds(groupCalls, 'withdraw'),
      [groupFor(ROLES.ALP_DASHBOARD_VIEWER), groupFor(ROLES.ALP_USER_ADMIN)].sort()
    )
    assertEquals(groupCalls.every(c => c.userId === USER_ID), true)
  })
})

Deno.test('idp_groups from a federated session are mapped to roles and granted', async () => {
  const mapping = JSON.stringify({ entra: { [IDP_SCOPE_ROLE.USER_ADMIN]: 'group-guid-1' } })

  await withEnv(async () => {
    // Token carries no `roles`/`scope` claim at all here, so USER_ADMIN can only
    // come from the idp_groups -> role mapping wired into the same scopes list.
    const { groupCalls } = await run({ roles: undefined, idp_groups: ['group-guid-1'], idp_provider: 'entra' })

    // USER_ADMIN specifically -- not merely "a registration happened". This is
    // what would fail if the mapper resolved the group to the wrong role.
    assertEquals(groupIds(groupCalls, 'register'), [groupFor(ROLES.ALP_USER_ADMIN)])
    assertEquals(
      groupIds(groupCalls, 'withdraw'),
      [groupFor(ROLES.ALP_DASHBOARD_VIEWER), groupFor(ROLES.ALP_SYSTEM_ADMIN)].sort()
    )
    assertEquals(groupCalls.every(c => c.userId === USER_ID), true)
  }, mapping)
})

Deno.test('idp_groups from a provider not present in the mapping grant nothing extra', async () => {
  const mapping = JSON.stringify({ entra: { [IDP_SCOPE_ROLE.USER_ADMIN]: 'group-guid-1' } })

  await withEnv(async () => {
    // Same group id, but the token says it came from a different provider than
    // the one configured for it, so it must not be honoured.
    const { groupCalls } = await run({ roles: [], idp_groups: ['group-guid-1'], idp_provider: 'physionet' })

    assertEquals(groupIds(groupCalls, 'register'), [])
    // Every system role is revoked: the token carried no scopes and the mapping
    // contributed none, so nothing is left to grant.
    assertEquals(
      groupIds(groupCalls, 'withdraw'),
      [groupFor(ROLES.ALP_DASHBOARD_VIEWER), groupFor(ROLES.ALP_SYSTEM_ADMIN), groupFor(ROLES.ALP_USER_ADMIN)].sort()
    )
  }, mapping)
})

Deno.test('a native login (no idp_groups/idp_provider claims) is unaffected by the mapping', async () => {
  const mapping = JSON.stringify({ entra: { [IDP_SCOPE_ROLE.USER_ADMIN]: 'group-guid-1' } })

  await withEnv(async () => {
    // No idp_groups/idp_provider claims at all -- native password login shape.
    const { groupCalls } = await run({ roles: [IDP_SCOPE_ROLE.SYSTEM_ADMIN] })

    // Exactly the token's own SYSTEM_ADMIN is granted. USER_ADMIN -- the role the
    // configured mapping would have added for a federated session -- is revoked,
    // which is what proves the mapping contributed nothing here.
    assertEquals(groupIds(groupCalls, 'register'), [groupFor(ROLES.ALP_SYSTEM_ADMIN)])
    assertEquals(
      groupIds(groupCalls, 'withdraw'),
      [groupFor(ROLES.ALP_DASHBOARD_VIEWER), groupFor(ROLES.ALP_USER_ADMIN)].sort()
    )
    assertEquals(groupCalls.every(c => c.userId === USER_ID), true)
  }, mapping)
})

Deno.test('a malformed IDP__GROUP_ROLE_MAPPING does not crash the request', async () => {
  await withEnv(async () => {
    const { groupCalls, res } = await run({ idp_groups: ['group-guid-1'], idp_provider: 'entra' })

    // Bad config is treated as "no mapping" -- request handling proceeds and
    // still reconciles the roles the token's own scopes describe.
    assertEquals(res.statusCode, undefined)
    assertEquals(groupIds(groupCalls, 'register'), [groupFor(ROLES.ALP_SYSTEM_ADMIN)])
    assertEquals(
      groupIds(groupCalls, 'withdraw'),
      [groupFor(ROLES.ALP_DASHBOARD_VIEWER), groupFor(ROLES.ALP_USER_ADMIN)].sort()
    )
  }, '{not valid json')
})
