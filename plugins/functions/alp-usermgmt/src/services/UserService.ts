import type { Knex } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '../Logger'
import { Container ,  Service } from 'typedi'
import { User } from '../entities'
import { UserField, UserRepository } from '../repositories'
import { ITokenUser } from '../types'
import { CONTAINER_KEY } from '../const'

@Service()
export class UserService {
  private readonly logger = createLogger(this.constructor.name)

  constructor(private readonly userRepo: UserRepository) {}

  async getUsers(): Promise<User[]> {
    return await this.userRepo.getList<UserField>({}, { username: 'asc' })
  }

  async getUser(id: string, trx?: Knex): Promise<User | undefined> {
    return await this.userRepo.getOne({ id }, trx)
  }

  async getUserByIdpUserId(idpUserId: string, trx?: Knex): Promise<User | undefined> {
    return await this.userRepo.getOne({ idp_user_id: idpUserId }, trx)
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await this.userRepo.getOne({ username })
  }

  async createUser(user: Partial<UserField>, trx?: Knex) {
    const tokenUser = Container.get<ITokenUser>(CONTAINER_KEY.CURRENT_USER)

    if ('id' in user) {
      const exist = await this.userRepo.exists({ id: user.id }, trx)
      if (exist) return
    } else {
      user.id = uuidv4()
    }

    this.logger.debug(`Create user ${user.id}`)
    return await this.userRepo.create(user, tokenUser, trx)
  }

  async deleteUser(id: string, trx?: Knex) {
    const user = await this.userRepo.getOne({ id }, trx)
    if (!user) {
      this.logger.error(`User ID ${id} not found. Unable to delete`)
      throw Error(`User ID ${id} not found. Unable to delete`)
    }

    this.logger.info(`Delete user ${id}`)
    await this.userRepo.delete({ id }, trx)
  }

  async updateUser(user: Partial<UserField>, trx?: Knex) {
    this.logger.debug(`Update user ${user.id}`)

    const tokenUser = Container.get<ITokenUser>(CONTAINER_KEY.CURRENT_USER)

    if (!user.id) {
      this.logger.debug(`Skip updating user ${user.id}. User ID is empty`)
      throw Error('User ID is required for update')
    }

    await this.userRepo.update(user, { id: user.id }, tokenUser, trx)
  }

  async touchAuthzChangedAt(id: string, trx?: Knex) {
    this.logger.info(`Stamp authz_changed_at for user ${id}`)

    const tokenUser = Container.get<ITokenUser>(CONTAINER_KEY.CURRENT_USER)

    await this.userRepo.update({ authz_changed_at: new Date() }, { id }, tokenUser, trx)
  }
}
