import * as assert from "@std/assert";
import {
    evictCohortCacheEntry,
    readBookmarkIdFromSyntax,
    readCohortDefinitionSyntax,
    refreshCohortCacheEntry,
    updateCohortCacheEntryMetadata,
} from "./cohortCacheMaintenance.ts";
import { buildCohortCacheKey } from "./cohortCacheKey.ts";

const DATASET = "dataset-1";
const PA_CONFIG = "pa-config-1";
const BOOKMARK = "bmk-1";
const KEY = buildCohortCacheKey({
    datasetId: DATASET,
    paConfigId: PA_CONFIG,
    bookmarkId: BOOKMARK,
});

const bookmarkSyntax = JSON.stringify({
    datasetId: DATASET,
    bookmarkId: BOOKMARK,
});

const fakeDao = (stored: Record<string, unknown> = {}) => {
    const calls: string[] = [];
    const deleted: string[] = [];
    const upserted: { key: string; value: unknown }[] = [];
    return {
        calls,
        deleted,
        upserted,
        // deno-lint-ignore require-await
        lookup: async (keys: string[]) => {
            calls.push("lookup");
            const found = new Map<string, unknown>();
            for (const k of keys) {
                if (Object.prototype.hasOwnProperty.call(stored, k)) {
                    // `stored` holds bare cache values; the DAO wraps each
                    // one with the `written_at` the TTL is measured against.
                    found.set(k, { value: stored[k], writtenAt: new Date() });
                }
            }
            return found as Map<string, never>;
        },
        // deno-lint-ignore require-await
        deleteKey: async (key: string) => {
            calls.push("deleteKey");
            deleted.push(key);
            return 1;
        },
        // deno-lint-ignore require-await
        upsert: async (entries: { key: string; value: unknown }[]) => {
            calls.push("upsert");
            upserted.push(...entries);
            return entries.length;
        },
    };
};

const cohortRow = (overrides: Record<string, unknown> = {}) => ({
    id: 42,
    name: "cohort 42",
    description: "",
    creationTimestamp: "2026-08-01",
    syntax: bookmarkSyntax,
    patientCount: 137,
    ...overrides,
});

// --- readBookmarkIdFromSyntax -------------------------------------------------

Deno.test("readBookmarkIdFromSyntax returns the bookmark id from bookmark syntax", () => {
    assert.assertEquals(readBookmarkIdFromSyntax(bookmarkSyntax), BOOKMARK);
});

Deno.test("readBookmarkIdFromSyntax returns null for an atlas-backed cohort", () => {
    const atlas = JSON.stringify({
        datasetId: DATASET,
        atlasCohortDefinitionId: 9,
    });
    assert.assertEquals(readBookmarkIdFromSyntax(atlas), null);
});

Deno.test("readBookmarkIdFromSyntax returns null for unparseable or empty syntax", () => {
    assert.assertEquals(readBookmarkIdFromSyntax("not json"), null);
    assert.assertEquals(readBookmarkIdFromSyntax(""), null);
    assert.assertEquals(readBookmarkIdFromSyntax(undefined), null);
    assert.assertEquals(readBookmarkIdFromSyntax(JSON.stringify({})), null);
});

// --- evictCohortCacheEntry ----------------------------------------------------

Deno.test("evictCohortCacheEntry deletes the key for a bookmark-backed cohort", async () => {
    const dao = fakeDao();
    const evicted = await evictCohortCacheEntry(
        { syntax: bookmarkSyntax, datasetId: DATASET, paConfigId: PA_CONFIG },
        dao,
    );
    assert.assertEquals(evicted, true);
    assert.assertEquals(dao.deleted, [KEY]);
});

Deno.test("evictCohortCacheEntry does nothing when the bookmark id cannot be read", async () => {
    const dao = fakeDao();
    const evicted = await evictCohortCacheEntry(
        { syntax: "not json", datasetId: DATASET, paConfigId: PA_CONFIG },
        dao,
    );
    // There is no dataset-wide fallback: an unaddressable entry is left to
    // the TTL.
    assert.assertEquals(evicted, false);
    assert.assertEquals(dao.calls, []);
});

Deno.test("evictCohortCacheEntry does nothing without a paConfigId", async () => {
    const dao = fakeDao();
    const evicted = await evictCohortCacheEntry(
        { syntax: bookmarkSyntax, datasetId: DATASET, paConfigId: undefined },
        dao,
    );
    assert.assertEquals(evicted, false);
    assert.assertEquals(dao.calls, []);
});

Deno.test("evictCohortCacheEntry returns false when the delete throws", async () => {
    const dao = {
        lookup: () => Promise.resolve(new Map()),
        deleteKey: () => Promise.reject(new Error("postgres down")),
        upsert: () => Promise.resolve(0),
    };
    const evicted = await evictCohortCacheEntry(
        { syntax: bookmarkSyntax, datasetId: DATASET, paConfigId: PA_CONFIG },
        dao,
    );
    assert.assertEquals(evicted, false);
});

// --- refreshCohortCacheEntry --------------------------------------------------

Deno.test("refreshCohortCacheEntry re-reads the cohort and upserts the entry", async () => {
    const dao = fakeDao();
    let queried: unknown;
    const cohortEndpoint = {
        getCohortDefinition: () => Promise.resolve({ data: [] }),
        queryCohorts: (params: Record<string, unknown>) => {
            queried = params;
            return Promise.resolve([cohortRow()]);
        },
    };

    const refreshed = await refreshCohortCacheEntry(
        {
            cohortEndpoint,
            cohortDefinitionId: 42,
            bookmarkId: BOOKMARK,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
        },
        dao,
    );

    assert.assertEquals(refreshed, true);
    // Queried by definition id, so patientCount comes from the same
    // COUNT(DISTINCT SUBJECT_ID) the read path caches.
    assert.assertEquals(queried, { ID: 42 });
    assert.assertEquals(dao.upserted.length, 1);
    assert.assertEquals(dao.upserted[0].key, KEY);
    assert.assertEquals(dao.upserted[0].value, {
        materializedCohort: {
            id: 42,
            name: "cohort 42",
            description: "",
            creationTimestamp: "2026-08-01",
            syntax: bookmarkSyntax,
            patientCount: 137,
        },
    });
});

Deno.test("refreshCohortCacheEntry omits patientIds from the stored value", async () => {
    const dao = fakeDao();
    const cohortEndpoint = {
        getCohortDefinition: () => Promise.resolve({ data: [] }),
        queryCohorts: () =>
            Promise.resolve([
                cohortRow({ patientIds: ["a", "b", "c"] }),
            ]),
    };

    await refreshCohortCacheEntry(
        {
            cohortEndpoint,
            cohortDefinitionId: 42,
            bookmarkId: BOOKMARK,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
        },
        dao,
    );

    const value = dao.upserted[0].value as {
        materializedCohort: Record<string, unknown>;
    };
    assert.assertEquals("patientIds" in value.materializedCohort, false);
});

Deno.test("refreshCohortCacheEntry deletes the entry when the cohort cannot be re-read", async () => {
    const dao = fakeDao();
    const cohortEndpoint = {
        getCohortDefinition: () => Promise.resolve({ data: [] }),
        queryCohorts: () => Promise.resolve([]),
    };

    const refreshed = await refreshCohortCacheEntry(
        {
            cohortEndpoint,
            cohortDefinitionId: 42,
            bookmarkId: BOOKMARK,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
        },
        dao,
    );

    assert.assertEquals(refreshed, false);
    assert.assertEquals(dao.deleted, [KEY]);
    assert.assertEquals(dao.upserted, []);
});

Deno.test("refreshCohortCacheEntry returns false when the query throws", async () => {
    const dao = fakeDao();
    const cohortEndpoint = {
        getCohortDefinition: () => Promise.resolve({ data: [] }),
        queryCohorts: () => Promise.reject(new Error("hana unavailable")),
    };

    const refreshed = await refreshCohortCacheEntry(
        {
            cohortEndpoint,
            cohortDefinitionId: 42,
            bookmarkId: BOOKMARK,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
        },
        dao,
    );
    assert.assertEquals(refreshed, false);
});

// --- readCohortDefinitionSyntax ----------------------------------------------

Deno.test("readCohortDefinitionSyntax reads the aliased uppercase column", async () => {
    // `CohortEndpoint.getCohortDefinition` aliases every column, so the name
    // comes back uppercase regardless of dialect.
    const endpoint = {
        getCohortDefinition: () =>
            Promise.resolve({
                data: [{ COHORT_DEFINITION_SYNTAX: bookmarkSyntax }],
            }),
        queryCohorts: () => Promise.resolve([]),
    };
    assert.assertEquals(
        await readCohortDefinitionSyntax(endpoint, 42),
        bookmarkSyntax,
    );
});

Deno.test("readCohortDefinitionSyntax returns null on a failed read", async () => {
    const endpoint = {
        getCohortDefinition: () => Promise.reject(new Error("gone")),
        queryCohorts: () => Promise.resolve([]),
    };
    assert.assertEquals(await readCohortDefinitionSyntax(endpoint, 42), null);
});

// --- eviction ordering -------------------------------------------------------

Deno.test("evictCohortCacheEntry can only build a key while the definition row exists", async () => {
    // The definition row carries the only copy of the bookmark id, so the
    // read-evict-delete order is load-bearing. Reversing it raises no error,
    // it just leaves a stale entry behind.
    const definitionRows = [{ COHORT_DEFINITION_SYNTAX: bookmarkSyntax }];
    let definitionDeleted = false;
    const cohortEndpoint = {
        getCohortDefinition: () =>
            Promise.resolve({ data: definitionDeleted ? [] : definitionRows }),
        queryCohorts: () => Promise.resolve([]),
    };

    const evictBeforeDelete = fakeDao();
    const syntaxBefore = await readCohortDefinitionSyntax(cohortEndpoint, 42);
    await evictCohortCacheEntry(
        { syntax: syntaxBefore, datasetId: DATASET, paConfigId: PA_CONFIG },
        evictBeforeDelete,
    );
    definitionDeleted = true;

    assert.assertEquals(syntaxBefore, bookmarkSyntax);
    assert.assertEquals(evictBeforeDelete.deleted, [KEY]);

    const evictAfterDelete = fakeDao();
    const syntaxAfter = await readCohortDefinitionSyntax(cohortEndpoint, 42);
    await evictCohortCacheEntry(
        { syntax: syntaxAfter, datasetId: DATASET, paConfigId: PA_CONFIG },
        evictAfterDelete,
    );

    assert.assertEquals(syntaxAfter, null);
    assert.assertEquals(evictAfterDelete.calls, []);
});

// --- updateCohortCacheEntryMetadata ------------------------------------------

Deno.test("updateCohortCacheEntryMetadata rewrites name and description and keeps patientCount", async () => {
    const dao = fakeDao({
        [KEY]: {
            materializedCohort: {
                id: 42,
                name: "old name",
                description: "old description",
                creationTimestamp: "2026-08-01",
                syntax: bookmarkSyntax,
                patientCount: 137,
            },
        },
    });

    const updated = await updateCohortCacheEntryMetadata(
        {
            syntax: bookmarkSyntax,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
            name: "new name",
            description: "new description",
        },
        dao,
    );

    assert.assertEquals(updated, true);
    assert.assertEquals(dao.upserted[0].value, {
        materializedCohort: {
            id: 42,
            name: "new name",
            description: "new description",
            creationTimestamp: "2026-08-01",
            syntax: bookmarkSyntax,
            // Carried over rather than recomputed.
            patientCount: 137,
        },
    });
});

Deno.test("updateCohortCacheEntryMetadata issues only a lookup and an upsert", async () => {
    const dao = fakeDao({
        [KEY]: { materializedCohort: { id: 42, name: "old", patientCount: 9 } },
    });
    await updateCohortCacheEntryMetadata(
        {
            syntax: bookmarkSyntax,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
            name: "new",
        },
        dao,
    );
    // Only the cache's own connection is used, so nothing here can race
    // cleanupMiddleware closing analyticsConnection.
    assert.assertEquals(dao.calls, ["lookup", "upsert"]);
});

Deno.test("updateCohortCacheEntryMetadata is a no-op when nothing is cached", async () => {
    const dao = fakeDao();
    const updated = await updateCohortCacheEntryMetadata(
        {
            syntax: bookmarkSyntax,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
            name: "new name",
        },
        dao,
    );
    assert.assertEquals(updated, false);
    assert.assertEquals(dao.upserted, []);
});

Deno.test("updateCohortCacheEntryMetadata leaves a negative entry unchanged", async () => {
    const dao = fakeDao({ [KEY]: { materializedCohort: null } });
    const updated = await updateCohortCacheEntryMetadata(
        {
            syntax: bookmarkSyntax,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
            name: "new name",
        },
        dao,
    );
    // A metadata update cannot turn a negative entry into a positive one.
    assert.assertEquals(updated, false);
    assert.assertEquals(dao.upserted, []);
});

Deno.test("updateCohortCacheEntryMetadata returns false when the lookup throws", async () => {
    const dao = {
        lookup: () => Promise.reject(new Error("postgres down")),
        deleteKey: () => Promise.resolve(0),
        upsert: () => Promise.resolve(0),
    };
    const updated = await updateCohortCacheEntryMetadata(
        {
            syntax: bookmarkSyntax,
            datasetId: DATASET,
            paConfigId: PA_CONFIG,
            name: "new name",
        },
        dao,
    );
    assert.assertEquals(updated, false);
});

