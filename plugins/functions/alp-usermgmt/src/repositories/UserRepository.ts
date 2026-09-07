import type { Knex } from '../types'
import { Inject,Service } from 'typedi'
import { User } from '../entities'
import { Repository } from './Repository'

export interface UserCriteria {
  id: string
  username: string
  idp_user_id: string
}

export interface UserField {
  id: string
  username: string
  idp_user_id: string
  active: boolean
  authz_changed_at: Date | null
}

@Service()
export class UserRepository extends Repository<User, UserCriteria> {
  constructor(@Inject('DB_CONNECTION') public readonly db: Knex) {
    super(db)
  }

  reducer({ id, username, idp_user_id, active, authz_changed_at }: UserField) {
    return new User({
      id,
      username,
      idpUserId: idp_user_id,
      active,
      authzChangedAt: authz_changed_at ?? null
    })
  }
}
