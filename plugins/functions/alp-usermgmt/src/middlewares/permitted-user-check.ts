import { NextFunction, Response } from 'express'
import { Container } from 'typedi'
import { UserGroupService, UserService } from '../services'
import { createLogger } from '../Logger'
import { IAppRequest } from '../types'
import { getUserGroupsCached } from './request-cache.ts'
import * as _ from 'lodash-es'
import { ROLES, SERVICE_USER_ID } from '../const'

interface RoleCheckOptions {
  userIdPath?: string
  userMustWithinTenant?: boolean
  isReadAccess?: boolean
  isIdpUserId?: boolean // indicate the userId in the request body is an IDP user ID
}

const DEFAULT_ROLE_CHECK_OPTIONS: RoleCheckOptions = {
  userIdPath: 'body.userId',
  userMustWithinTenant: true,
  isReadAccess: false,
  isIdpUserId: false
}

const logger = createLogger('PermittedUserCheck')

export const permittedUserCheck =
  (options: RoleCheckOptions = DEFAULT_ROLE_CHECK_OPTIONS) =>
  async (req: IAppRequest, res: Response, next: NextFunction) => {
    const opts = { ...DEFAULT_ROLE_CHECK_OPTIONS, ...options }

    try {
      const { userId: ctxUserId, idpUserId: ctxIdpUserId } = req.user
      const userGroupService = Container.get(UserGroupService)

      // Service / M2M tokens (e.g. WebAPI internal calls) are tagged with the
      // SERVICE_USER_ID sentinel by add-user-object-to-req; they are already
      // authenticated services, so pass through. Any other falsy userId means
      // an end-user with no resolved usermgmt.user row — deny rather than
      // bypass, to avoid privilege escalation for unprovisioned users.
      if (ctxUserId === SERVICE_USER_ID) {
        return next()
      }
      if (!ctxUserId) {
        logger.error('No resolved user for request; denying')
        return res.status(403).send()
      }

      // The caller's groups are keyed by identity-provider subject, not by the
      // usermgmt row id. Those were the same string under an identity provider
      // that minted both, so passing the row id worked; where they differ the
      // lookup finds nobody and every tenant check fails.
      const ctxUserGroups = await getUserGroupsCached(req, userGroupService, ctxIdpUserId)
      const url = `${req.baseUrl}${req.url}`

      if (ctxUserGroups.alp_role_user_admin) {
        // Bypass for ALP_USER_ADMIN
        logger.debug(`ctxUser is ${ROLES.ALP_USER_ADMIN}}`)
        return next()
      }

      // Generic permission check
      // Any specific permission check should be done at the route level
      let userId = _.get(req, opts.userIdPath || 'body.userId') as string
      // The subject the identity provider knows a user by, needed for the group
      // lookup below, which is keyed on it rather than on the row id.
      let targetIdpUserId: string | undefined
      if (userId) {
        if (opts.isIdpUserId) {
          const userService = Container.get(UserService)
          // Callers disagree about which identifier this is. They were the same
          // string under an identity provider that minted both, so both spellings
          // are in use; against one that mints its own they are not, and taking
          // the parameter's name at its word rejects every caller holding a row
          // id with "IDP user ID not found".
          const user =
            (await userService.getUserByIdpUserId(userId)) ??
            (await userService.getUser(userId))
          if (!user) {
            logger.error(`No user for ${userId}, by subject or by id`)
            throw `No user for ${userId}, by subject or by id`
          }
          userId = user.id!
          targetIdpUserId = user.idpUserId ?? undefined
        }

        if (userId === req.user.userId) {
          // Bypass for SELF
          return next()
        }

        logger.info(`Permitted user check for ${req.user.userId} on ${userId}`)

        // UserID and UserGroups are referred to requested user
        // The subject, not the row id: this reads the same store as the caller's
        // own lookup above, and a row id finds nobody there.
        const userGroups = await getUserGroupsCached(
          req,
          userGroupService,
          targetIdpUserId ?? userId
        )

        if (ctxUserGroups.alp_role_tenant_admin.length > 0) {
          if (opts.userMustWithinTenant) {
            // Tenant admin can query all users within his tenants
            if (!ctxUserGroups.alp_role_tenant_admin.some(t => userGroups.alp_tenant_id.includes(t))) {
              logger.error(`SECURITY INCIDENT: Tenant admin (${ctxUserId}) access ${url} with user ID ${userId}`)
              return res.status(403).send()
            }
          }
        } else {
          // Other roles can only query himself
          if (ctxUserId !== userId) {
            logger.error(`SECURITY INCIDENT: User (${ctxUserId}) access ${url} with user ID ${userId}`)
            return res.status(403).send()
          }
        }
      }

      return next()
    } catch (err) {
      logger.error(`Error when check permitted user: ${err}`)
      return res.status(500).send()
    }
  }
