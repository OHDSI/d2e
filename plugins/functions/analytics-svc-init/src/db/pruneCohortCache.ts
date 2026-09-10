import { Knex } from "knex";
import { env } from "../env.ts";

/**
 * Age threshold, in days, for deleting cohort cache rows. Kept well above the
 * read TTL so the sweep only reclaims rows that are no longer read, instead of
 * turning a fast stale hit into a blocking recompute.
 *
 * `COHORT_CACHE_MAX_AGE_DAYS` is required and validated as a positive number
 * by the env schema, so nothing here handles it being absent or unusable.
 */
export const getCohortCacheMaxAgeDays = (): number =>
  env.COHORT_CACHE_MAX_AGE_DAYS;

/**
 * Deletes cohort cache rows older than the configured age threshold,
 * reclaiming entries that no invalidation path will revisit.
 *
 * Runs once per init run, after the migrations. Never throws: the cache is a
 * latency optimisation, so a failed sweep must not fail initialisation.
 */
export async function pruneCohortCache(k: Knex, schema: string): Promise<void> {
  const maxAgeDays = getCohortCacheMaxAgeDays();

  try {
    const deleted = await k
      .withSchema(schema)
      .from("cohort_cache")
      .whereRaw("written_at < now() - make_interval(days => ?)", [maxAgeDays])
      .del();

    console.log(
      `analytics-svc-init cohort_cache prune: removed ${deleted} entries older than ${maxAgeDays} days`,
    );
  } catch (error) {
    console.error(
      "analytics-svc-init cohort_cache prune failed, continuing startup:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
