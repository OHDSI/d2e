import { Service } from 'typedi'
import { env } from '../env'

// Role writes against the trex identity provider. The Logto equivalent also
// managed scopes; trex stores role names only, and the name is what the token
// carries and what downstream mapping reads, so there is nothing else to send.

const MISSING_KEY_MESSAGE =
  'TrexIdpAPI: no service role key available; set TREX__SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY'

// TREX__SERVICE_ROLE_KEY is an explicit override. trex injects the same
// credential it uses internally as SUPABASE_SERVICE_ROLE_KEY into every
// function worker's environment, usermgmt included, so that is the default
// source. Resolving to '' rather than throwing is deliberate: this class is a
// constructor dependency of UserGroupService, and a deployment with
// IDP__ROLE_STORE=logto has neither variable set and never reaches trex.
// Throwing here would take usermgmt down at DI time over a credential it never
// uses. post() raises instead, at the point the key is actually needed, so an
// empty bearer still never goes on the wire.
export function resolveServiceRoleKey(explicit: string | undefined, injected: string | undefined): string {
  return explicit || injected || ''
}

@Service()
export class TrexIdpAPI {
  constructor(
    private readonly baseUrl: string = env.TREX_ADMIN_URL ?? '',
    private readonly serviceRoleKey: string = resolveServiceRoleKey(
      env.TREX_SERVICE_ROLE_KEY,
      env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: Record<string, string>): Promise<void> {
    if (!this.serviceRoleKey) {
      throw new Error(MISSING_KEY_MESSAGE)
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`trex role ${path} failed: ${res.status}`);
    }
  }

  /**
   * Create an account and return the subject the provider gave it.
   *
   * The provider identifies accounts by email, so a bare username is qualified
   * with the configured domain - the same one the sign-in page appends, or the
   * account created here could never be signed in to.
   */
  async createUser(username: string, password: string): Promise<{ id: string; email: string }> {
    if (!this.serviceRoleKey) {
      throw new Error(MISSING_KEY_MESSAGE)
    }
    if (!env.TREX_AUTH_URL) {
      throw new Error('TrexIdpAPI: TREX__AUTH_URL is not set, so accounts cannot be created')
    }
    const email = this.accountEmail(username)
    const res = await this.fetchImpl(`${env.TREX_AUTH_URL}/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      throw new Error(`trex user creation failed for ${email}: ${res.status} ${await res.text()}`)
    }
    const created = await res.json()
    if (typeof created?.id !== 'string') {
      throw new Error(`trex accepted ${email} but returned no id`)
    }
    return { id: created.id, email }
  }

  // Sequential, not parallel: a partial failure should stop rather than leave an
  // unknown subset applied, and these lists are a handful of names.
  /**
   * The address an account is registered under.
   *
   * Bare usernames are qualified with the configured domain, the same way the
   * sign-in page does it, so a name and the account it authenticates as resolve
   * to one identity.
   */
  private accountEmail(username: string): string {
    return username.includes('@') ? username : `${username}@${env.IDP_USER_DOMAIN}`
  }

  /**
   * Change a user's password, verified against their current one.
   *
   * Two calls, because the provider's password endpoint only accepts the
   * session tokens it issues itself, and the token the portal holds is an OIDC
   * one signed with a different key - forwarding it is rejected outright. The
   * password grant both proves the current password and yields a token of the
   * kind the endpoint accepts, so the check stays with the provider rather than
   * being reimplemented here against an administrative credential.
   *
   * Returns the provider's status and message on rejection so a wrong current
   * password stays a 400 the user can act on instead of becoming a 500.
   */
  async changePassword(
    username: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    if (!env.TREX_AUTH_URL) {
      throw new Error('TrexIdpAPI: TREX__AUTH_URL is not set, so passwords cannot be changed')
    }
    const email = this.accountEmail(username)

    const grant = await this.fetchImpl(`${env.TREX_AUTH_URL}/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: currentPassword }),
    })
    if (!grant.ok) {
      // Only a rejected credential means the password was wrong. Anything else -
      // rate limiting above all, since every sign-in spends the same budget -
      // has to keep its own status, or a throttled user is told their password
      // is wrong and changes it to something that was never the problem.
      if (grant.status === 400 || grant.status === 401) {
        return { ok: false, status: 400, message: 'Current password is incorrect' }
      }
      return {
        ok: false,
        status: grant.status,
        message: `identity provider refused the credential check: ${grant.status} ${await grant.text()}`,
      }
    }
    const token = (await grant.json())?.access_token
    if (typeof token !== 'string') {
      throw new Error(`trex accepted the credentials for ${email} but returned no access token`)
    }

    const res = await this.fetchImpl(`${env.TREX_AUTH_URL}/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    if (res.ok) {
      return { ok: true }
    }
    const body = await res.text()
    let message = body
    try {
      message = JSON.parse(body)?.error ?? body
    } catch {
      // Not JSON; the raw body is the best message available.
    }
    return { ok: false, status: res.status, message }
  }

  /**
   * Set a user's password administratively, without their current one.
   *
   * The counterpart to changePassword: an administrator resetting a password
   * for someone who has lost it has no current password to exchange for a
   * token, so this goes through the admin endpoint on the service role key.
   */
  async setPassword(
    idpUserId: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    if (!this.serviceRoleKey) {
      throw new Error(MISSING_KEY_MESSAGE)
    }
    if (!env.TREX_AUTH_URL) {
      throw new Error('TrexIdpAPI: TREX__AUTH_URL is not set, so passwords cannot be set')
    }
    const res = await this.fetchImpl(`${env.TREX_AUTH_URL}/admin/users/${idpUserId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      return { ok: true }
    }
    const body = await res.text()
    let message = body
    try {
      message = JSON.parse(body)?.error ?? body
    } catch {
      // Not JSON; the raw body is the best message available.
    }
    return { ok: false, status: res.status, message }
  }

  /**
   * Remove an account.
   *
   * Deleting the account is what frees its address for reuse: a deployment that
   * removes a user and adds one back under the same name would otherwise
   * collide with the account left behind.
   */
  async deleteUser(idpUserId: string): Promise<void> {
    if (!this.serviceRoleKey) {
      throw new Error(MISSING_KEY_MESSAGE)
    }
    if (!env.TREX_AUTH_URL) {
      throw new Error('TrexIdpAPI: TREX__AUTH_URL is not set, so accounts cannot be deleted')
    }
    const res = await this.fetchImpl(`${env.TREX_AUTH_URL}/admin/users/${idpUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.serviceRoleKey}` },
    })
    // An account that is already gone is the state the caller asked for.
    if (!res.ok && res.status !== 404) {
      throw new Error(`trex user deletion failed for ${idpUserId}: ${res.status} ${await res.text()}`)
    }
  }

  /**
   * The account behind a subject, or undefined when there is none.
   */
  async getUser(idpUserId: string): Promise<{ id: string; email: string; banned: boolean } | undefined> {
    if (!this.serviceRoleKey) {
      throw new Error(MISSING_KEY_MESSAGE)
    }
    if (!env.TREX_AUTH_URL) {
      throw new Error('TrexIdpAPI: TREX__AUTH_URL is not set, so accounts cannot be read')
    }
    const res = await this.fetchImpl(`${env.TREX_AUTH_URL}/admin/users/${idpUserId}`, {
      headers: { Authorization: `Bearer ${this.serviceRoleKey}` },
    })
    if (res.status === 404) {
      return undefined
    }
    if (!res.ok) {
      throw new Error(`trex user lookup failed for ${idpUserId}: ${res.status} ${await res.text()}`)
    }
    const user = await res.json()
    return { id: user.id, email: user.email, banned: user.banned === true }
  }

  /**
   * Activate or deactivate an account.
   *
   * Deactivation is a ban rather than a deletion: the account keeps its history
   * and can be turned back on, which is what the portal's activate toggle
   * expects.
   */
  async setUserActive(idpUserId: string, active: boolean): Promise<void> {
    if (!this.serviceRoleKey) {
      throw new Error(MISSING_KEY_MESSAGE)
    }
    if (!env.TREX_AUTH_URL) {
      throw new Error('TrexIdpAPI: TREX__AUTH_URL is not set, so accounts cannot be deactivated')
    }
    const res = await this.fetchImpl(`${env.TREX_AUTH_URL}/admin/users/${idpUserId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({ banned: !active }),
    })
    if (!res.ok) {
      throw new Error(
        `trex user ${active ? 'activation' : 'deactivation'} failed for ${idpUserId}: ` +
          `${res.status} ${await res.text()}`,
      )
    }
  }

  async assignRolesToUser(idpUserId: string, roleNames: string[]): Promise<void> {
    for (const role of roleNames) {
      await this.post("/assign", { userId: idpUserId, role });
    }
  }

  async removeRolesFromUser(idpUserId: string, roleNames: string[]): Promise<void> {
    for (const role of roleNames) {
      await this.post("/remove", { userId: idpUserId, role });
    }
  }
}
