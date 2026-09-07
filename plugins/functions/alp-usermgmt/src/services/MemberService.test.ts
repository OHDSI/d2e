/**
 * Covers the deactivation gap: activateUser (used for both activate and
 * deactivate) must stamp `authz_changed_at` inside the same transaction as the
 * DB update, the same way UserGroupService's grant/withdraw paths do (see
 * `authz-stamping.test.ts`) — otherwise a token issued before a deactivation
 * keeps working until it expires.
 *
 * Run: deno test --allow-env --no-check src/services/MemberService.test.ts
 */
import { assertEquals } from '@std/assert'

// Must be set before the service modules are evaluated: env.ts captures
// USER_MGMT__IDP_SUBJECT_PROP into a module-level const at import time.
Deno.env.set('USER_MGMT__IDP_SUBJECT_PROP', 'sub')

const { Container } = await import('typedi')
const { CONTAINER_KEY } = await import('../const.ts')
const { MemberService } = await import('./MemberService.ts')

const USER_ID = 'db-user-1'
const IDP_USER_ID = 'idp-user-1'

type UpdateCall = { field: any; trx: any }
type StampCall = { userId: string; trx: any }

/** A knex transaction stand-in: only commit/rollback are ever called on it. */
const makeTrx = () => ({ __trx: true, commit: () => Promise.resolve(), rollback: () => Promise.resolve() })

/**
 * Builds a MemberService with only the collaborators activateUser touches.
 * `Object.create` skips the constructor and its typedi-injected parameter
 * properties, so they're supplied directly — same approach as
 * `authz-stamping_test.ts` uses for UserGroupService, and for the same
 * reason: constructing through `Container.get(MemberService)` requires
 * reflect-metadata support this Deno test run doesn't have.
 */
const installStubs = () => {
  const updates: UpdateCall[] = []
  const stamped: StampCall[] = []
  const activateCalls: { idpUserId: string; active: boolean }[] = []
  const trx = makeTrx()

  const service: any = Object.create(MemberService.prototype)
  service.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
  service.userService = {
    getUser: () => Promise.resolve({ id: USER_ID, idpUserId: IDP_USER_ID }),
    updateUser: (field: any, t: any) => {
      updates.push({ field, trx: t })
      return Promise.resolve()
    },
    touchAuthzChangedAt: (userId: string, t: any) => {
      stamped.push({ userId, trx: t })
      return Promise.resolve()
    }
  }
  service.logtoApi = {
    activateUser: (idpUserId: string, active: boolean) => {
      activateCalls.push({ idpUserId, active })
      return Promise.resolve()
    }
  }

  Container.set(CONTAINER_KEY.DB_CONNECTION, {
    transactionProvider: () => () => Promise.resolve(trx)
  })

  return { service, updates, stamped, activateCalls, trx }
}

Deno.test('activateUser stamps authz_changed_at inside the transaction when deactivating', async () => {
  const { service, stamped, trx } = installStubs()

  await service.activateUser({ userId: USER_ID, active: false })

  assertEquals(stamped, [{ userId: USER_ID, trx }])
})

Deno.test('activateUser stamps authz_changed_at inside the transaction when activating', async () => {
  const { service, stamped, trx } = installStubs()

  await service.activateUser({ userId: USER_ID, active: true })

  assertEquals(stamped, [{ userId: USER_ID, trx }])
})

Deno.test('activateUser stamps before syncing to Logto, and updates the DB row first', async () => {
  const { service, updates, stamped, activateCalls } = installStubs()

  await service.activateUser({ userId: USER_ID, active: false })

  assertEquals(updates, [{ field: { id: USER_ID, active: false }, trx: stamped[0].trx }])
  assertEquals(activateCalls, [{ idpUserId: IDP_USER_ID, active: false }])
})
