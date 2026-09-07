import express, { NextFunction, Request, Response } from 'express'
import { Service } from 'typedi'
import { createLogger } from '../Logger'
import { LogtoAPI, PortalAPI } from '../api'
import { ROLES } from '../const'
import { B2cGroupService, MemberService, UserService } from '../services'
import { UserActivateRequest, UserAddRequest, UserDeleteRequest } from '../types'
import { validatePasswordPolicy } from './password-policy'

@Service()
export class MemberRouter {
  public router = express.Router()
  private readonly logger = createLogger(this.constructor.name)

  constructor(
    private readonly memberService: MemberService,
    private readonly groupService: B2cGroupService,
    private readonly userService: UserService,
    private readonly portalAPI: PortalAPI,
    private readonly logtoAPI: LogtoAPI
  ) {
    this.registerRoutes()
  }

  private registerRoutes() {
    this.router.post('/tenant/add', async (req: Request, res: Response, next: NextFunction) => {
      const { password } = req.body || {}
      let { tenantId } = req.body || {}
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''

      if (!username) {
        this.logger.warn(`Param 'username' is required`)
        return res.status(400).send({ message: `Param 'username' is required` })
      }

      if (username.length < 3 || username.length > 32) {
        this.logger.warn(`Username must be between 3 and 32 characters`)
        return res.status(400).send({ message: `Username must be between 3 and 32 characters.` })
      }

      if (!/^\w+$/.test(username) || /^[0-9]/.test(username)) {
        this.logger.warn(
          `username should only contain letters, numbers, or underscore, and must not start with a number`
        )
        return res.status(400).send({
          message: `Username should only contain letters, numbers, or underscore, and must not start with a number.`
        })
      }

      if (!/[A-Za-z0-9]/.test(username)) {
        this.logger.warn(`username cannot consist of underscores only`)
        return res.status(400).send({ message: `Username cannot consist of underscores only.` })
      }

      if (typeof password !== 'string' || !password.trim()) {
        this.logger.warn(`Param 'password' is required`)
        return res.status(400).send({ message: `Param 'password' is required` })
      }

      const policyResult = await validatePasswordPolicy(this.logtoAPI, this.logger, password)
      if (policyResult.status === 'rejected') {
        return res.status(400).send({ message: policyResult.message })
      }
      if (policyResult.status === 'error') {
        return next(policyResult.error)
      }

      const tenants = await this.portalAPI.getTenants()
      if (!tenantId) {
        this.logger.info(`Param 'tenantId' is empty, get tenant from portal`)
        if (tenants == null || tenants.length === 0) {
          this.logger.warn(`Tenant is empty`)
          return res.status(500).send({ message: `Tenant is empty` })
        }
        tenantId = tenants[0].id
      } else {
        const tenant = tenants.find(t => t.id === tenantId)
        if (!tenant || !tenant.id) {
          this.logger.warn(`Tenant '${tenantId}' does not exist`)
          return res.status(400).send({ message: `Tenant '${tenantId}' does not exist` })
        }
      }

      for (const role of [ROLES.TENANT_VIEWER]) {
        const check = await this.groupService.getGroupByTenantRole(tenantId, role)
        if (check == null) {
          this.logger.info(`Group ${role} does not exist. Creating group...`)
          await this.groupService.createGroup({ role, tenantId })
        }
      }

      this.logger.info('Get tenant viewer group')
      const viewerGroup = await this.groupService.getGroupByTenantRole(tenantId, ROLES.TENANT_VIEWER)
      if (!viewerGroup) {
        this.logger.warn(`Cannot find ${ROLES.TENANT_VIEWER} for tenant ${tenantId}`)
        return res.status(500).send({ message: `Cannot find ${ROLES.TENANT_VIEWER} for tenant ${tenantId}` })
      }

      const user = await this.userService.getUserByUsername(username)
      if (user != null && user.id != null) {
        this.logger.warn(`User ${username} already exist`)
        return res.status(400).send({ message: `User ${username} already exist` })
      }

      this.logger.info(`Add user ${username}`)

      try {
        const user: UserAddRequest = { username, groupIds: [viewerGroup.id], password }
        await this.memberService.addUser(user)
        res.sendStatus(201)
      } catch (err) {
        // No clear message in error response. Unable to use status code 400
        if (err.code === 'ERR_BAD_REQUEST') {
          this.logger.warn(`Error when adding user ${username}: ${JSON.stringify(err)}`)
          res.status(400).send({
            message: 'Username should only contain letters, numbers, or underscore and should not start with a number.'
          })
        }

        this.logger.error(`Error when adding user ${username}: ${JSON.stringify(err)}`)
        next(err)
      }
    })

    this.router.delete('/tenant/delete', async (req: Request, res: Response, next: NextFunction) => {
      const { userId } = req.body || {}

      if (!userId) {
        this.logger.warn(`Param 'userId' is required`)
        return res.status(400).send({ message: `Param 'userId' is required` })
      }

      this.logger.info(`Delete user ${userId}`)

      try {
        const user: UserDeleteRequest = { userId }
        await this.memberService.deleteUser(user)
        res.sendStatus(200)
      } catch (err) {
        this.logger.error(`Error when deleting user ${userId}: ${JSON.stringify(err)}`)
        next(err)
      }
    })

    this.router.post('/tenant/activate', async (req: Request, res: Response, next: NextFunction) => {
      const { userId, active } = req.body || {}

      if (!userId) {
        this.logger.warn(`Param 'userId' is required`)
        return res.status(400).send({ message: `Param 'userId' is required` })
      }

      if (active == null) {
        this.logger.warn(`Param 'active' is required`)
        return res.status(400).send({ message: `Param 'active' is required` })
      }

      this.logger.info(`${active ? 'Activate' : 'Deactivate'} user ${userId}`)

      try {
        const user: UserActivateRequest = { userId, active }
        await this.memberService.activateUser(user)
        res.sendStatus(200)
      } catch (err) {
        this.logger.error(`Error when ${active ? 'activating' : 'deactivating'} user ${userId}: ${JSON.stringify(err)}`)
        next(err)
      }
    })
  }
}
