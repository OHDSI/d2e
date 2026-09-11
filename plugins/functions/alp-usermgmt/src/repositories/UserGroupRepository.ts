import type { Knex } from '../types'
import { Inject,Service } from 'typedi'
import { UserGroup } from '../entities'
import { UserGroupExt } from '../dtos'
import { Repository } from './Repository'

export interface UserGroupCriteria {
  id: string | string[]
  user_id: string | string[]
  b2c_group_id: string | string[]
}

export interface UserGroupExtCriteria extends UserGroupCriteria {
  username: string | string[]
  tenant_id: string | string[]
  study_id: string | string[]
  system: string | string[]
  role: string | string[]
}

export const UserGroupExtCriteriaKeys: (keyof UserGroupExtCriteria)[] = [
  'id',
  'user_id',
  'b2c_group_id',
  'username',
  'tenant_id',
  'study_id',
  'system',
  'role'
]

export interface UserGroupField {
  id: string
  user_id: string
  b2c_group_id: string
}

interface UserGroupExtField extends UserGroupField {
  username: string
  role: string
  tenant_id: string | null
  study_id: string | null
  system: string | null
  active: boolean
}

@Service()
export class UserGroupRepository extends Repository<UserGroup, UserGroupCriteria> {
  constructor(@Inject('DB_CONNECTION') public readonly db: Knex) {
    super(db)
  }

  async getGroupsByUser(
    userId: string,
    tenantId?: string,
    system?: string,
    trx?: Knex
  ): Promise<UserGroupExt[]> {
    // Reading through the caller's transaction matters when memberships are being
    // withdrawn in bulk: the deletes are not committed yet, so the default
    // connection would still report groups the user is in the middle of losing.
    const query = (trx || this.db)(this.tableName)
      .innerJoin('b2c_group', 'user_group.b2c_group_id', 'b2c_group.id')
      .innerJoin('user', 'user.id', 'user_group.user_id')
      .where('user_id', userId)
      .select(`${this.tableName}.*`, 'user.username', 'b2c_group.role', 'b2c_group.tenant_id', 'b2c_group.study_id')

    if (tenantId) {
      query.where(q => q.where('b2c_group.tenant_id', tenantId).orWhereNull('b2c_group.tenant_id'))
    }

    if (system) {
      query.where(q => q.where('b2c_group.system', system).orWhereNull('b2c_group.system'))
    }

    return await query.then(result => result.map(row => this.mapToUserGroupExt(row)))
  }

  async getUserGroupExtList(
    criteria: { [key in keyof UserGroupExtCriteria]?: UserGroupExtCriteria[key] } = {}
  ): Promise<UserGroupExt[]> {
    const query = this.db('user')
      .leftJoin('user_group', 'user.id', 'user_group.user_id')
      .leftJoin('b2c_group', 'b2c_group.id', 'user_group.b2c_group_id')
      .select(
        `${this.tableName}.*`,
        { user_id: 'user.id' },
        'user.username',
        'b2c_group.role',
        'b2c_group.tenant_id',
        'b2c_group.study_id',
        'b2c_group.system',
        'user.active'
      )

    Object.keys(criteria).forEach((c: string) => {
      let field: string
      switch (c) {
        case 'username':
          field = 'user.username'
          break
        case 'tenant_id':
          field = 'b2c_group.tenant_id'
          break
        case 'study_id':
          field = 'b2c_group.study_id'
          break
        case 'system':
          field = 'b2c_group.system'
          break
        case 'role':
          field = 'b2c_group.role'
          break
        default:
          field = `user_group.${c}`
          break
      }

      if (Array.isArray(criteria[c as keyof UserGroupExtCriteria])) {
        query.whereIn(field, criteria[c as keyof UserGroupExtCriteria] as any)
      } else {
        query.where(field, criteria[c as keyof UserGroupExtCriteria] as any)
      }
    })

    return await query.then(result => result.map(row => this.mapToUserGroupExt(row)) || [])
  }

  reducer({ id, user_id, b2c_group_id }: UserGroupField): UserGroup {
    return new UserGroup({
      id,
      userId: user_id,
      b2cGroupId: b2c_group_id
    })
  }

  mapToUserGroupExt({
    id,
    user_id,
    username,
    b2c_group_id,
    role,
    tenant_id,
    study_id,
    system,
    active
  }: UserGroupExtField): UserGroupExt {
    return new UserGroupExt({
      id,
      userId: user_id,
      username,
      b2cGroupId: b2c_group_id,
      role,
      tenantId: tenant_id,
      studyId: study_id,
      system,
      active
    })
  }
}
