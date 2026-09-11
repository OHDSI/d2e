import type { Knex } from '../types'
import { Container, Service } from 'typedi'
import { v4 as uuidv4 } from 'uuid'
import {
  CONTAINER_KEY,
  ROLES,
  LOGTO_ROLES,
  LOGTO_ROLE_NAMES,
  LOGTO_TO_INTERNAL_ROLES,
  datasetResearcherScopes
} from '../const'
import { UserGroup } from '../entities'
import { UserGroupExt } from '../dtos'
import { UserGroupCriteria, UserGroupExtCriteria, UserGroupField, UserGroupRepository } from '../repositories'
import { B2cGroupService } from './B2cGroupService'
import { UserService } from './UserService'
import { IPortalDataset, ITokenUser, RoleMap, UserGroupMetadata } from '../types'
import { createLogger } from '../Logger'
import { LogtoAPI, PortalAPI, TrexIdpAPI } from '../api'
import { env, getAutoGrantDatasetCodes } from '../env'

export type SyncRoleResult =
  | { status: 'synced' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }

/**
 * Which identity provider holds role assignments. Logto remains selectable for a
 * deployment that has not migrated; anything unrecognised means trex, so a typo
 * fails towards the provider this system now authenticates against.
 */
export function resolveRoleStore(raw: string | undefined): 'trex' | 'logto' {
  return raw === 'logto' ? 'logto' : 'trex'
}

// LOGTO__ROLES_SCOPES (docker-compose.yml) paired these Logto roles with extra
// scopes that are webapi.sec_role names in their own right, not Logto/trex
// role names. That pairing lived only in Logto's configuration, so it has to
// be reproduced here for those names to keep reaching WebAPI.
const IMPLIED_CANONICAL_ROLES: Record<string, string[]> = {
  'role.systemadmin': ['admin'],
  'role.viewer': ['anonymous']
}

/**
 * The canonical names one group grants, from the Logto role and scope pair.
 *
 * Logto forbade spaces in scope names, so d2e stored `cohort-reader` and
 * `source-user-<id>` and had LOGTO__CUSTOM_JWT rewrite them into the token. trex
 * has no such limit, so the names webapi.sec_role actually holds are stored
 * directly and no rewriting stage is needed.
 *
 * The scope set is what carried authorization, so every scope becomes a name:
 * dropping any of them would quietly remove access.
 */
export function canonicalRoleNames(role: string, scopes: string[]): string[] {
  const sourceUser = /^source-user-(.+)$/
  const kebab: Record<string, string> = {
    'cohort-reader': 'cohort reader',
    'cohort-creator': 'cohort creator',
    'concept-set-creator': 'concept set creator'
  }

  const expand = (name: string): string => {
    const match = sourceUser.exec(name)
    if (match) return `Source user (${match[1]})`
    // Unknown scopes pass through: a name nothing maps is recoverable, a
    // dropped grant is not.
    return kebab[name] ?? name
  }

  const input = [role, ...scopes]
  const implied = input.flatMap(name => IMPLIED_CANONICAL_ROLES[name] ?? [])

  return [...new Set([...input, ...implied].map(expand))]
}

/**
 * The names to actually revoke when a group is removed.
 *
 * A group expands to several trex role names, and the WebAPI ones -
 * `cohort reader`, `cohort creator`, `concept set creator` - are identical for
 * every dataset a user researches, so revoking the whole expansion strips
 * permissions the user's remaining groups still grant. Logto never had this
 * problem: it removed one dataset-scoped role and left the rest alone.
 *
 * `others` is every remaining membership as its own (role, scopes) pair.
 */
export function removableRoleNames(
  removed: { role: string; scopes: string[] },
  others: Array<{ role: string; scopes: string[] }>
): string[] {
  const retained = new Set(others.flatMap(o => canonicalRoleNames(o.role, o.scopes)))
  return canonicalRoleNames(removed.role, removed.scopes).filter(name => !retained.has(name))
}

@Service()
export class UserGroupService {
  private readonly logger = createLogger(this.constructor.name)

  constructor(
    private readonly portalAPI: PortalAPI,
    private readonly userGroupRepo: UserGroupRepository,
    private readonly groupService: B2cGroupService,
    private readonly userService: UserService,
    private readonly logtoAPI: LogtoAPI,
    private readonly trexIdpAPI: TrexIdpAPI
  ) {}

  async getUserGroupsMetadataByIdpUserId(
    idpUserId: string,
    tenantId?: string,
    system?: string
  ): Promise<UserGroupMetadata> {
    if (env.USER_MGMT_ROLE_SOURCE === 'logto') {
      return this.getUserGroupsMetadataFromLogto(idpUserId)
    }

    const user = await this.userService.getUserByIdpUserId(idpUserId)
    if (!user) {
      throw new Error(`IDP user ID ${idpUserId} not found`)
    }
    return this.getUserGroupsMetadata(user.id, tenantId, system)
  }

  private async getUserGroupsMetadata(userId: string, tenantId?: string, system?: string): Promise<UserGroupMetadata> {
    if (!userId) return {} as UserGroupMetadata

    const groups = await this.userGroupRepo.getGroupsByUser(userId, tenantId, system)
    const alpInfo = this.extractTenantAndRoles(groups)

    const result: UserGroupMetadata = {
      userId,
      groups: groups.map(group => B2cGroupService.getDisplayName(group.role, group.tenantId, group.studyId)),
      alpRoleMap: {
        ALP_USER_ADMIN: alpInfo.alp_role_user_admin,
        ALP_SYSTEM_ADMIN: alpInfo.alp_role_system_admin,
        ALP_DASHBOARD_VIEWER: alpInfo.alp_role_dashboard_viewer,
        TENANT_ADMIN: alpInfo.alp_role_tenant_admin,
        TENANT_VIEWER: alpInfo.alp_role_tenant_viewer,
        STUDY_RESEARCHER: alpInfo.alp_role_study_researcher,
        STUDY_WRITE_DQD_RESEARCHER: alpInfo.alp_role_study_write_dqd_researcher,
        STUDY_RESULTS_READ_RESEARCHER: alpInfo.alp_role_study_results_read_researcher,
        ETL_MAPPING_CONTRIBUTOR: alpInfo.alp_role_etl_mapping_contributor
      },
      ...alpInfo
    }
    return result
  }

  async getUserGroupExtList(
    criteria: { [key in keyof UserGroupExtCriteria]?: UserGroupExtCriteria[key] } = {}
  ): Promise<UserGroupExt[]> {
    return await this.userGroupRepo.getUserGroupExtList(criteria)
  }

  async getUserGroup(userId: string, b2cGroupId: string): Promise<UserGroup | undefined> {
    const criteria: Partial<UserGroupCriteria> = { user_id: userId, b2c_group_id: b2cGroupId }
    return await this.userGroupRepo.getOne(criteria)
  }

  async getUserGroups(userId: string, trx?: Knex): Promise<UserGroupExt[]> {
    return await this.userGroupRepo.getGroupsByUser(userId, undefined, undefined, trx)
  }

  async userGroupExists(userId: string, b2cGroupId: string, trx?: Knex): Promise<boolean> {
    const criteria: Partial<UserGroupCriteria> = { user_id: userId, b2c_group_id: b2cGroupId }
    return await this.userGroupRepo.exists(criteria, trx)
  }

  async isExistingMember(username: string, tenantId: string): Promise<boolean> {
    const userGroups = await this.userGroupRepo.getUserGroupExtList({ username, tenant_id: tenantId })
    return userGroups.length > 0
  }

  async registerUserToGroup(
    userId: string,
    groupId: string,
    trx?: Knex,
    options?: { skipUserValidation?: boolean; skipAuthzStamp?: boolean }
  ): Promise<undefined> {
    this.logger.debug(`Register user ${userId} to group ${groupId}`)

    const opt = options || {}
    const user = await this.userService.getUser(userId, trx)
    if (!opt.skipUserValidation && !user) {
      this.logger.error(`Skip registering user ${userId} to group ${groupId}. User does not exist`)
      throw Error(`User ${userId} does not exist`)
    }

    // An existing membership still gets synced. The row and the identity
    // provider's roles are two stores that can disagree — a sync that failed
    // once leaves the membership recorded and the role never granted — and
    // returning here made that permanent, because every retry saw the row and
    // skipped the only step that was actually missing.
    const userGroup = await this.getUserGroup(userId, groupId)
    if (!userGroup) {
      await this.addUserToGroup(userId, groupId, trx)
      if (!opt.skipAuthzStamp) {
        await this.userService.touchAuthzChangedAt(userId, trx)
      }
    } else {
      this.logger.info(`User ${userId} already in group ${groupId}; reconciling roles only`)
    }

    const sync = await this.syncRoleToLogto(userId, groupId, 'assign')
    if (sync.status === 'failed') {
      // Reported rather than swallowed: a caller that is told the grant
      // succeeded has no reason to look, and the account silently never gets
      // the access it was granted.
      throw new Error(
        `Registered user ${userId} to group ${groupId} but the role did not reach the identity provider: ${sync.reason}`
      )
    }
  }

  async addUserToGroup(userId: string, groupId: string, trx?: Knex) {
    this.logger.info(`Add user ${userId} to group ${groupId}`)

    const tokenUser = Container.get<ITokenUser>(CONTAINER_KEY.CURRENT_USER)

    const newUserGroup: Partial<UserGroupField> = {
      id: uuidv4(),
      user_id: userId,
      b2c_group_id: groupId
    }
    return await this.userGroupRepo.create(newUserGroup, tokenUser, trx)
  }

  async registerUsersToGroups(userIds: string[], groupIds: string[]): Promise<{ userId: string }[]> {
    const result: { userId: string }[] = []
    this.logger.debug(`Register user ${JSON.stringify(userIds)} to group ${JSON.stringify(groupIds)}`)

    const trx = await this.userGroupRepo.getTransaction()
    try {
      for (const userId of userIds) {
        for (const groupId of groupIds) {
          await this.registerUserToGroup(userId, groupId, trx)
          result.push({ userId })
        }
      }
      trx.commit()
      return result
    } catch (err) {
      trx.rollback()
      throw err
    }
  }

  async withdrawUserFromGroup(
    userId: string,
    groupId: string,
    trx?: Knex,
    options?: { skipAuthzStamp?: boolean }
  ): Promise<undefined> {
    const userGroup = await this.getUserGroup(userId, groupId)
    if (!userGroup) {
      this.logger.warn(`User ${userId} does not belong to group ${groupId}`)
      return
    }

    await this.userGroupRepo.delete({ user_id: userId, b2c_group_id: groupId }, trx)
    if (!options?.skipAuthzStamp) {
      await this.userService.touchAuthzChangedAt(userId, trx)
    }
    await this.syncRoleToLogto(userId, groupId, 'remove', trx)
  }

  async withdrawUserFromGroups(userId: string, groupIds: string[]): Promise<void> {
    this.logger.info(`Withdrawing user ${userId} from groups ${JSON.stringify(groupIds)}`)

    const trx = await this.userGroupRepo.getTransaction()
    try {
      for (const groupId of groupIds) {
        this.logger.debug(`Withdrawing user ${userId} from group ${groupId}`)
        await this.withdrawUserFromGroup(userId, groupId, trx)
      }
      await trx.commit()
    } catch (err) {
      await trx.rollback()
      throw err
    }
  }

  async withdrawUserFromTenant(userId: string, tenantId: string): Promise<void> {
    this.logger.info(`Withdrawing user ${userId} from tenant ${tenantId}`)

    const groups = await this.getUserGroupExtList({ user_id: userId, tenant_id: tenantId })
    this.logger.debug(`Withdrawing user ${userId} from groups ${JSON.stringify(groups)}`)

    const groupIds = groups.map(g => g.b2cGroupId)
    await this.withdrawUserFromGroups(userId, groupIds)
  }

  async isRole(userId: string, role: string): Promise<boolean> {
    if (!userId) return false
    if (!role) return false

    const userGroups = await this.userGroupRepo.getList({ user_id: userId })
    if (userGroups.length === 0) return false

    const groupIds = userGroups.map(ug => ug.b2cGroupId)
    const groups = await this.groupService.getGroupsByIds(groupIds)
    return groups.some(g => g.role === role)
  }

  private extractTenantAndRoles = (groups: UserGroupExt[]) => {
    const tenantIds = groups
      .filter(group => !!group.tenantId)
      .map(group => group.tenantId!)
      .filter((tenantId, index, self) => self.indexOf(tenantId) === index)

    const fn = (role: string, prop: 'tenantId' | 'studyId') =>
      groups.filter(group => group.role === role).map(group => group[prop]!)

    const roleMap: RoleMap = {
      alp_tenant_id: tenantIds,
      alp_role_user_admin: groups.some(group => group.role === ROLES.ALP_USER_ADMIN),
      alp_role_system_admin: groups.some(group => group.role === ROLES.ALP_SYSTEM_ADMIN),
      alp_role_dashboard_viewer: groups.some(group => group.role === ROLES.ALP_DASHBOARD_VIEWER),
      alp_role_study_write_dqd_researcher: groups.some(group => group.role === ROLES.STUDY_WRITE_DQD_RESEARCHER),
      alp_role_study_results_read_researcher: groups.some(group => group.role === ROLES.STUDY_RESULTS_READ_RESEARCHER),
      alp_role_etl_mapping_contributor: groups.some(group => group.role === ROLES.ETL_MAPPING_CONTRIBUTOR),
      alp_role_tenant_admin: fn(ROLES.TENANT_ADMIN, 'tenantId'),
      alp_role_tenant_viewer: fn(ROLES.TENANT_VIEWER, 'tenantId'),
      alp_role_study_admin: fn(ROLES.STUDY_ADMIN, 'studyId'),
      alp_role_study_researcher: fn(ROLES.STUDY_RESEARCHER, 'studyId')
    }

    return roleMap
  }

  // Sync role assignment/removal to Logto
  async syncRoleToLogto(
    userId: string,
    groupId: string,
    action: 'assign' | 'remove',
    trx?: Knex
  ): Promise<SyncRoleResult> {
    try {
      const user = await this.userService.getUser(userId)
      if (!user?.idpUserId) {
        const reason = `User ${userId} has no idpUserId`
        this.logger.warn(`${reason}, skipping Logto sync`)
        return { status: 'skipped', reason }
      }

      const group = await this.groupService.getGroup(groupId)
      if (!group) {
        const reason = `Group ${groupId} not found`
        this.logger.warn(`${reason}, skipping Logto sync`)
        return { status: 'skipped', reason }
      }

      const logtoRole = await this.buildLogtoRoleName(group)
      if (!logtoRole) {
        return { status: 'skipped', reason: `Could not resolve Logto role for group ${groupId}` }
      }

      const { role, scopes } = logtoRole

      const store = resolveRoleStore(env.IDP_ROLE_STORE)
      // One group is one Logto role plus its scopes, but several trex roles:
      // trex has no scope concept, so each name is stored in its own right.
      const names = canonicalRoleNames(role, scopes)

      if (action === 'assign') {
        if (store === 'trex') {
          await this.trexIdpAPI.assignRolesToUser(user.idpUserId, names)
        } else {
          await this.logtoAPI.assignRoleToUser(user.idpUserId, role, scopes)
        }
        this.logger.info(`Assigned ${names.length} role(s) to user ${user.idpUserId} in ${store}`)
      } else {
        if (store === 'trex') {
          const removable = removableRoleNames(
            { role, scopes },
            await this.otherGroupExpansions(userId, groupId, trx)
          )
          await this.trexIdpAPI.removeRolesFromUser(user.idpUserId, removable)
          this.logger.info(
            `Removed ${removable.length} of ${names.length} role(s) from user ${user.idpUserId} in ${store}; ` +
              `${names.length - removable.length} still granted by other groups`
          )
        } else {
          await this.logtoAPI.removeRoleFromUser(user.idpUserId, role)
          this.logger.info(`Removed ${names.length} role(s) from user ${user.idpUserId} in ${store}`)
        }
      }
      return { status: 'synced' }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to sync role to Logto for user ${userId}, group ${groupId}: ${reason}`)
      return { status: 'failed', reason }
    }
  }

  /**
   * Every remaining membership of the user's, expanded to its (role, scopes) pair.
   *
   * Feeds removableRoleNames, which decides what a withdrawal may actually
   * revoke.
   *
   * `removedGroupId` is excluded explicitly rather than relying on the delete
   * that precedes this call: bulk withdrawal deletes inside an open transaction,
   * so the row can still be visible. Passing that transaction through is what
   * makes withdrawing several groups at once come out right - each step sees the
   * earlier deletes, so the last researcher group leaving does drop the shared
   * names.
   */
  private async otherGroupExpansions(
    userId: string,
    removedGroupId: string,
    trx?: Knex
  ): Promise<Array<{ role: string; scopes: string[] }>> {
    const others = (await this.getUserGroups(userId, trx)).filter(g => g.b2cGroupId !== removedGroupId)
    const expansions: Array<{ role: string; scopes: string[] }> = []

    for (const other of others) {
      const resolved = await this.buildLogtoRoleName(other)
      if (resolved) expansions.push(resolved)
    }
    return expansions
  }

  /**
   * Build Logto role name from group
   * Includes dataset context for scoped roles
   */
  private async buildLogtoRoleName(group: {
    role: string
    studyId?: string | null
  }): Promise<{ role: string; scopes: string[] } | null> {
    const { role, studyId: datasetId } = group
    const logtoRole = LOGTO_ROLE_NAMES[role] || role

    // Dataset-scoped roles need dataset code suffix
    if (role === ROLES.STUDY_RESEARCHER && datasetId) {
      const datasets = await this.portalAPI.getDatasets()
      const dataset = datasets.find(d => d.id === datasetId)
      if (dataset?.tokenStudyCode) {
        const name = `${logtoRole}.${dataset.tokenStudyCode}`
        return {
          role: name,
          scopes: datasetResearcherScopes(name, datasetId, dataset.type)
        }
      }
      this.logger.warn(`Dataset ${datasetId} has no token_dataset_code, skipping Logto sync`)
      return null
    }

    return { role: logtoRole, scopes: [logtoRole] }
  }

  /**
   * Get user groups metadata from Logto roles
   * Parses Logto role names to extract role type and tenant/study context
   */
  private async getUserGroupsMetadataFromLogto(idpUserId: string): Promise<UserGroupMetadata> {
    const authHeader = Container.get<string>(CONTAINER_KEY.AUTHORIZATION_HEADER)
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    const tokenRoles: string[] = payload.roles || []

    const roleMap: RoleMap = {
      alp_role_user_admin: false,
      alp_role_system_admin: false,
      alp_role_dashboard_viewer: false,
      alp_role_study_write_dqd_researcher: false,
      alp_role_study_results_read_researcher: false,
      alp_role_etl_mapping_contributor: false,
      alp_role_tenant_viewer: [],
      alp_role_study_researcher: [],
      // TODO: remove deprecated roles
      alp_tenant_id: [env.APP_TENANT_ID],
      alp_role_tenant_admin: [env.APP_TENANT_ID],
      alp_role_study_admin: []
    }

    const groups: string[] = []
    const logtoRoleValues = Object.values(LOGTO_ROLES) as string[]

    let datasetsByCodePromise: Promise<Map<string, IPortalDataset>> | null = null
    const getDatasetsByCode = () => {
      if (!datasetsByCodePromise) {
        datasetsByCodePromise = this.portalAPI
          .getDatasets()
          .then(datasets => new Map(datasets.map(d => [d.tokenStudyCode, d])))
      }
      return datasetsByCodePromise
    }

    for (const name of tokenRoles) {
      groups.push(name)

      const logtoRole = logtoRoleValues.find(r => name === r || name.startsWith(r + '.')) || name.split('.')[0]
      const context = name.length > logtoRole.length ? name.substring(logtoRole.length + 1) : undefined

      switch (logtoRole) {
        case LOGTO_ROLES.USER_ADMIN:
          roleMap.alp_role_user_admin = true
          break
        case LOGTO_ROLES.SYSTEM_ADMIN:
          roleMap.alp_role_system_admin = true
          break
        case LOGTO_ROLES.DASHBOARD_VIEWER:
          roleMap.alp_role_dashboard_viewer = true
          break
        case LOGTO_ROLES.JOB_RUNNER:
          roleMap.alp_role_study_write_dqd_researcher = true
          break
        case LOGTO_ROLES.STUDY_RESULTS_READER:
          roleMap.alp_role_study_results_read_researcher = true
          break
        case LOGTO_ROLES.ETL_MAPPING_CONTRIBUTOR:
          roleMap.alp_role_etl_mapping_contributor = true
          break
        case LOGTO_ROLES.TENANT_VIEWER: {
          roleMap.alp_role_tenant_viewer.push(env.APP_TENANT_ID)
          break
        }
        case LOGTO_ROLES.RESEARCHER:
          if (context) {
            const datasetsByCode = await getDatasetsByCode()
            const dataset = datasetsByCode.get(context)
            if (dataset?.id) {
              roleMap.alp_role_study_researcher.push(dataset.id)
            }
          }
          break
      }
    }

    // Auto-grant researcher datasets (mirrors grant-roles-by-scopes.ts)
    const autoGrantCodes = getAutoGrantDatasetCodes()
    if (autoGrantCodes.length > 0) {
      const datasetsByCode = await getDatasetsByCode()
      for (const code of autoGrantCodes) {
        const dataset = datasetsByCode.get(code)
        if (dataset?.id && !roleMap.alp_role_study_researcher.includes(dataset.id)) {
          roleMap.alp_role_study_researcher.push(dataset.id)
        }
      }

      if (roleMap.alp_role_study_researcher.length > 0) {
        roleMap.alp_role_study_write_dqd_researcher = true
        if (!roleMap.alp_role_tenant_viewer.includes(env.APP_TENANT_ID)) {
          roleMap.alp_role_tenant_viewer.push(env.APP_TENANT_ID)
        }
      }
    }

    const user = await this.userService.getUserByIdpUserId(idpUserId)
    const userId = user?.id || idpUserId

    return {
      userId,
      groups,
      alpRoleMap: {
        ALP_USER_ADMIN: roleMap.alp_role_user_admin,
        ALP_SYSTEM_ADMIN: roleMap.alp_role_system_admin,
        ALP_DASHBOARD_VIEWER: roleMap.alp_role_dashboard_viewer,
        TENANT_VIEWER: roleMap.alp_role_tenant_viewer,
        STUDY_RESEARCHER: roleMap.alp_role_study_researcher,
        STUDY_WRITE_DQD_RESEARCHER: roleMap.alp_role_study_write_dqd_researcher,
        STUDY_RESULTS_READ_RESEARCHER: roleMap.alp_role_study_results_read_researcher,
        ETL_MAPPING_CONTRIBUTOR: roleMap.alp_role_etl_mapping_contributor,
        // TODO: remove deprecated roles
        TENANT_ADMIN: roleMap.alp_role_tenant_admin
      },
      ...roleMap
    }
  }

  /**
   * Get user overview from Logto
   * Lists all users with their roles, matching the shape of the local DB overview
   */
  async getUserOverviewFromLogto(): Promise<any[]> {
    const [users, localUsers] = await Promise.all([
      this.logtoAPI.getUsers(),
      this.userService.getUsers()
    ])
    const idpToLocalId = new Map(localUsers.map(u => [u.idpUserId, u.id]))

    let datasetsByCodePromise: Promise<Map<string, IPortalDataset>> | null = null
    const getDatasetsByCode = () => {
      if (!datasetsByCodePromise) {
        datasetsByCodePromise = this.portalAPI
          .getDatasets()
          .then(datasets => new Map(datasets.map(d => [d.tokenStudyCode, d])))
      }
      return datasetsByCodePromise
    }

    const logtoRoleValues = Object.values(LOGTO_ROLES) as string[]
    const userRolesPairs = await Promise.all(
      users.map(async user => ({ user, roles: await this.logtoAPI.getUserRoles(user.id) }))
    )

    const result: any[] = []
    for (const { user, roles: userRoles } of userRolesPairs) {
      const active = !user.isSuspended
      const localUserId = idpToLocalId.get(user.id) || user.id

      if (userRoles.length === 0) {
        const syntheticId = `no-role:${localUserId}`
        result.push({
          id: syntheticId,
          userId: localUserId,
          b2cGroupId: null,
          username: user.username,
          role: null,
          tenantId: env.APP_TENANT_ID,
          studyId: null,
          system: null,
          active
        })
        continue
      }

      for (const role of userRoles) {
        const { name } = role
        const logtoRole = logtoRoleValues.find(r => name === r || name.startsWith(r + '.')) || name
        const context = name.length > logtoRole.length ? name.substring(logtoRole.length + 1) : undefined
        const internalRole = LOGTO_TO_INTERNAL_ROLES[logtoRole] || logtoRole
        let studyId: string | null = null

        if (logtoRole === LOGTO_ROLES.RESEARCHER && context) {
          const datasetsByCode = await getDatasetsByCode()
          studyId = datasetsByCode.get(context)?.id || null
        }

        result.push({
          id: role.id,
          userId: localUserId,
          b2cGroupId: role.id,
          username: user.username,
          role: internalRole,
          tenantId: env.APP_TENANT_ID,
          studyId,
          system: null,
          active
        })
      }
    }

    return result
  }
}
