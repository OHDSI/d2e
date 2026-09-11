import type { Knex } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { env} from "../../env.ts"
import { initialUserRowId } from './01_user.ts'

const TABLE_NAME = 'user_group'

export const seed = async (knex: Knex): Promise<void> => {
  const data = await getSeeds(knex)
  if (data.length === 0) {
    return
  }

  const trx = await knex.transactionProvider()()
  try {
    for (const row of data) {
      const insert = knex(TABLE_NAME).insert(row)
      const update = knex.queryBuilder().update(row)
      await trx.raw(`? ON CONFLICT (user_id, b2c_group_id) DO ? RETURNING *`, [insert, update])
    }
    trx.commit()
  } catch (err) {
    trx.rollback()
  }
}

const getSeeds = async (knex: Knex): Promise<{ [key: string]: any }[]> => {
  const localUserIds: string[] = []

  // Resolved rather than taken from configuration, so the memberships follow
  // the row the user seed settled on.
  const initialUserId = await initialUserRowId(knex)
  if (initialUserId) {
    localUserIds.push(initialUserId)
  }

  let seeds: any[] = []
  for (const userId of localUserIds) {
    seeds = seeds.concat([
      {
        id: uuidv4(),
        user_id: userId,
        b2c_group_id: 'b68f53f7-b6d5-452a-b717-809726eba5a8'
      },
      {
        id: uuidv4(),
        user_id: userId,
        b2c_group_id: '94cee905-ad0a-44e6-8a3d-43fe3283a5e3'
      }
    ])

    if (env.NODE_ENV === 'development') {
      // LOCALDEV
      seeds = seeds.concat([
        {
          id: uuidv4(),
          user_id: userId,
          b2c_group_id: 'f761a24e-7609-4d28-a787-6b0a9135d824'
        },
        {
          id: uuidv4(),
          user_id: userId,
          b2c_group_id: 'a6478dac-78cd-4238-8360-85b3dcd93283'
        },
        {
          id: uuidv4(),
          user_id: userId,
          b2c_group_id: '5e07ea6e-becc-40ba-8f39-1bfe74d3c9d9'
        },
        {
          id: uuidv4(),
          user_id: userId,
          b2c_group_id: '72b00548-2cbf-48f6-aa68-bbf81864857b'
        },
        // Dashboard viewer and ETL mapping contributor. The identity provider
        // used to hold these for the initial account, and the users table read
        // its roles from there; reading them from these memberships instead
        // silently dropped both, leaving the administrator without access the
        // deployment had always given them.
        {
          id: uuidv4(),
          user_id: userId,
          b2c_group_id: '1792e31c-5dda-467a-9625-31f97cdfb4ec'
        },
        {
          id: uuidv4(),
          user_id: userId,
          b2c_group_id: 'd1c8e5b7-9a0c-4c3b-9c8e-1f2a9e5d6f3a'
        }
      ])
    }
  }

  return seeds
}
