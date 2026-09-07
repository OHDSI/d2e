/**
 * Thrown when a cohort cache lookup returns a body that does not match
 * `CohortCacheLookupResponseSchema`.
 *
 * Kept distinct from a transport failure: an unreachable cache degrades to
 * `UNAVAILABLE` and nothing is written back, while an unusable body degrades
 * to `MISS` so the recomputed values overwrite it. A body that fails to parse
 * never reaches the stale-and-revalidate path, so the write-back is the only
 * thing that repairs the stored row.
 */
export class CohortCacheShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CohortCacheShapeError";
  }
}
