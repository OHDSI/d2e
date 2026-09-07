/**
 * A Logto access token carries the user's roles as a claim, computed when the
 * token was minted. `authz_changed_at` records the last time this user's
 * authorization was mutated. A token whose `iat` predates that moment is
 * carrying claims we already know to be out of date.
 *
 * Semantics, deliberately chosen:
 *  - `iat` is in SECONDS (RFC 7519); `authzChangedAt` has millisecond precision.
 *    We compare in seconds and round the change time UP, so a token minted in the
 *    same wall-clock second as the change is treated as STALE. A false "stale"
 *    costs one silent renewal; a false "fresh" is a security miss.
 *  - `skewMs` tolerates clock drift between Logto and this service by moving the
 *    change time slightly earlier. It bounds how long a just-pre-change token is
 *    still accepted, so keep it small.
 *  - A null/undefined `authzChangedAt` means no change has ever been recorded for
 *    this user, so every token is fresh. This is what makes the rollout silent.
 */
export const isTokenAuthzFresh = (
  iatSeconds: number | undefined,
  authzChangedAt: Date | null | undefined,
  skewMs: number
): boolean => {
  if (authzChangedAt == null) {
    return true
  }
  if (typeof iatSeconds !== 'number' || !Number.isFinite(iatSeconds)) {
    return false
  }
  // Backstop against a caller passing NaN/Infinity/negative: an unusable skew
  // must degrade to "no allowance", never poison the comparison. A NaN here
  // would make every comparison false and lock out every user at once.
  const allowanceMs = Number.isFinite(skewMs) && skewMs > 0 ? skewMs : 0
  const thresholdSeconds = Math.ceil((authzChangedAt.getTime() - allowanceMs) / 1000)
  return iatSeconds >= thresholdSeconds
}

export const DEFAULT_AUTHZ_FRESHNESS_SKEW_MS = 2000
