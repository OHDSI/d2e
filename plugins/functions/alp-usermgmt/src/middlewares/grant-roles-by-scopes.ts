import { IDP_SCOPE_ROLE, CONTAINER_KEY, ROLES } from '../const'
import { NextFunction, Request, Response } from 'express'
import { Container } from 'typedi'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '../Logger'
import {
  AutoProvisionService,
  B2cGroupService,
  EntitlementsSyncService,
  UserGroupService,
  UserService,
} from '../services'
import { env, getAutoGrantDatasetCodes } from '../env'
import { LogtoAPI } from '../api'
import { IDataset, ITokenUser } from '../types'
import { UserField } from '../repositories'

const logger = createLogger('GrantRolesByScopes')
const subProp = env.USER_MGMT_IDP_SUBJECT_PROP

export const grantRolesByScopes = async (req: Request, res: Response, next: NextFunction) => {
  const logtoApi = Container.get(LogtoAPI)
  const userService = Container.get(UserService)
  const isSync = Boolean(req.body.sync)
  let sub: string = ''

  try {
    const bearerToken = req.headers.authorization as string
    if (!bearerToken) {
      logger.warn('No bearer token found')
      return next()
    }

    const token = jwt.decode(bearerToken.replace(/bearer /i, '')) as jwt.JwtPayload
    if (!(subProp in token)) {
      logger.warn(`No subject property "${subProp}" found in token. Available claims: ${Object.keys(token).join(', ')}`)
      return next()
    }

    sub = token[subProp]

    // M2M tokens have sub === client_id; skip user provisioning for those.
    if (sub === token.client_id) {
      return next()
    }

    if (isSync) {
      logger.info(`Assigning roles for user with subject "${sub}"`)
    }

    const { scope, roles, email } = token as { scope: string, roles: string[]; email: string }
    let user = await userService.getUserByIdpUserId(sub)
    let userId = user?.id

    let username = email
    if (!user) {
      if (env.IDP_FETCH_USER_INFO_TYPE === 'logto') {
        // Fetch user info as Logto's access_token does not contain username
        const logtoUser = await logtoApi.getUser(sub)
        if (logtoUser != null) {
          // Use username in Logto context (fallback to email if empty)
          username = logtoUser.username ?? logtoUser.primaryEmail
        }
      }

      logger.info(`User with idp_user_id "${sub}" not found, try finding by username "${username}"`)
      user = await userService.getUserByUsername(username)
      userId = user?.id

      if (user == null) {
        const autoProvisionService = Container.get(AutoProvisionService)
        const provisioned = await autoProvisionService.provision(sub, { email, username }, bearerToken)
        if (provisioned) {
          userId = provisioned.id
          const tokenUser: ITokenUser = { userId: provisioned.id, idpUserId: sub }
          req.user = tokenUser
          Container.set(CONTAINER_KEY.CURRENT_USER, tokenUser)
        } else if (env.IDP_AUTO_PROVISION_USERS) {
          if (isSync) {
            logger.info(`First time login for new user, create user: "${sub}"`)
            const newUser: Partial<UserField> = { id: uuidv4(), username: username, idp_user_id: sub }
            await userService.createUser(newUser)
            userId = newUser.id

            const tokenUser: ITokenUser = {
              userId: newUser.id || '',
              idpUserId: sub
            }
            req.user = tokenUser
            Container.set(CONTAINER_KEY.CURRENT_USER, tokenUser)
          } else {
            logger.error(`User "${sub}" or "${username}" does not exist for non-sync request`)
            return res.status(500).send({ message: `User "${sub}" or "${username}" does not exist` })
          }
        } else {
          logger.error(`User "${sub}" or "${username}" does not exist`)
          return res.status(500).send({ message: `User "${sub}" or "${username}" does not exist` })
        }
      } else if (!user.idpUserId) {
        logger.info(`First time login for existing user, update idp_user_id: "${sub}"`)
        await userService.updateUser({ id: user.id, idp_user_id: sub })

        const tokenUser: ITokenUser = {
          userId: user.id || '',
          idpUserId: sub
        }
        req.user = tokenUser
        Container.set(CONTAINER_KEY.CURRENT_USER, tokenUser)
      }
    }

    if (!userId) {
      return next()
    }

    const entitlementsSync = Container.get(EntitlementsSyncService)
    await entitlementsSync.sync(userId!, sub, token).catch(err => {
      logger.warn(`[Entitlements] sync threw for ${sub}: ${err}; keeping existing roles`)
    })

    if (isSync && env.IDP_AUTO_PROVISION_USERS) {
      const tenantId = env.APP_TENANT_ID
      if (!tenantId) {
        logger.error(`Tenant not found`)
        return res.status(500).send({ message: `Tenant not found` })
      }

      const scopes = roles || scope?.split(" ") || []
      await grantOrRevokeSystemRole(userId, ROLES.ALP_SYSTEM_ADMIN, scopes.includes(IDP_SCOPE_ROLE.SYSTEM_ADMIN))
      await grantOrRevokeSystemRole(userId, ROLES.ALP_USER_ADMIN, scopes.includes(IDP_SCOPE_ROLE.USER_ADMIN))
      await grantOrRevokeSystemRole(userId, ROLES.ALP_DASHBOARD_VIEWER, scopes.includes(IDP_SCOPE_ROLE.DASHBOARD_VIEWER))
      
      const allDatasets = await getDatasets()
      // Skip datasets governed by PhysioNet entitlements sync, else this
      // token-scope sync revokes researcher roles it just granted.
      const managedCodes = await Container.get(EntitlementsSyncService).getManagedDatasetCodes()
      const datasets = managedCodes.size > 0
        ? allDatasets.filter(d => !managedCodes.has(d.token_dataset_code))
        : allDatasets
      if (datasets.length > 0) {
        let grantDatasetCodes = scopes
          .filter(x => x.startsWith(IDP_SCOPE_ROLE.DATASET_RESEARCHER_PREFIX))
          .map(x => x.replace(IDP_SCOPE_ROLE.DATASET_RESEARCHER_PREFIX, ''))

        // Auto-grant specific datasets
        const autoGrantCodes = getAutoGrantDatasetCodes()
        if (autoGrantCodes.length > 0) {
          grantDatasetCodes = [...new Set([...grantDatasetCodes, ...autoGrantCodes])]
        }
        logger.info(`Granting roles for user ${userId} for dataset codes: ${grantDatasetCodes.join(', ')}`)

        await grantOrRevokeResearcherRole(userId, tenantId, ROLES.STUDY_RESEARCHER, datasets, grantDatasetCodes)

        if (env.IDP_RELYING_PARTY === 'azure') {
          const isAnyResearcher = datasets.some(dataset => grantDatasetCodes.includes(dataset.token_dataset_code))
          await grantOrRevokeSystemRole(userId, ROLES.STUDY_WRITE_DQD_RESEARCHER, isAnyResearcher)
        }
      }
    }

    next()
  } catch (err) {
    logger.error(`Error when assigning roles: ${err}`)

    if (isSync && sub) {
      const user = await userService.getUserByIdpUserId(sub)
      if (!user) {
        logger.info(`User with idp_user_id "${sub}" not found, delete from Logto`)
        await logtoApi.deleteUser(sub)
      }
    }

    next(err)
  }
}

const grantOrRevokeTenantRole = async (userId: string, tenantId: string, role: string, isGrant: boolean) => {
  const groupService = Container.get(B2cGroupService)

  let group = await groupService.getGroupByTenantRole(tenantId, role)
  if (!group?.id) {
    await groupService.createGroup({ role, tenantId })
    group = await groupService.getGroupByTenantRole(tenantId, role)
  }

  if (isGrant) {
    await addUserToGroup(userId, group!.id)
  } else {
    await removeUserFromGroup(userId, group!.id)
  }
}

const grantOrRevokeSystemRole = async (userId: string, role: string, isGrant: boolean) => {
  const groupService = Container.get(B2cGroupService)

  const system = env.ALP_SYSTEM_NAME!
  const group = await groupService.getGroupBySystemRole(system, role)

  if (isGrant) {
    await addUserToGroup(userId, group!.id)
  } else {
    await removeUserFromGroup(userId, group!.id)
  }
}

const grantOrRevokeResearcherRole = async (userId: string, tenantId: string, role: string, datasets: IDataset[], grantDatasetCodes: string[]) => {
  const groupService = Container.get(B2cGroupService)

  let isResearcher = false
  for (const dataset of datasets) {
    let group = await groupService.getGroupByStudyRole(dataset.id, role)
    if (!group?.id) {
      await groupService.createGroup({ role, tenantId, studyId: dataset.id })
      group = await groupService.getGroupByStudyRole(dataset.id, role)
    }

    if (!group?.id) {
      continue;
    }

    const isGrant = grantDatasetCodes.includes(dataset.token_dataset_code)
    if (isGrant) {
      isResearcher = true
      logger.info(`Granting role ${role} for dataset ${dataset.token_dataset_code} to user ${userId}`)
      await addUserToGroup(userId, group!.id)
    } else {
      logger.info(`Revoking role ${role} for dataset ${dataset.token_dataset_code} from user ${userId}`)
      await removeUserFromGroup(userId, group!.id)
    }
  }

  // Automatically grant viewer role when is researcher
  if (isResearcher) {
    await grantOrRevokeTenantRole(userId, tenantId, ROLES.TENANT_VIEWER, isResearcher)
  }
}

// `skipAuthzStamp`: these two helpers serve the reconciliation below, which
// writes the *token's own* role claims into the database. Stamping here would
// mark the caller's own token stale for a change it supplied, forcing a
// renewal that returns identical claims — pure churn on every first login.
// Every other caller of these two service methods carries a change the token
// cannot know about, and so stamps normally.
const addUserToGroup = async (userId: string, groupId: string) => {
  const userGroupService = Container.get(UserGroupService)

  logger.info(`Grant ${userId} to ${groupId}`)
  await userGroupService.registerUserToGroup(userId, groupId, undefined, {
    skipUserValidation: true,
    skipAuthzStamp: true
  })
}

const removeUserFromGroup = async (userId: string, groupId: string) => {
  const userGroupService = Container.get(UserGroupService)

  const member = await userGroupService.getUserGroup(userId, groupId)
  if (member?.id) {
    logger.info(`Revoke ${userId} from ${groupId}`)
    await userGroupService.withdrawUserFromGroup(userId, groupId, undefined, { skipAuthzStamp: true })
  }
}

const getDatasets = async () => {
  const db = Container.get(CONTAINER_KEY.DB_CONNECTION);

  try {
    const datasets: { rows: IDataset[] } = await db.raw('SELECT * FROM portal.dataset')
    return datasets?.rows || []
  } catch (error) {
    console.error('An error when getting datasets', error)
    return []
  }
}