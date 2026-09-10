import { Logger } from "@alp/alp-base-utils";
import { CohortType } from "../types.ts";
import { CohortCacheDAO, CohortCacheRow } from "../dao/CohortCacheDAO.ts";
import type { CohortEndpoint } from "../mri/endpoint/CohortEndpoint.ts";
import {
    buildCohortCacheKey,
    buildCohortCacheValue,
    CohortCacheValue,
} from "./cohortCacheKey.ts";

const logger = Logger.CreateLogger("analytics-log");

/**
 * Keeps `analytics.cohort_cache` in step with the cohort writes that change
 * what is cached for a bookmark: materializing a cohort
 * (`refreshCohortCacheEntry`), deleting one (`evictCohortCacheEntry`), and
 * updating its definition (`updateCohortCacheEntryMetadata`).
 *
 * Nothing here throws: a failed cache write leaves a stale entry for the TTL
 * to expire, and must never fail the cohort write it follows. An entry whose
 * key cannot be built is left alone rather than widened into a dataset-wide
 * delete.
 */

/** The DAO surface this module uses, so tests can supply a fake. */
export interface CohortCacheWriter {
    lookup(keys: string[]): Promise<Map<string, CohortCacheRow>>;
    deleteKey(key: string): Promise<number>;
    upsert(
        entries: { key: string; value: CohortCacheValue }[]
    ): Promise<number>;
}

/**
 * The `CohortEndpoint` surface this module uses. Picked from the class rather
 * than redeclared, so a signature change there fails here. `Pick` rather than
 * the class itself: naming it outright would oblige every test double to
 * implement all of it.
 */
export type CohortDefinitionReader = Pick<
    CohortEndpoint,
    "getCohortDefinition" | "queryCohorts"
>;

const asNonEmptyString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

/**
 * Extracts `bookmarkId` from a `COHORT_DEFINITION_SYNTAX` JSON blob. Returns
 * null for unparseable syntax and for Atlas-backed cohorts, which carry no
 * bookmark id and so have no cache entry to act on.
 */
export const readBookmarkIdFromSyntax = (syntax: unknown): string | null => {
    const raw = asNonEmptyString(syntax);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        return asNonEmptyString(parsed?.bookmarkId);
    } catch {
        return null;
    }
};

const buildKey = (
    datasetId: unknown,
    paConfigId: unknown,
    bookmarkId: unknown
): string | null => {
    const dataset = asNonEmptyString(datasetId);
    const paConfig = asNonEmptyString(paConfigId);
    const bookmark = asNonEmptyString(bookmarkId);
    if (!dataset || !paConfig || !bookmark) {
        return null;
    }
    return buildCohortCacheKey({
        datasetId: dataset,
        paConfigId: paConfig,
        bookmarkId: bookmark,
    });
};

/**
 * Reads a cohort definition's `COHORT_DEFINITION_SYNTAX`, or null if it cannot
 * be read. Never throws. Callers must run this before deleting a cohort: the
 * definition row carries the only copy of the bookmark id.
 */
export const readCohortDefinitionSyntax = async (
    cohortEndpoint: CohortDefinitionReader,
    cohortDefinitionId: unknown
): Promise<string | null> => {
    const id =
        cohortDefinitionId === undefined || cohortDefinitionId === null
            ? ""
            : String(cohortDefinitionId);
    if (!id) {
        return null;
    }
    try {
        const result = await cohortEndpoint.getCohortDefinition(id);
        const rows = Array.isArray(result?.data) ? result.data : [];
        const row = rows[0] as Record<string, unknown> | undefined;
        if (!row) {
            return null;
        }
        return asNonEmptyString(row.COHORT_DEFINITION_SYNTAX);
    } catch (err) {
        logger.warn(
            `Could not read cohort definition ${id} for the cohort cache: ${
                err instanceof Error ? err.message : String(err)
            }`
        );
        return null;
    }
};

/**
 * Deletes the entry for the bookmark named by `syntax`. Returns true only if a
 * delete was actually issued.
 */
export const evictCohortCacheEntry = async (
    {
        syntax,
        datasetId,
        paConfigId,
    }: { syntax?: unknown; datasetId?: unknown; paConfigId?: unknown },
    dao: CohortCacheWriter = new CohortCacheDAO()
): Promise<boolean> => {
    const key = buildKey(
        datasetId,
        paConfigId,
        readBookmarkIdFromSyntax(syntax)
    );
    if (!key) {
        // Not a bookmark-backed cohort, or the ids needed to address the
        // entry are missing. Leave it to the TTL.
        return false;
    }
    try {
        await dao.deleteKey(key);
        return true;
    } catch (err) {
        logger.warn(
            `Cohort cache eviction failed for bookmark entry: ${
                err instanceof Error ? err.message : String(err)
            }`
        );
        return false;
    }
};

/**
 * Overwrites the entry for a bookmark whose cohort has just been materialized.
 *
 * The cohort is re-read with `queryCohorts({ ID })` rather than assembled from
 * what the write path already holds, because only that query yields the cached
 * `patientCount` as `COUNT(DISTINCT SUBJECT_ID)`; both write paths return
 * inserted row counts instead. `excludePatientIds` is set so no subject ids
 * are fetched.
 */
export const refreshCohortCacheEntry = async (
    {
        cohortEndpoint,
        cohortDefinitionId,
        bookmarkId,
        datasetId,
        paConfigId,
    }: {
        cohortEndpoint: CohortDefinitionReader;
        cohortDefinitionId: unknown;
        bookmarkId?: unknown;
        datasetId?: unknown;
        paConfigId?: unknown;
    },
    dao: CohortCacheWriter = new CohortCacheDAO()
): Promise<boolean> => {
    const key = buildKey(datasetId, paConfigId, bookmarkId);
    if (!key) {
        return false;
    }
    try {
        const [materialized] = await cohortEndpoint.queryCohorts(
            { ID: cohortDefinitionId },
            0,
            1,
            true
        );
        if (!materialized) {
            // The definition was just written, so an empty result means the
            // read failed rather than that there is no cohort. Drop any stale
            // entry and let the next read rebuild it.
            await dao.deleteKey(key);
            return false;
        }
        await dao.upsert([{ key, value: buildCohortCacheValue(materialized) }]);
        return true;
    } catch (err) {
        logger.warn(
            `Cohort cache refresh failed after materializing cohort ${cohortDefinitionId}: ${
                err instanceof Error ? err.message : String(err)
            }`
        );
        return false;
    }
};

/**
 * Rewrites the cached `name` and `description` of an already-cached entry
 * after a cohort definition update.
 *
 * Does not touch the analytics database: a definition update cannot change
 * `patientCount` or `creationTimestamp`, so the cached values are carried over
 * and the expensive `COUNT(DISTINCT SUBJECT_ID)` is skipped. That also makes
 * this safe to call without awaiting — it uses only the cache's own
 * short-lived Postgres connection, whereas anything going through
 * `cohortEndpoint` would race `cleanupMiddleware` closing
 * `analyticsConnection` inside `res.end`.
 *
 * A cache miss is not an error; the next read builds the entry with the new
 * values.
 */
export const updateCohortCacheEntryMetadata = async (
    {
        syntax,
        datasetId,
        paConfigId,
        name,
        description,
    }: {
        syntax?: unknown;
        datasetId?: unknown;
        paConfigId?: unknown;
        name?: unknown;
        description?: unknown;
    },
    dao: CohortCacheWriter = new CohortCacheDAO()
): Promise<boolean> => {
    const key = buildKey(
        datasetId,
        paConfigId,
        readBookmarkIdFromSyntax(syntax)
    );
    if (!key) {
        return false;
    }
    try {
        const existing = (await dao.lookup([key])).get(key);
        const cached = existing?.value.materializedCohort;
        if (!cached) {
            // No entry, or a negative entry, which a metadata update cannot
            // turn into a positive one. Leave it for the next read.
            return false;
        }
        await dao.upsert([
            {
                key,
                value: {
                    materializedCohort: {
                        ...cached,
                        name: typeof name === "string" ? name : cached.name,
                        description:
                            typeof description === "string"
                                ? description
                                : cached.description,
                        // patientCount and creationTimestamp are unchanged
                        // by a definition update, so the cached values stand.
                    },
                },
            },
        ]);
        return true;
    } catch (err) {
        logger.warn(
            `Cohort cache metadata update failed: ${
                err instanceof Error ? err.message : String(err)
            }`
        );
        return false;
    }
};
