import assert from "node:assert/strict";
import {
    buildCohortCacheKey,
    buildCohortCacheValue,
    isCohortCacheValue,
} from "./cohortCacheKey.ts";

const parts = {
    datasetId: "d7fbb0d4-0c4f-4d33-9a4b-1f6bb2f0b111",
    paConfigId: "pa-config-7",
    bookmarkId: "bookmark-7",
};

Deno.test("buildCohortCacheKey emits datasetId, paConfigId, bookmarkId in order", () => {
    assert.equal(
        buildCohortCacheKey(parts),
        `${parts.datasetId}|${parts.paConfigId}|${parts.bookmarkId}`
    );
});

Deno.test("buildCohortCacheKey rejects empty segments", () => {
    assert.throws(() => buildCohortCacheKey({ ...parts, datasetId: "" }));
    assert.throws(() => buildCohortCacheKey({ ...parts, paConfigId: "" }));
    assert.throws(() => buildCohortCacheKey({ ...parts, bookmarkId: "" }));
});

Deno.test("buildCohortCacheValue drops patientIds and keeps syntax and patientCount", () => {
    assert.deepEqual(
        buildCohortCacheValue({
            id: 1234,
            name: "Diabetes cohort",
            description: "",
            creationTimestamp: "2026-08-01",
            syntax: '{"datasetId":"d1","bookmarkId":"b1"}',
            patientCount: 4213,
            patientIds: ["p1", "p2"],
        }),
        {
            materializedCohort: {
                id: 1234,
                name: "Diabetes cohort",
                description: "",
                creationTimestamp: "2026-08-01",
                syntax: '{"datasetId":"d1","bookmarkId":"b1"}',
                patientCount: 4213,
            },
        }
    );
});

Deno.test("buildCohortCacheValue builds a negative entry from null or undefined", () => {
    assert.deepEqual(buildCohortCacheValue(null), {
        materializedCohort: null,
    });
    assert.deepEqual(buildCohortCacheValue(undefined), {
        materializedCohort: null,
    });
});

Deno.test("isCohortCacheValue accepts a negative entry and rejects other shapes", () => {
    // A negative entry is a hit, so the guard has to let it through.
    assert.equal(isCohortCacheValue({ materializedCohort: null }), true);
    assert.equal(isCohortCacheValue({ materializedCohort: { name: "x" } }), true);
    assert.equal(isCohortCacheValue({}), false);
    assert.equal(isCohortCacheValue(null), false);
    assert.equal(isCohortCacheValue([]), false);
    assert.equal(isCohortCacheValue("materializedCohort"), false);
});
