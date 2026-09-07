import express, { NextFunction, Response } from 'express'
import { Service } from 'typedi'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { MemberService, UserGroupService, UserService } from '../services'
import { IAppRequest, UserDeleteRequest } from '../types'
import { createLogger } from '../Logger'
import { LogtoAPI, WebAPI } from '../api'
import { validatePasswordPolicy } from './password-policy'

@Service()
export class MeRouter {
  public router = express.Router()
  private readonly logger = createLogger(this.constructor.name)

  constructor(
    private readonly userService: UserService,
    private readonly userGroupService: UserGroupService,
    private readonly memberService: MemberService,
    private readonly logtoApi: LogtoAPI,
    private readonly webApi: WebAPI
  ) {
    this.registerRoutes()
  }

  // Resolve a username for an IDP user id: prefer the username claim on the
  // caller's token (our custom Logto JWT carries username/preferred_username),
  // falling back to the Logto management API (access tokens don't always carry
  // a username). Used to link a seeded user's NULL idp_user_id on first /me.
  private async resolveUsername(
    req: IAppRequest,
    idpUserId: string
  ): Promise<string | undefined> {
    try {
      const bearerToken = req.headers['authorization'] as string | undefined
      if (bearerToken) {
        const token = jwt.decode(bearerToken.replace(/bearer /i, '')) as JwtPayload | null
        const claimed = (token?.username || token?.preferred_username) as
          | string
          | undefined
        if (claimed) return claimed
      }
    } catch {
      /* fall through to Logto lookup */
    }
    try {
      const logtoUser = await this.logtoApi.getUser(idpUserId)
      return (logtoUser?.username ?? logtoUser?.primaryEmail) as string | undefined
    } catch (e) {
      this.logger.warn(
        `Could not resolve username for idp_user_id ${idpUserId}: ${e}`
      )
      return undefined
    }
  }

  private registerRoutes() {
    this.router.get('/', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { idpUserId } = req.user

      if (!idpUserId) {
        this.logger.warn(`'idpUserId' is required`)
        return res.status(400).send({ message: `'idpUserId' is required` })
      }

      this.logger.info(`Get IDP user ${idpUserId}`)

      try {
        let user = await this.userService.getUserByIdpUserId(idpUserId)

        // The seeded admin (and any user created before its first usermgmt call)
        // has a NULL idp_user_id until it is linked to its IDP identity. The
        // grant-roles-by-scopes backfill only runs on user-group routes, so a
        // token whose first usermgmt hit is /me — e.g. jobplugins resolving the
        // username for a DQD flow run — would 400. Fall back to matching by
        // username and backfill idp_user_id so the link self-heals on first /me.
        if (!user) {
          const username = await this.resolveUsername(req, idpUserId)
          if (username) {
            const byName = await this.userService.getUserByUsername(username)
            if (byName?.id) {
              this.logger.info(
                `Linking idp_user_id ${idpUserId} to existing user "${username}"`
              )
              await this.userService.updateUser({ id: byName.id, idp_user_id: idpUserId })
              user = byName
            }
          }
        }

        if (!user) {
          this.logger.error(`IDP user ID ${idpUserId} not found`)
          return res.status(400).send({ message: `IDP user ID ${idpUserId} not found` })
        }

        return res.status(200).send({ id: user.id, username: user.username })
      } catch (err) {
        this.logger.error(`Error when updating user ${idpUserId}: ${JSON.stringify(err)}`)
        next(err)
      }
    })

    this.router.delete('/', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { userId } = req.user

      this.logger.info(`Delete user ${userId}`)

      try {
        const request: UserDeleteRequest = { userId }
        await this.memberService.deleteUser(request)
        res.status(200).json({ userId })
      } catch (err) {
        this.logger.error(`Error when deleting user ${userId}: ${JSON.stringify(err)}`)
        next(err)
      }
    })

    this.router.get('/roles', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { idpUserId } = req.user
      if (!idpUserId) {
        this.logger.warn(`User does not contain 'idpUserId'`)
        return res.status(403).send({ message: `User does not contain 'idpUserId'` })
      }

      this.logger.info(`Get user roles ${idpUserId}`)

      try {
        const metadata = await this.userGroupService.getUserGroupsMetadataByIdpUserId(idpUserId)
        const roleMap = metadata.alpRoleMap
        const roles = {
          systemRoles: [
            ...(roleMap.ALP_SYSTEM_ADMIN ? ['ALP_SYSTEM_ADMIN'] : []),
            ...(roleMap.ALP_USER_ADMIN ? ['ALP_USER_ADMIN'] : []),
            ...(roleMap.ALP_DASHBOARD_VIEWER ? ['ALP_DASHBOARD_VIEWER'] : []),
            ...(roleMap.STUDY_WRITE_DQD_RESEARCHER ? ['STUDY_WRITE_DQD_RESEARCHER'] : []),
            ...(roleMap.STUDY_RESULTS_READ_RESEARCHER ? ['STUDY_RESULTS_READ_RESEARCHER'] : []),
            ...(roleMap.ETL_MAPPING_CONTRIBUTOR ? ['ETL_MAPPING_CONTRIBUTOR'] : [])
          ],
          tenantRoles: roleMap.TENANT_VIEWER.map(tenantId => ({ tenantId, role: 'TENANT_VIEWER' })),
          datasetRoles: roleMap.STUDY_RESEARCHER.map(datasetId => ({
            datasetId,
            role: 'STUDY_RESEARCHER'
          }))
        }
        return res.status(200).json(roles)
      } catch (err) {
        this.logger.error(`Error when getting user roles ${idpUserId}`)
        return next(err)
      }
    })

    this.router.put('/password', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { idpUserId } = req.user
      const { oldPassword, password } = req.body

      if (!idpUserId) {
        this.logger.warn(`User does not contain 'idpUserId'`)
        return res.status(403).send({ message: `User does not contain 'idpUserId'` })
      }

      if (!oldPassword) {
        this.logger.warn(`Param 'oldPassword' is required`)
        return res.status(400).send({ message: `Param 'oldPassword' is required` })
      }

      if (!password) {
        this.logger.warn(`Param 'password' is required`)
        return res.status(400).send({ message: `Param 'password' is required` })
      }

      const policyResult = await validatePasswordPolicy(this.logtoApi, this.logger, password)
      if (policyResult.status === 'rejected') {
        return res.status(400).send({ message: policyResult.message })
      }
      if (policyResult.status === 'error') {
        return next(policyResult.error)
      }

      this.logger.info(`Update user password ${idpUserId}`)

      const user = await this.userService.getUserByIdpUserId(idpUserId)
      if (!user) {
        this.logger.error(`IDP user ID ${idpUserId} not found`)
        return res.status(400).send({ message: `IDP user ID ${idpUserId} not found` })
      }

      try {
        await this.logtoApi.updatePassword(idpUserId, password, oldPassword)
        res.sendStatus(204)
      } catch (err) {
        if (err?.response?.status >= 400 && err?.response?.status < 500) {
          this.logger.warn(`Error when updating user password ${idpUserId}: ${JSON.stringify(err.response.data)}`)
          return res.status(err.response.status).send(err.response.data)
        }

        this.logger.error(`Error when updating user password ${idpUserId}`)
        return next(err)
      }
    })

    // Forwards the caller's own token to WebAPI openidDirect to sync sec_user_role from JWT scopes.
    this.router.post('/sync-webapi-roles', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const authHeader = req.headers['authorization']
      if (!authHeader) {
        return res.status(401).send({ message: 'Authorization header is required' })
      }

      try {
        const result = await this.webApi.syncUserRoles(authHeader)
        return res.status(result.ok ? 200 : 502).json(result)
      } catch (err) {
        this.logger.error(`Error syncing roles to WebAPI: ${JSON.stringify(err)}`)
        return next(err)
      }
    })

    this.router.get('/is_token_valid_internal', async (req: IAppRequest, res: Response, next: NextFunction) => {
      let token: string | undefined

      if ('authorization' in req.headers) {
        token = req.headers['authorization']!.replace(/bearer /i, '')
      }

      if (!token) {
        this.logger.error('A valid token is missing')
        return res.status(401).send({ message: 'A valid token is missing' })
      }

      const payload = jwt.decode(token) as JwtPayload
      if (!payload.sub) {
        this.logger.error(`A 'sub' claim is missing`)
        return res.status(401).send({ message: `A 'sub' claim is missing` })
      }

      const user = await this.userService.getUserByIdpUserId(payload.sub)
      if (!user) {
        this.logger.error(`User '${payload.sub}' is missing`)
        return res.status(401).send({ message: `User '${payload.sub}' is missing` })
      }

      if (!user.active) {
        this.logger.error(`User '${payload.sub}' is inactive`)
        return res.status(401).send({ message: `User '${payload.sub}' is inactive` })
      }

      res.setHeader('Username', user.username)
      return res.status(200).send()
    })
  }
}
