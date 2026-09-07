/**
 * Message returned to the client when Logto's sign-in-experience policy
 * rejects a password. It is intentionally generic: Logto's raw `rejection`
 * payload must never be echoed back to the caller.
 */
export const PASSWORD_POLICY_MESSAGE = `Password does not meet the policy: at least 8 characters, at most 64, and at least 3 of: lowercase, uppercase, number, symbol.`

/** Minimal logger surface used by the guard, so it is trivial to stub in tests. */
export interface PasswordPolicyLogger {
  warn(message: string): void
  error(message: string): void
}

/**
 * The only capability the guard needs from `LogtoAPI`. Depending on the
 * structural type (rather than the class) keeps the guard decoupled from the
 * DI container and lets tests pass a plain stub object.
 */
export interface PasswordPolicyChecker {
  checkPasswordPolicy(password: string): Promise<{ accepted: boolean; rejection?: object }>
}

export type PasswordPolicyResult =
  /** The password satisfies the policy; the caller may continue. */
  | { status: 'accepted' }
  /** The policy rejected the password; the caller should reply 400 with `message`. */
  | { status: 'rejected'; message: string }
  /** The check itself failed; the caller should forward `error` to `next()`. */
  | { status: 'error'; error: unknown }

/**
 * Build a log-safe description of a failed policy check.
 *
 * Never serialize the error itself: `AxiosError.toJSON()` includes the request
 * config, which carries the plaintext password body and the Authorization
 * header. Only the message and the HTTP status are safe to log.
 */
const describeError = (error: unknown): string => {
  const details = (typeof error === 'object' && error !== null ? error : {}) as {
    message?: unknown
    response?: { status?: unknown }
  }
  const message = typeof details.message === 'string' ? details.message : String(error)
  const status = details.response?.status ?? 'n/a'
  return `${message} (status: ${status})`
}

/**
 * Check a password against Logto's password policy and report the outcome to
 * the caller. Deliberately does not touch `res`/`next` so it stays
 * framework-light and unit testable; the route handler decides what to send.
 */
export const validatePasswordPolicy = async (
  logtoAPI: PasswordPolicyChecker,
  logger: PasswordPolicyLogger,
  password: string
): Promise<PasswordPolicyResult> => {
  try {
    const policyCheck = await logtoAPI.checkPasswordPolicy(password)
    if (!policyCheck.accepted) {
      logger.warn(`Password rejected by policy: ${JSON.stringify(policyCheck.rejection)}`)
      return { status: 'rejected', message: PASSWORD_POLICY_MESSAGE }
    }
    return { status: 'accepted' }
  } catch (error) {
    logger.error(`Error when checking password policy: ${describeError(error)}`)
    return { status: 'error', error }
  }
}
