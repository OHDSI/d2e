import express, { NextFunction, Response } from 'express'
import { Service } from 'typedi'
import { UserService, B2cGroupService, UserGroupService } from '../services'
import { ROLES } from '../const'
import { env } from '../env'
import { IAppRequest } from '../types'
import { createLogger } from '../Logger'
import { permittedUserCheck } from '../middlewares/permitted-user-check'
import { LogtoAPI, TrexIdpAPI } from '../api'
import { resolveRoleStore } from '../services/UserGroupService'

@Service()
export class UserRouter {
  public router = express.Router()
  private readonly logger = createLogger(this.constructor.name)

  constructor(
    private readonly userService: UserService,
    private readonly logtoApi: LogtoAPI,
    private readonly trexIdpAPI: TrexIdpAPI,
    private readonly groupService: B2cGroupService,
    private readonly userGroupService: UserGroupService
  ) {
    this.registerRoutes()
  }

  private registerRoutes() {
    this.router.get('/', async (req: IAppRequest, res: Response, next: NextFunction) => {
      this.logger.info('Get users')

      try {
        const users = await this.userService.getUsers()
        // The setup account provisions the deployment and is not somebody an
        // administrator manages: listing it puts a row in the users table that
        // cannot be meaningfully edited or deleted. Filtered here rather than in
        // the service because group synchronisation still has to see it.
        const setupUser = env.D2E_SETUP_USER
        return res
          .status(200)
          .json(setupUser ? users.filter((user) => user.username !== setupUser) : users)
      } catch (err) {
        this.logger.error(`Error when getting users: ${JSON.stringify(err)}`)
        return next(err)
      }
    })

    this.router.get('/:id', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { id } = req.params || {}

      if (!id) {
        this.logger.warn(`Param 'id' is required`)
        return res.status(400).send({ message: `Param 'id' is required` })
      }

      this.logger.info(`Get user ${id}`)

      try {
        const user = await this.userService.getUser(id)
        if (!user?.id) {
          this.logger.warn(`Unable to find user ${id}`)
          return res.status(404).send({ message: `Unable to find user ${id}` })
        }

        return res.status(200).json({ id: user.id, username: user.username })
      } catch (err) {
        this.logger.error(`Error when getting user ${id}: ${JSON.stringify(err)}`)
        return next(err)
      }
    })

    this.router.post('/', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { id, username, idpUserId } = req.body || {}

      if (!id) {
        this.logger.warn(`Param 'id' is required`)
        return res.status(400).send({ message: `Param 'id' is required` })
      }

      if (!username) {
        this.logger.warn(`Param 'username' is required`)
        return res.status(400).send({ message: `Param 'username' is required` })
      }

      this.logger.info(`Create user ${id} ${username}`)

      try {
        // idpUserId is optional: the interactive flows let the login middleware
        // stamp it on first sign-in. A caller provisioning an account ahead of
        // that -- a setup script, a migration -- has the subject already, and
        // without it every lookup by IDP id misses and the user reads as absent.
        await this.userService.createUser({ id, username, idp_user_id: idpUserId })
        await this.grantSetupAccountAdmin(id, username)
        return res.status(200).json({ id, username, idpUserId })
      } catch (err) {
        this.logger.error(`Error when creating user ${id} ${username}: ${JSON.stringify(err)}`)
        return next(err)
      }
    })

    this.router.delete(
      '/:id',
      permittedUserCheck({ userIdPath: 'params.id' }),
      async (req: IAppRequest, res: Response, next: NextFunction) => {
        const { id } = req.params || {}

        if (!id) {
          this.logger.warn(`Param 'id' is required`)
          return res.status(400).send({ message: `Param 'id' is required` })
        }

        const user = await this.userService.getUser(id)
        if (!user) {
          this.logger.warn(`User ${id} does not exist`)
          return res.status(404).send({ message: `User ${id} does not exist` })
        }

        this.logger.info(`Delete user ${id}`)

        try {
          await this.userService.deleteUser(id)
          return res.status(200).json({ id })
        } catch (err) {
          this.logger.error(`Error when deleting user ${id}: ${JSON.stringify(err)}`)
          return next(err)
        }
      }
    )

    this.router.put('/:id/password', async (req: IAppRequest, res: Response, next: NextFunction) => {
      const { id } = req.params || {}
      const { password } = req.body || {}

      if (!id) {
        this.logger.warn(`Param 'id' is required`)
        return res.status(400).send({ message: `Param 'id' is required` })
      }

      const user = await this.userService.getUser(id)
      if (!user) {
        this.logger.warn(`User ${id} does not exist`)
        return res.status(404).send({ message: `User ${id} does not exist` })
      }

      this.logger.info(`Update password for user ${id}`)

      try {
        if (resolveRoleStore(env.IDP_ROLE_STORE) === 'trex') {
          const result = await this.trexIdpAPI.setPassword(user.idpUserId, password)
          if (!result.ok) {
            this.logger.warn(`Error when updating user password ${id}: ${result.message}`)
            return res.status(result.status).send({ message: result.message })
          }
        } else {
          await this.logtoApi.updatePassword(user.idpUserId, password)
        }
        return res.sendStatus(204)
      } catch (err) {
        if (err?.response?.status >= 400 && err?.response?.status < 500) {
          this.logger.warn(`Error when updating user password ${id}: ${JSON.stringify(err.response.data)}`)
          return res.status(err.response.status).send(err.response.data)
        }

        this.logger.error(`Error when updating user password ${id}: ${JSON.stringify(err)}`)
        return next(err)
      }
    })
  }

  /**
   * Give the configured setup account the privilege its work requires.
   *
   * It has to administer tenants to grant study roles during setup. The initial
   * user gets that from the seeds, but this account does not exist when they
   * run - it appears on its first sign-in - so the grant is attached here, where
   * the row is created, whichever caller creates it.
   *
   * A failure is logged rather than raised: the account exists either way, and
   * failing the creation would leave the caller with no user at all.
   */
  private async grantSetupAccountAdmin(userId: string, username: string): Promise<void> {
    const setupUser = env.D2E_SETUP_USER
    if (!setupUser || username !== setupUser) {
      return
    }
    try {
      const group = await this.groupService.getGroupByRole(ROLES.ALP_USER_ADMIN)
      if (!group) {
        this.logger.warn(`No ${ROLES.ALP_USER_ADMIN} group to grant ${username}`)
        return
      }
      // The stamp exists to force a re-login when someone's authorization changes
      // under them. Here the account is being created, so there is no session to
      // invalidate - only the caller's freshly issued token, which provisioning
      // still needs and which would be rejected as stale on its very next call.
      await this.userGroupService.registerUserToGroup(userId, group.id, undefined, {
        skipAuthzStamp: true,
      })
      this.logger.info(`Granted ${ROLES.ALP_USER_ADMIN} to the setup account ${username}`)
    } catch (err) {
      this.logger.error(`Could not grant ${ROLES.ALP_USER_ADMIN} to ${username}: ${err}`)
    }
  }

}
