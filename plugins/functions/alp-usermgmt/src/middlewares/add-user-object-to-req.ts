import { NextFunction, Response } from 'express'
import { createLogger } from '../Logger'
import { IAppRequest, ITokenUser } from '../types'
import jwt from 'jsonwebtoken'
import { CONTAINER_KEY, SERVICE_USER_ID } from '../const'
import { env } from '../env'
import { Container } from 'typedi'
import { UserService } from '../services'
import { DEFAULT_AUTHZ_FRESHNESS_SKEW_MS, isTokenAuthzFresh } from '../authz-freshness'

const subProp = env.USER_MGMT_IDP_SUBJECT_PROP
const logger = createLogger('AddUserObjToReq')

export const addUserObjToReq = async (req: IAppRequest, res: Response, next: NextFunction) => {
  logger.debug('Add user obj to req')

  try {
    const bearerToken = req.headers.authorization as string
    if (!bearerToken) {
      return next()
    }

    const token = jwt.decode(bearerToken.replace(/bearer /i, '')) as jwt.JwtPayload
    if (!(subProp in token)) {
      logger.error(`"${subProp}" is not found in token`)
      return res.status(400).send()
    }

    const { oid } = token
    const sub = token[subProp]
    const idpUserId = oid! || sub!

    // M2M tokens have sub === client_id; skip user lookup but still
    // set a minimal req.user so downstream middleware doesn't crash. Tag the
    // userId with the SERVICE_USER_ID sentinel so authz middleware bypasses
    // checks only for true service tokens — not for unprovisioned end-users
    // (who get an empty userId below and must NOT bypass).
    // Service tokens carry no user roles, so freshness does not apply to them.
    if (sub === token.client_id) {
      req.user = { userId: SERVICE_USER_ID, idpUserId: sub } as ITokenUser
      return next()
    }

    const userService = Container.get(UserService)
    const dbUser = await userService.getUserByIdpUserId(idpUserId)

    // This runs before every router, so rejecting a stale token here also stops
    // it reaching grant-roles-by-scopes, which would otherwise reconcile the
    // database from the token's outdated claims.
    if (dbUser) {
      const isFresh = isTokenAuthzFresh(token.iat, dbUser.authzChangedAt, DEFAULT_AUTHZ_FRESHNESS_SKEW_MS)
      logger.debug(
        `Authz freshness check for ${idpUserId}: fresh=${isFresh} iat=${token.iat} ` +
          `authz_changed_at=${dbUser.authzChangedAt?.toISOString()} skew_ms=${DEFAULT_AUTHZ_FRESHNESS_SKEW_MS}`
      )
      if (!isFresh) {
        logger.info(
          `Rejecting stale token for ${idpUserId}: iat=${token.iat} authz_changed_at=${dbUser.authzChangedAt?.toISOString()}`
        )
        res.setHeader('X-Token-Stale', '1')
        return res.status(401).send({
          code: 'AUTHZ_STALE_TOKEN',
          message: 'Authorization changed; token refresh required'
        })
      }
    } else {
      // No usermgmt row yet (first login / auto-provisioning). There is no
      // recorded change for this user to be stale against.
      logger.debug(`Authz freshness check skipped for ${idpUserId}: no usermgmt row yet`)
    }

    const user: ITokenUser = {
      userId: dbUser?.id || '',
      idpUserId
    }

    req.user = user
    Container.set(CONTAINER_KEY.CURRENT_USER, req.user)

    return next()
  } catch (err) {
    logger.error(`Error when adding user obj to req: ${err}`)
    return res.status(500).send()
  }
}
