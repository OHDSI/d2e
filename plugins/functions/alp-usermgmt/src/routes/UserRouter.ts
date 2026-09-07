import express, { NextFunction, Response } from 'express'
import { Service } from 'typedi'
import { UserService } from '../services'
import { IAppRequest } from '../types'
import { createLogger } from '../Logger'
import { permittedUserCheck } from '../middlewares/permitted-user-check'
import { LogtoAPI } from '../api'
import { validatePasswordPolicy } from './password-policy'

@Service()
export class UserRouter {
  public router = express.Router()
  private readonly logger = createLogger(this.constructor.name)

  constructor(private readonly userService: UserService, private readonly logtoApi: LogtoAPI) {
    this.registerRoutes()
  }

  private registerRoutes() {
    this.router.get('/', async (req: IAppRequest, res: Response, next: NextFunction) => {
      this.logger.info('Get users')

      try {
        const users = await this.userService.getUsers()
        return res.status(200).json(users)
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
      const { id, username } = req.body || {}

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
        await this.userService.createUser({ id, username })
        return res.status(200).json({ id, username })
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

      const user = await this.userService.getUser(id)
      if (!user) {
        this.logger.warn(`User ${id} does not exist`)
        return res.status(404).send({ message: `User ${id} does not exist` })
      }

      this.logger.info(`Update password for user ${id}`)

      try {
        await this.logtoApi.updatePassword(user.idpUserId, password)
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
}
