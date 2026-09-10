import { Response } from "express";
import { Logger } from "@alp/alp-base-utils";
import { IMRIRequest } from "../../types.ts";
import MRIEndpointErrorHandler from "../../utils/MRIEndpointErrorHandler.ts";
import {
    CohortCacheDAO,
    CohortCacheUpsertEntry,
} from "../../dao/CohortCacheDAO.ts";
import {
    buildCohortCacheKey,
    buildCohortCacheValue,
    CohortCacheValue,
} from "../../utils/cohortCacheKey.ts";
import { isCohortCacheEntryStale } from "../../utils/cohortCacheTtl.ts";

const logger = Logger.CreateLogger("analytics-log");
const language = "en";

const toBookmarkIdList = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<string>();
    for (const candidate of value) {
        if (typeof candidate === "string" && candidate.length > 0) {
            seen.add(candidate);
        }
    }
    return [...seen];
};

/**
 * POST /analytics-svc/api/services/cohort-cache/lookup
 *
 * body:     { datasetId, bookmarkIds: [...] }
 * response: { entries: { <bookmarkId>: { materializedCohort } },
 *             missing: [...], stale }
 *
 * A bookmark id under `entries` is a hit, including when its
 * `materializedCohort` is `null`: that is a stored negative entry. Only ids
 * with no row at all go under `missing`.
 *
 * Expired entries are still returned as hits and are reported through a
 * single `stale` flag covering the whole response, so a caller can render
 * immediately and revalidate the dataset in one refetch.
 */
export async function lookupCohortCache(req: IMRIRequest, res: Response) {
    try {
        const body = req.body ?? {};
        const datasetId =
            typeof body.datasetId === "string" ? body.datasetId : "";
        const bookmarkIds = toBookmarkIdList(body.bookmarkIds);

        if (!datasetId) {
            return res.status(400).json({ message: "datasetId is required" });
        }

        // paConfigId is always derived server-side and is never read from the
        // request body. Without it no cache key can be built, so this throws
        // instead of reporting every bookmark as missing.
        const paConfigId = req.paConfigId;
        if (!paConfigId) {
            throw new Error(
                `Could not resolve paConfigId for dataset ${datasetId}; cohort cache lookup cannot build a key`
            );
        }

        if (bookmarkIds.length === 0) {
            return res
                .status(200)
                .json({ entries: {}, missing: [], stale: false });
        }

        const keyByBookmarkId = new Map<string, string>();
        for (const bookmarkId of bookmarkIds) {
            keyByBookmarkId.set(
                bookmarkId,
                buildCohortCacheKey({ datasetId, paConfigId, bookmarkId })
            );
        }

        const rows = await new CohortCacheDAO().lookup([
            ...keyByBookmarkId.values(),
        ]);

        const entries: Record<string, CohortCacheValue> = {};
        const missing: string[] = [];
        let stale = false;

        for (const [bookmarkId, key] of keyByBookmarkId) {
            const row = rows.get(key);
            if (!row) {
                missing.push(bookmarkId);
                continue;
            }

            entries[bookmarkId] = row.value;
            if (isCohortCacheEntryStale(row.writtenAt)) {
                stale = true;
            }
        }

        return res.status(200).json({ entries, missing, stale });
    } catch (err) {
        logger.error(err);
        return res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

/**
 * PUT /analytics-svc/api/services/cohort-cache
 *
 * body:     { datasetId, entries: [ { bookmarkId, materializedCohort } ] }
 * response: 204
 *
 * An entry whose `materializedCohort` is null/undefined is stored as a
 * negative entry. Entries without a non-empty string `bookmarkId` are skipped.
 */
export async function upsertCohortCache(req: IMRIRequest, res: Response) {
    try {
        const body = req.body ?? {};
        const datasetId =
            typeof body.datasetId === "string" ? body.datasetId : "";
        const incomingEntries = Array.isArray(body.entries) ? body.entries : [];

        if (!datasetId) {
            return res.status(400).json({ message: "datasetId is required" });
        }

        // As on the lookup path, paConfigId is derived server-side and never
        // read from the request body. Without it there is no key to write
        // under, so this throws rather than reporting a write that never ran.
        const paConfigId = req.paConfigId;
        if (!paConfigId) {
            throw new Error(
                `Could not resolve paConfigId for dataset ${datasetId}; refusing to write ${incomingEntries.length} cohort cache entries`
            );
        }

        const upsertEntries: CohortCacheUpsertEntry[] = [];
        for (const entry of incomingEntries) {
            const bookmarkId = entry?.bookmarkId;
            if (typeof bookmarkId !== "string" || bookmarkId.length === 0) {
                continue;
            }
            upsertEntries.push({
                key: buildCohortCacheKey({
                    datasetId,
                    paConfigId,
                    bookmarkId,
                }),
                value: buildCohortCacheValue(entry.materializedCohort),
            });
        }

        if (upsertEntries.length > 0) {
            await new CohortCacheDAO().upsert(upsertEntries);
        }

        return res.sendStatus(204);
    } catch (err) {
        logger.error(err);
        return res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}
