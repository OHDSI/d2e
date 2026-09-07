import { assertEquals, assertThrows } from "jsr:@std/assert";
import { resolveDcTarget } from "./dcTarget.ts";

Deno.test("webapi + postgres runs on the source with the registered results schema", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "webapi", dialect: "postgres", resultsSchemaName: "cdm_results" },
    "ignored_override",
  );
  assertEquals(target, { useSourceConnection: true, resultsSchema: "cdm_results" });
});

Deno.test("webapi + bigquery runs on the source with the registered results schema", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "webapi", dialect: "bigquery", resultsSchemaName: "cdm_results" },
    undefined,
  );
  assertEquals(target, { useSourceConnection: true, resultsSchema: "cdm_results" });
});

Deno.test("webapi dataset without a results schema fails fast as a client error", () => {
  const error = assertThrows(
    () => resolveDcTarget({ id: "ds1", type: "webapi", dialect: "postgres", resultsSchemaName: "" }, undefined),
    Error,
    "webapi dataset ds1 has no results schema configured",
  );
  // Tagged so the controller answers 400 instead of falling into the catch-all 500.
  assertEquals((error as Error & { statusCode?: number }).statusCode, 400);
});

Deno.test("non-webapi datasets keep the caller's schema handling", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: undefined, dialect: "postgres", resultsSchemaName: "cdm_results" },
    undefined,
  );
  assertEquals(target, { useSourceConnection: false, resultsSchema: null });
});

Deno.test("a non-webapi dataset can opt into the source connection", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "hana__omop", dialect: "hana", resultsSchemaName: "RESULTS" },
    undefined,
    true,
  );
  // resultsSchema stays null: the caller applies its own dialect casing.
  assertEquals(target, { useSourceConnection: true, resultsSchema: null });
});

Deno.test("the opt-in defaults to off, so existing callers are unaffected", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "hana__omop", dialect: "hana", resultsSchemaName: "RESULTS" },
    undefined,
  );
  assertEquals(target, { useSourceConnection: false, resultsSchema: null });
});

Deno.test("webapi on a non-source dialect (hana) keeps current behavior", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "webapi", dialect: "hana", resultsSchemaName: "CDM_RESULTS" },
    undefined,
  );
  assertEquals(target, { useSourceConnection: false, resultsSchema: null });
});

Deno.test("webapi + postgres ignores the opt-in flag and stays verbatim", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "webapi", dialect: "postgres", resultsSchemaName: "cdm_results" },
    undefined,
    false,
  );
  assertEquals(target, { useSourceConnection: true, resultsSchema: "cdm_results" });
});
