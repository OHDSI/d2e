import type { Knex } from '../types'

/**
 * One row per identity-provider subject.
 *
 * Nothing enforced this, and provisioning is a check-then-insert: two requests
 * arriving together both find no row and both create one. The duplicates are
 * not harmless, because the rest of the system reads a user by subject and gets
 * whichever row the database returns first, while group memberships sit on
 * whichever row happened to receive them. The symptom is a user who holds every
 * role and is told "Access denied".
 *
 * Existing duplicates are merged before the constraint is added: memberships
 * move to the oldest row, which is the one that has been referenced longest.
 */
export async function up(knex: Knex): Promise<void> {
  const keeper = `
    select distinct on (idp_user_id) id, idp_user_id
    from usermgmt."user"
    where idp_user_id is not null
    order by idp_user_id, created_date asc, id asc
  `

  // Move memberships the keeper does not already have, then drop the rest.
  await knex.raw(`
    with keep as (${keeper}),
    dupes as (
      select u.id, k.id as keep_id
      from usermgmt."user" u
      join keep k on k.idp_user_id = u.idp_user_id and k.id <> u.id
    )
    update usermgmt.user_group ug
       set user_id = d.keep_id
      from dupes d
     where ug.user_id = d.id
       and not exists (
         select 1 from usermgmt.user_group e
          where e.user_id = d.keep_id and e.b2c_group_id = ug.b2c_group_id
       )
  `)

  await knex.raw(`
    with keep as (${keeper})
    delete from usermgmt.user_group
     where user_id in (
       select u.id from usermgmt."user" u
       join keep k on k.idp_user_id = u.idp_user_id and k.id <> u.id
     )
  `)

  await knex.raw(`
    with keep as (${keeper})
    delete from usermgmt."user" u
     using keep k
     where k.idp_user_id = u.idp_user_id and k.id <> u.id
  `)

  // Partial: rows without a subject are not yet linked to an account and are
  // not duplicates of one another.
  await knex.raw(`
    create unique index if not exists user_idp_user_id_unique
        on usermgmt."user" (idp_user_id)
     where idp_user_id is not null
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('drop index if exists usermgmt.user_idp_user_id_unique')
}
