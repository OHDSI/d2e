import { CohortType } from "../types.ts";

/**
 * Key format and value shapes for the `analytics.cohort_cache` table, shared
 * by the read, write and invalidation paths.
 *
 *     <datasetId>|<paConfigId>|<bookmarkId>
 *
 * Segments are joined raw because none of them can contain the delimiter:
 * `datasetId` and `paConfigId` are uuids, and a bookmark id is
 * `<alphanumeric>_<hex>`. `paConfigId` is resolved server-side from the
 * request's dataset and is never taken from the caller.
 *
 * The key carries no version segment, so an incompatible change to the stored
 * value shape means clearing the table.
 */

export const COHORT_CACHE_KEY_DELIMITER = "|";

export type CohortCacheKeyParts = {
    datasetId: string;
    paConfigId: string;
    bookmarkId: string;
};

/**
 * The stored form of a materialized cohort: `CohortType` without
 * `patientIds`, which is never written to the cache.
 */
export type CachedMaterializedCohort = Omit<CohortType, "patientIds">;

/**
 * The stored JSON value. `materializedCohort: null` is a stored negative
 * entry — the bookmark has no materialized cohort on this dataset — and
 * counts as a cache HIT, not a miss.
 */
export type CohortCacheValue = {
    materializedCohort: CachedMaterializedCohort | null;
};

const requireSegment = (name: string, value: string): string => {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Cohort cache key segment "${name}" is required`);
    }
    return value;
};

/**
 * Builds the cache key for one bookmark on one dataset. Throws if any segment
 * is empty.
 */
export const buildCohortCacheKey = ({
    datasetId,
    paConfigId,
    bookmarkId,
}: CohortCacheKeyParts): string =>
    [
        requireSegment("datasetId", datasetId),
        requireSegment("paConfigId", paConfigId),
        requireSegment("bookmarkId", bookmarkId),
    ].join(COHORT_CACHE_KEY_DELIMITER);

/**
 * Normalises a cohort into the stored value shape, dropping `patientIds`. A
 * null or undefined cohort yields a negative entry.
 */
export const buildCohortCacheValue = (
    materializedCohort: CohortType | null | undefined
): CohortCacheValue => {
    if (!materializedCohort) {
        return { materializedCohort: null };
    }
    const { patientIds: _patientIds, ...rest } = materializedCohort;
    return { materializedCohort: rest };
};

/**
 * Type guard for a value read back out of Postgres. A row whose JSON has no
 * `materializedCohort` property is treated as absent rather than as a
 * negative entry.
 */
export const isCohortCacheValue = (
    value: unknown
): value is CohortCacheValue =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "materializedCohort" in (value as Record<string, unknown>);
