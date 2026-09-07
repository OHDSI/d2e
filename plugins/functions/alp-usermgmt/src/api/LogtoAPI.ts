import { Service } from 'typedi'
import { del, get, patch, post } from './request-util'
import { BaseIDPAPI } from './BaseIDPAPI'
import { ILogtoUser, ILogtoUserCreated, ILogtoRole } from '../types'
import { env } from '../env'
import { datasetResearcherScopes, sourceUserScopeName } from '../const'

@Service()
export class LogtoAPI extends BaseIDPAPI {
  private roleCache: Map<string, string> = new Map() // roleName -> roleId
  private resourceId: string | null = null

  private async getResourceId(): Promise<string> {
    if (this.resourceId) return this.resourceId

    const resources = await this.fetchAllPages<{ id: string; indicator: string; isDefault?: boolean }>('/api/resources')

    // Find the application resource (set as default during post-init), not the Management API
    const resource = resources.find(r => r.isDefault)
    if (!resource) {
      throw new Error('Default application resource not found in Logto')
    }

    this.resourceId = resource.id
    return resource.id
  }

  private async ensureScopeForRole(roleId: string, scopeName: string): Promise<void> {
    this.logger.info(`Ensuring scope ${scopeName} exists for role ${roleId}`)

    const resourceId = await this.getResourceId()
    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })

    const scopesPath = `/api/resources/${resourceId}/scopes`
    const existingScopes = await this.fetchAllPages<{ id: string; name: string }>(scopesPath)
    let scope = existingScopes.find(s => s.name === scopeName)

    if (!scope) {
      this.logger.info(`Creating scope ${scopeName} on resource ${resourceId}`)
      const createResult = await post<{ id: string; name: string }>(
        `${this.baseUrl}${scopesPath}`,
        { name: scopeName, description: scopeName },
        options
      )
      scope = createResult.data
    }

    const roleScopesPath = `/api/roles/${roleId}/scopes`
    const existingRoleScopes = await this.fetchAllPages<{ id: string; name: string }>(roleScopesPath)
    const alreadyAssigned = existingRoleScopes.some(s => s.id === scope!.id)

    if (!alreadyAssigned) {
      this.logger.info(`Assigning scope ${scopeName} to role ${roleId}`)
      await post(`${this.baseUrl}${roleScopesPath}`, { scopeIds: [scope!.id] }, options)
    }
  }

  private async fetchAllPages<T>(path: string, pageSize = 100): Promise<T[]> {
    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    let page = 1
    const allItems: T[] = []

    while (true) {
      const url = `${this.baseUrl}${path}?page=${page}&page_size=${pageSize}`
      const result = await get<T[]>(url, options)
      allItems.push(...result.data)

      const totalNumber = Number(result.headers['total-number'])
      if (!totalNumber || allItems.length >= totalNumber) {
        break
      }
      page++
    }

    return allItems
  }
  async getUser(userId: string) {
    this.logger.info(`Get user ${userId}`)

    const options = await this.getRequestConfig('all' || '', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/users/${userId}`
    const result = await get<ILogtoUser>(url, options)
    return result.data
  }

  /**
   * Return the user's SSO identities keyed by connector target (e.g. "oidc",
   * "azuread-alp", "physionet"). Used to gate auto-provisioning to a
   * specific upstream IdP. A user with no SSO identities (password
   * sign-up, etc.) gets an empty object.
   */
  async getUserSsoIdentities(idpUserId: string): Promise<Record<string, { details?: object }>> {
    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/users/${idpUserId}/sso-identities`
    try {
      const result = await get<Record<string, { details?: object }>>(url, options)
      return result.data || {}
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return {}
      }
      throw err
    }
  }

  /**
   * Return the user's social-connector identities keyed by connector target
   * (e.g. "physionet" for the standard OIDC connector we register). Logto
   * stores these on the user record itself; `getUser` returns the same
   * object under `.identities`, so this is a thin wrapper that normalizes
   * the empty case.
   */
  async getUserSocialIdentities(idpUserId: string): Promise<Record<string, { userId?: string; details?: object }>> {
    const user = await this.getUser(idpUserId)
    return ((user as unknown as { identities?: Record<string, { userId?: string; details?: object }> }).identities) || {}
  }

  /**
   * Check a password against the sign-in-experience password policy. The
   * Management API's user creation endpoint bypasses the policy, so callers
   * creating users with a password should validate it here first. Returns
   * `{ accepted: false, rejection }` when the policy rejects the password;
   * any other failure (Logto unreachable, token error, etc.) is thrown.
   */
  async checkPasswordPolicy(password: string): Promise<{ accepted: boolean; rejection?: object }> {
    this.logger.info('Check password against sign-in experience policy')

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/sign-in-exp/default/check-password`

    try {
      await post(url, { password }, options)
      return { accepted: true }
    } catch (err: any) {
      if (err?.response?.status === 400) {
        return { accepted: false, rejection: err.response.data }
      }
      throw err
    }
  }

  async createUser(username: string, password: string): Promise<ILogtoUserCreated> {
    this.logger.info(`Create user ${username}`)

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/users`

    const data = {
      username: username,
      password
    }

    const result = await post<ILogtoUserCreated>(url, data, options)
    return result.data
  }

  async deleteUser(idpUserId: string) {
    this.logger.info(`Delete user ${idpUserId}`)

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/users/${idpUserId}`
    await del(url, options)
  }

  async activateUser(idpUserId: string, active: boolean) {
    this.logger.info(`${active ? 'Activate' : 'Deactivate'} user ${idpUserId}`)

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/users/${idpUserId}/is-suspended`
    const data = { isSuspended: !active }

    await patch(url, data, options)
  }

  async updatePassword(userId: string, password: string, oldPassword?: string) {
    this.logger.info(`Update password for ${userId}`)

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })

    if (oldPassword) {
      const url = `${this.baseUrl}/api/users/${userId}/password/verify`
      const data = { password: oldPassword }
      const result = await post(url, data, options)
      if (result.status !== 204 && result.status !== 200) {
        this.logger.warn('Invalid old password')
        throw new Error('Invalid old password')
      }
    }

    const url = `${this.baseUrl}/api/users/${userId}/password`
    const data = { password }
    await patch(url, data, options)
  }

  async getUsers(): Promise<ILogtoUser[]> {
    this.logger.debug('Fetching all Logto users')
    return this.fetchAllPages<ILogtoUser>('/api/users')
  }

  // ============ Role Management Methods ============

  async getRoles(): Promise<ILogtoRole[]> {
    this.logger.debug('Fetching all Logto roles')
    return this.fetchAllPages<ILogtoRole>('/api/roles')
  }

  async getRoleByName(roleName: string): Promise<ILogtoRole | undefined> {
    // Check cache first
    if (this.roleCache.has(roleName)) {
      const roleId = this.roleCache.get(roleName)!
      return { id: roleId, name: roleName, description: '', type: 'User' }
    }

    const roles = await this.getRoles()
    // Update cache
    roles.forEach(role => this.roleCache.set(role.name, role.id))

    return roles.find(r => r.name === roleName)
  }

  async createRole(roleName: string, description?: string): Promise<ILogtoRole> {
    this.logger.info(`Creating Logto role: ${roleName}`)

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/roles`
    const data = {
      name: roleName,
      description: description || `Role: ${roleName}`,
      type: 'User'
    }

    const result = await post<ILogtoRole>(url, data, options)

    // Update cache
    if (result.data?.id) {
      this.roleCache.set(roleName, result.data.id)
    }

    return result.data
  }

  async getUserRoles(idpUserId: string): Promise<ILogtoRole[]> {
    this.logger.debug(`Fetching roles for user ${idpUserId}`)
    return this.fetchAllPages<ILogtoRole>(`/api/users/${idpUserId}/roles`)
  }

  async assignRoleToUser(idpUserId: string, roleName: string, scopes?: string[]): Promise<void> {
    this.logger.info(`Assigning role ${roleName} to user ${idpUserId}`)

    let role = await this.getRoleByName(roleName)

    if (!role) {
      this.logger.info(`Role ${roleName} not found, creating it`)
      role = await this.createRole(roleName)
    }

    if (scopes?.length) {
      for (const scopeName of scopes) {
        await this.ensureScopeForRole(role.id, scopeName)
      }
    }

    // Check if user already has the role
    const userRoles = await this.getUserRoles(idpUserId)
    if (userRoles.some(r => r.id === role!.id)) {
      this.logger.debug(`User ${idpUserId} already has role ${roleName}`)
      return
    }

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/users/${idpUserId}/roles`
    const data = { roleIds: [role.id] }

    await post(url, data, options)
    this.logger.info(`Successfully assigned role ${roleName} to user ${idpUserId}`)
  }

  async removeRoleFromUser(idpUserId: string, roleName: string): Promise<void> {
    this.logger.info(`Removing role ${roleName} from user ${idpUserId}`)

    const role = await this.getRoleByName(roleName)
    if (!role) {
      this.logger.warn(`Role ${roleName} not found in Logto, skipping removal`)
      return
    }

    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })
    const url = `${this.baseUrl}/api/users/${idpUserId}/roles/${role.id}`

    await del(url, options)
    this.logger.info(`Successfully removed role ${roleName} from user ${idpUserId}`)
  }

  // Idempotently ensures a per-dataset researcher role + scopes (incl. `Source user (<datasetId>)`) in Logto depends on dataset.type.
  async ensureDatasetRole(datasetId: string, tokenStudyCode: string, type?: string): Promise<void> {
    this.logger.info(`Ensuring dataset role for ${tokenStudyCode} (${datasetId})`)

    const roleName = `role.researcher.${tokenStudyCode}`
    let role = await this.getRoleByName(roleName)
    if (!role) {
      role = await this.createRole(roleName)
    }

    const scopeNames = datasetResearcherScopes(roleName, datasetId, type)
    for (const scopeName of scopeNames) {
      try {
        await this.ensureScopeForRole(role.id, scopeName)
      } catch (err: any) {
        const status = err?.response?.status
        const body = err?.response?.data
        const detail = body ? JSON.stringify(body) : err?.message
        throw new Error(
          `ensureScopeForRole "${scopeName}" on role ${roleName} failed: ${status ?? 'no-status'} ${detail}`
        )
      }
    }
  }

  // Best-effort removal of the per-dataset researcher role + scopes; missing entries are treated as clean.
  async removeDatasetRole(datasetId: string, tokenStudyCode: string): Promise<void> {
    this.logger.info(`Removing dataset role for ${tokenStudyCode} (${datasetId})`)

    const roleName = `role.researcher.${tokenStudyCode}`
    const options = await this.getRequestConfig('all', { resource: env.IDP_ALP_ADMIN_RESOURCE })

    const role = await this.getRoleByName(roleName)
    if (role) {
      await del(`${this.baseUrl}/api/roles/${role.id}`, options)
      this.roleCache.delete(roleName)
    } else {
      this.logger.debug(`Role ${roleName} not in Logto, skipping role delete`)
    }

    const resourceId = await this.getResourceId()
    const scopesPath = `/api/resources/${resourceId}/scopes`
    const existingScopes = await this.fetchAllPages<{ id: string; name: string }>(scopesPath)
    const scopeNames = new Set([roleName, `role.researcher.${datasetId}`, sourceUserScopeName(datasetId)])

    for (const scope of existingScopes.filter(s => scopeNames.has(s.name))) {
      await del(`${this.baseUrl}${scopesPath}/${scope.id}`, options)
    }
  }
}
