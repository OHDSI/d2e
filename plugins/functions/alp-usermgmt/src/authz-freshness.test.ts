import { assertEquals } from '@std/assert'
import { isTokenAuthzFresh } from './authz-freshness.ts'

const SKEW_MS = 2000

Deno.test('null authz_changed_at means the token is fresh', () => {
  assertEquals(isTokenAuthzFresh(1_700_000_000, null, SKEW_MS), true)
})

Deno.test('token issued after the change is fresh', () => {
  assertEquals(isTokenAuthzFresh(1_700_000_010, new Date(1_700_000_000_000), SKEW_MS), true)
})

Deno.test('token issued well before the change is stale', () => {
  assertEquals(isTokenAuthzFresh(1_699_999_000, new Date(1_700_000_000_000), SKEW_MS), false)
})

Deno.test('token issued in the same second as the change is stale (iat has second granularity)', () => {
  // change at 1_700_000_000.400s; a token minted at 1_700_000_000.100s also reports iat=1_700_000_000
  assertEquals(isTokenAuthzFresh(1_700_000_000, new Date(1_700_000_000_400), 0), false)
})

Deno.test('clock skew allowance keeps a token minted just before the change fresh', () => {
  assertEquals(isTokenAuthzFresh(1_699_999_999, new Date(1_700_000_001_000), SKEW_MS), true)
})

Deno.test('missing iat is treated as stale when a change is recorded', () => {
  assertEquals(isTokenAuthzFresh(undefined, new Date(1_700_000_000_000), SKEW_MS), false)
})

Deno.test('missing iat with no recorded change is still fresh', () => {
  assertEquals(isTokenAuthzFresh(undefined, null, SKEW_MS), true)
})

Deno.test('an unusable skew degrades to no allowance instead of failing every comparison', () => {
  // A NaN skew must not make a genuinely fresh token look stale — that would
  // lock out every signed-in user at once.
  assertEquals(isTokenAuthzFresh(1_700_000_010, new Date(1_700_000_000_000), NaN), true)
  assertEquals(isTokenAuthzFresh(1_700_000_010, new Date(1_700_000_000_000), Infinity), true)
  // ...and it must not make a genuinely stale token look fresh either.
  assertEquals(isTokenAuthzFresh(1_699_999_000, new Date(1_700_000_000_000), NaN), false)
})
