import * as assert from "@std/assert";
import { env } from "../env.ts";
import {
    getCohortCacheTtlMs,
    isCohortCacheEntryStale,
} from "./cohortCacheTtl.ts";

const HOUR_MS = 60 * 60 * 1000;

/**
 * `COHORT_CACHE_TTL_HOURS` is populated by `initEnv()` at service startup,
 * which does not run under test, so the value is set directly around each
 * assertion.
 */
const withTtlHours = (hours: number, run: () => void): void => {
    const original = env.COHORT_CACHE_TTL_HOURS;
    env.COHORT_CACHE_TTL_HOURS = hours;
    try {
        run();
    } finally {
        env.COHORT_CACHE_TTL_HOURS = original;
    }
};

const agedHours = (hours: number): Date =>
    new Date(Date.now() - hours * HOUR_MS);

Deno.test("getCohortCacheTtlMs converts the configured hours to milliseconds", () => {
    withTtlHours(24, () => {
        assert.assertEquals(getCohortCacheTtlMs(), 24 * HOUR_MS);
    });
    withTtlHours(0.5, () => {
        assert.assertEquals(getCohortCacheTtlMs(), 30 * 60 * 1000);
    });
});

Deno.test("isCohortCacheEntryStale is false for an entry younger than the TTL", () => {
    withTtlHours(24, () => {
        assert.assertEquals(isCohortCacheEntryStale(agedHours(23)), false);
    });
});

Deno.test("isCohortCacheEntryStale is true for an entry older than the TTL", () => {
    withTtlHours(24, () => {
        assert.assertEquals(isCohortCacheEntryStale(agedHours(25)), true);
    });
});

Deno.test("isCohortCacheEntryStale is true for an entry exactly at the TTL", () => {
    // The comparison is `>=`, and the clock only moves forward between
    // building this timestamp and reading it, so the boundary is not flaky.
    withTtlHours(24, () => {
        assert.assertEquals(isCohortCacheEntryStale(agedHours(24)), true);
    });
});

Deno.test("isCohortCacheEntryStale follows the configured TTL", () => {
    // An entry 2 hours old is fresh under a 24h TTL and stale under a 1h one.
    withTtlHours(24, () => {
        assert.assertEquals(isCohortCacheEntryStale(agedHours(2)), false);
    });
    withTtlHours(1, () => {
        assert.assertEquals(isCohortCacheEntryStale(agedHours(2)), true);
    });
});

Deno.test("isCohortCacheEntryStale is true for a value that is not a valid Date", () => {
    withTtlHours(24, () => {
        assert.assertEquals(isCohortCacheEntryStale(undefined), true);
        assert.assertEquals(isCohortCacheEntryStale(null), true);
        assert.assertEquals(
            isCohortCacheEntryStale("2026-09-01T00:00:00Z"),
            true,
        );
        assert.assertEquals(isCohortCacheEntryStale(new Date("nonsense")), true);
    });
});

Deno.test("isCohortCacheEntryStale is false for a timestamp in the future", () => {
    withTtlHours(24, () => {
        assert.assertEquals(isCohortCacheEntryStale(agedHours(-1)), false);
    });
});
