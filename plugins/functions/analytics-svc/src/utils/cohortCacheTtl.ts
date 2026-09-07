import { env } from "../env.ts";

/**
 * How long an `analytics.cohort_cache` row is served before it counts as
 * stale.
 *
 * Expiry is neither a delete nor a miss: an expired row is still returned to
 * the caller, flagged stale, so the caller can serve it and revalidate in the
 * background.
 *
 * `COHORT_CACHE_TTL_HOURS` is required and validated as a positive number by
 * the env schema, so this module does not handle a missing or unusable value.
 */

const MS_PER_HOUR = 60 * 60 * 1000;

/** The configured TTL in milliseconds. */
export const getCohortCacheTtlMs = (): number =>
    env.COHORT_CACHE_TTL_HOURS * MS_PER_HOUR;

/**
 * True when `writtenAt` is at least one TTL old. Anything that is not a `Date`
 * — a date string included — is reported stale, since an entry of unknown age
 * has no bound on how far out of date it can be.
 */
export const isCohortCacheEntryStale = (writtenAt: unknown): boolean => {
    const writtenAtMs =
        writtenAt instanceof Date ? writtenAt.getTime() : Number.NaN;
    if (!Number.isFinite(writtenAtMs)) {
        return true;
    }
    return Date.now() - writtenAtMs >= getCohortCacheTtlMs();
};
