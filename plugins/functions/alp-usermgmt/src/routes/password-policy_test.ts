import assert from 'node:assert/strict'
import {
  PASSWORD_POLICY_MESSAGE,
  PasswordPolicyChecker,
  validatePasswordPolicy
} from './password-policy.ts'

function createLogger() {
  const warnings: string[] = []
  const errors: string[] = []
  return {
    warnings,
    errors,
    warn: (message: string) => warnings.push(message),
    error: (message: string) => errors.push(message)
  }
}

function checker(impl: PasswordPolicyChecker['checkPasswordPolicy']): PasswordPolicyChecker {
  return { checkPasswordPolicy: impl }
}

Deno.test('accepts a password the policy allows', async () => {
  const logger = createLogger()
  const seen: string[] = []
  const result = await validatePasswordPolicy(
    checker(async password => {
      seen.push(password)
      return { accepted: true }
    }),
    logger,
    'Str0ng!Pass'
  )

  assert.deepEqual(result, { status: 'accepted' })
  assert.deepEqual(seen, ['Str0ng!Pass'])
  assert.deepEqual(logger.warnings, [])
  assert.deepEqual(logger.errors, [])
})

Deno.test('rejects a password the policy refuses and returns the generic message', async () => {
  const logger = createLogger()
  const rejection = { code: 'password_rejected.character_types', data: { min: 3 } }
  const result = await validatePasswordPolicy(
    checker(async () => ({ accepted: false, rejection })),
    logger,
    'weakpass'
  )

  assert.deepEqual(result, { status: 'rejected', message: PASSWORD_POLICY_MESSAGE })
  assert.equal(logger.errors.length, 0)
  assert.equal(logger.warnings.length, 1)
  // The rejection detail is logged server-side for troubleshooting...
  assert.match(logger.warnings[0], /password_rejected\.character_types/)
  // ...but never leaks the password itself.
  assert.doesNotMatch(logger.warnings[0], /weakpass/)
})

Deno.test('reports an error result when the policy check itself fails', async () => {
  const logger = createLogger()
  const failure = { message: 'Service Unavailable', response: { status: 503 } }
  const result = await validatePasswordPolicy(
    checker(async () => {
      throw failure
    }),
    logger,
    'Str0ng!Pass'
  )

  assert.equal(result.status, 'error')
  assert.equal(result.status === 'error' && result.error, failure)
  assert.equal(logger.warnings.length, 0)
  assert.deepEqual(logger.errors, [
    'Error when checking password policy: Service Unavailable (status: 503)'
  ])
})

Deno.test('never serializes the failing error, so the password and token cannot leak', async () => {
  const logger = createLogger()
  // Shaped like an AxiosError: `config` carries the request body and auth header.
  const axiosLikeError = {
    message: 'Request failed with status code 401',
    response: { status: 401 },
    config: {
      data: JSON.stringify({ password: 'Str0ng!Pass' }),
      headers: { Authorization: 'Bearer super-secret-token' }
    }
  }

  const result = await validatePasswordPolicy(
    checker(async () => {
      throw axiosLikeError
    }),
    logger,
    'Str0ng!Pass'
  )

  assert.equal(result.status, 'error')
  assert.equal(logger.errors.length, 1)
  assert.doesNotMatch(logger.errors[0], /Str0ng!Pass/)
  assert.doesNotMatch(logger.errors[0], /super-secret-token/)
  assert.equal(
    logger.errors[0],
    'Error when checking password policy: Request failed with status code 401 (status: 401)'
  )
})

Deno.test('falls back to a safe description when the thrown value has no message', async () => {
  const logger = createLogger()
  const result = await validatePasswordPolicy(
    checker(async () => {
      throw 'boom'
    }),
    logger,
    'Str0ng!Pass'
  )

  assert.equal(result.status, 'error')
  assert.deepEqual(logger.errors, ['Error when checking password policy: boom (status: n/a)'])
})
