import type { Knex } from '../types'

export async function up(knex: Knex): Promise<void> {
  return knex.schema.withSchema('usermgmt').alterTable('user', (table: Knex.TableBuilder) => {
    table.timestamp('authz_changed_at', { useTz: false }).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.withSchema('usermgmt').alterTable('user', (table: Knex.TableBuilder) => {
    table.dropColumn('authz_changed_at')
  })
}
