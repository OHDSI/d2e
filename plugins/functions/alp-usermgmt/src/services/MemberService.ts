import { Container, Service } from 'typedi'
import { createLogger } from '../Logger'
import { UserActivateRequest, UserAddRequest, UserDeleteRequest } from '../types'
import { CONTAINER_KEY } from '../const'
import { generatePassword } from '../utils'
import { UserService } from './UserService'
import { UserGroupService } from './UserGroupService'
import { UserField } from '../repositories'
import { LogtoAPI, TrexIdpAPI, WebAPI } from '../api'
import { env } from '../env'
import { resolveRoleStore } from './UserGroupService'

@Service()
export class MemberService {
  private readonly logger = createLogger(this.constructor.name)

  constructor(
    private readonly userService: UserService,
    private readonly userGroupService: UserGroupService,
    private readonly logtoApi: LogtoAPI,
    private readonly trexIdpAPI: TrexIdpAPI,
    private readonly webApi: WebAPI
  ) {}

  async addUser(request: UserAddRequest) {
    const { username, groupIds } = request
    let { password } = request

    this.logger.info('Validate existing username')
    const user = await this.userService.getUserByUsername(username)
    if (user != null && user.id != null) {
      this.logger.error(`User ${username} already exist`)
      throw new Error(`User ${username} already exist`)
    }

    const db = Container.get<Knex.Transaction>(CONTAINER_KEY.DB_CONNECTION)
    const trx = await db.transactionProvider()()

    let newUserId: string | undefined

    try {
      const newUser = await this.userService.createUser({ username }, trx)
      if (!newUser) {
        this.logger.warn(`Unable to create user ${username}`)
        throw new Error(`Unable to create user ${username}`)
      }
      newUserId = newUser.id

      if (groupIds != null && groupIds.length > 0) {
        for (const groupId of groupIds) {
          await this.userGroupService.addUserToGroup(newUser.id, groupId, trx)
        }
      }

      if (password == null) password = generatePassword()

      // Whichever provider the deployment actually uses. This created the user
      // in the previous one unconditionally, so on a deployment that has moved
      // the call went to a service that is no longer running and adding a user
      // failed with a DNS error naming a host nobody expects to exist.
      const idpUserId =
        resolveRoleStore(env.IDP_ROLE_STORE) === 'trex'
          ? (await this.trexIdpAPI.createUser(username, password)).id
          : (await this.logtoApi.createUser(username, password)).id

      this.logger.info('Update IDP user ID')
      const updateFields = { id: newUser.id, idp_user_id: idpUserId }
      await this.userService.updateUser(updateFields, trx)

      await this.userService.touchAuthzChangedAt(newUser.id, trx)

      await trx.commit()

      // Sync roles to Logto AFTER commit (user now has idpUserId)
      if (newUserId && groupIds != null && groupIds.length > 0) {
        this.logger.info(`Syncing ${groupIds.length} roles to Logto for user ${idpUserId}`)
        for (const groupId of groupIds) {
          await this.userGroupService.syncRoleToLogto(newUserId, groupId, 'assign')
        }
      }
    } catch (err) {
      await trx.rollback()
      this.logger.error(`Error when adding user: ${JSON.stringify(err)}`)
      throw err
    }
  }

  async deleteUser(request: UserDeleteRequest) {
    const { userId } = request

    const user = await this.userService.getUser(userId)
    if (user == null || user.id == null) {
      this.logger.error(`User ${userId} does not exist`)
      throw new Error(`User ${userId} does not exist`)
    }

    const db = Container.get<Knex.Transaction>(CONTAINER_KEY.DB_CONNECTION)
    const trx = await db.transactionProvider()()

    try {
      await this.userService.deleteUser(userId, trx)
      if (user.idpUserId) {
        if (resolveRoleStore(env.IDP_ROLE_STORE) === 'trex') {
          await this.trexIdpAPI.deleteUser(user.idpUserId)
        } else {
          await this.logtoApi.deleteUser(user.idpUserId)
        }
      }
      await trx.commit()
    } catch (err) {
      await trx.rollback()
      this.logger.error(`Error when deleting user: ${JSON.stringify(err)}`)
      throw err
    }

    const authorizationHeader = Container.get<string>(CONTAINER_KEY.AUTHORIZATION_HEADER)
    if (user.idpUserId && authorizationHeader) {
      try {
        await this.webApi.deleteUserAccess(user.idpUserId, authorizationHeader)
      } catch (err) {
        this.logger.warn(
          `WebAPI access cleanup failed for ${user.idpUserId}; stale access may remain: ${JSON.stringify(err)}`
        )
      }
    } else if (user.idpUserId) {
      this.logger.warn(`No authorization header for user ${userId}; skipping WebAPI cleanup`)
    }
  }

  async activateUser(request: UserActivateRequest) {
    const { userId, active } = request

    const user = await this.userService.getUser(userId)
    if (user == null || user.id == null) {
      this.logger.error(`User ${userId} does not exist`)
      throw new Error(`User ${userId} does not exist`)
    }

    const db = Container.get<Knex.Transaction>(CONTAINER_KEY.DB_CONNECTION)
    const trx = await db.transactionProvider()()

    try {
      const updateFields: Partial<UserField> = { id: userId, active }
      await this.userService.updateUser(updateFields, trx)

      await this.userService.touchAuthzChangedAt(userId, trx)

      if (resolveRoleStore(env.IDP_ROLE_STORE) === 'trex') {
        await this.trexIdpAPI.setUserActive(user.idpUserId, active)
      } else {
        await this.logtoApi.activateUser(user.idpUserId, active)
      }

      await trx.commit()
    } catch (err) {
      await trx.rollback()
      this.logger.error(`Error when ${active ? 'activating' : 'deactivating'} user: ${JSON.stringify(err)}`)
      throw err
    }
  }
}
