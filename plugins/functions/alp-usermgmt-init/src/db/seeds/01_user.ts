import type { Knex } from '../types'
import { env } from "../../env.ts"
import { ensureSeedAccount, seedEmail } from "../../idp/seedAccount.ts"

const TABLE_NAME = 'user'

export const seed = async (knex: Knex): Promise<void> => {
  if (!env.IDP__INITIAL_USER__UUID || !env.IDP__INITIAL_USER__NAME) {
    return
  }

  const account = await ensureSeedAccount()
  if (!account) {
    // No IdP to reconcile against (or the account could not be resolved). Seed
    // the row as before so a deployment whose IdP holds the subject itself is
    // unaffected, but only when nothing has been created yet.
    await seedWithoutIdp(knex)
    return
  }

  // Keyed on the subject rather than the username: the subject is what
  // propagates group memberships to the IdP, so a row already carrying it is
  // correct whatever it happens to be called.
  const bySubject = await knex(TABLE_NAME).where({ idp_user_id: account.idpUserId }).first()
  if (bySubject) {
    return
  }

  // A sign-in before this ran will have created the user already. Adopting that
  // row is what keeps the grants and the account on one identity; inserting
  // alongside it is how the seeded user ends up holding every group while the
  // one that actually signs in holds none.
  const existing =
    (await knex(TABLE_NAME).where({ id: env.IDP__INITIAL_USER__UUID }).first()) ??
    (await knex(TABLE_NAME).where({ username: account.email }).first()) ??
    (await knex(TABLE_NAME).where({ username: env.IDP__INITIAL_USER__NAME }).first())

  if (existing) {
    await knex(TABLE_NAME)
      .where({ id: existing.id })
      .update({ idp_user_id: account.idpUserId })
    return
  }

  await knex(TABLE_NAME).insert({
    id: env.IDP__INITIAL_USER__UUID,
    // The configured name rather than the email the account is registered
    // under: the subject links the two, and this is what the portal displays.
    username: env.IDP__INITIAL_USER__NAME,
    idp_user_id: account.idpUserId,
  })
}

const seedWithoutIdp = async (knex: Knex): Promise<void> => {
  const record = await knex(TABLE_NAME).limit(1).count()
  if (record?.length > 0 && (record[0]['count'] as number) > 0) {
    return
  }

  await knex(TABLE_NAME).insert({
    id: env.IDP__INITIAL_USER__UUID,
    username: env.IDP__INITIAL_USER__NAME,
  })
}

/**
 * The row the initial account ended up on, which is not necessarily the
 * configured id: a sign-in before the seed ran creates the user first and this
 * seed adopts that row. The group seed has to attach memberships to the same
 * row, or they land on a user that nothing authenticates as.
 */
export const initialUserRowId = async (knex: Knex): Promise<string | undefined> => {
  if (!env.IDP__INITIAL_USER__UUID || !env.IDP__INITIAL_USER__NAME) {
    return undefined
  }
  const configured = await knex(TABLE_NAME).where({ id: env.IDP__INITIAL_USER__UUID }).first()
  if (configured) {
    return configured.id
  }
  const email = seedEmail(env.IDP__INITIAL_USER__NAME)
  const adopted =
    (await knex(TABLE_NAME).where({ username: email }).first()) ??
    (await knex(TABLE_NAME).where({ username: env.IDP__INITIAL_USER__NAME }).first())
  return adopted?.id
}
