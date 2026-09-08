import { assertEquals, assertThrows } from "jsr:@std/assert";
import { isTruthyVariable, resolveDcTarget } from "./dcTarget.ts";

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

Deno.test("hana defaults to the source connection with no flag and no variable", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "hana__omop", dialect: "hana", resultsSchemaName: "RESULTS" },
    undefined,
  );
  // trex cannot resolve HANA schemas, so the default has to be the source.
  assertEquals(target, { useSourceConnection: true, resultsSchema: null });
});

Deno.test("HANA dialect casing does not change the default", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "hana__omop", dialect: "HANA", resultsSchemaName: "RESULTS" },
    undefined,
  );
  assertEquals(target, { useSourceConnection: true, resultsSchema: null });
});

Deno.test("the prefect switch sends hana back through trex", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "hana__omop", dialect: "hana", resultsSchemaName: "RESULTS" },
    undefined,
    undefined,
    true,
  );
  assertEquals(target, { useSourceConnection: false, resultsSchema: null });
});

Deno.test("an explicit request beats the prefect switch", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "hana__omop", dialect: "hana", resultsSchemaName: "RESULTS" },
    undefined,
    true,
    true,
  );
  assertEquals(target, { useSourceConnection: true, resultsSchema: null });
});

Deno.test("an explicit false still forces hana through trex", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "hana__omop", dialect: "hana", resultsSchemaName: "RESULTS" },
    undefined,
    false,
  );
  assertEquals(target, { useSourceConnection: false, resultsSchema: null });
});

Deno.test("non-hana dialects are unaffected by the new default", () => {
  for (const dialect of ["postgres", "bigquery", "snowflake", undefined]) {
    const target = resolveDcTarget(
      { id: "ds1", type: "omop", dialect, resultsSchemaName: "r" },
      undefined,
    );
    assertEquals(target, { useSourceConnection: false, resultsSchema: null });
  }
});

Deno.test("isTruthyVariable only accepts true", () => {
  for (const value of ["true", "TRUE", " True "]) {
    assertEquals(isTruthyVariable(value), true);
  }
  for (const value of ["false", "", "1", "yes", undefined]) {
    assertEquals(isTruthyVariable(value), false);
  }
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

Deno.test("non-hana datasets still default to trex when no flag is passed", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "omop", dialect: "postgres", resultsSchemaName: "results" },
    undefined,
  );
  assertEquals(target, { useSourceConnection: false, resultsSchema: null });
});

Deno.test("webapi + hana runs on the source and keeps its registered schema", () => {
  // Atlas reads Achilles results from the registered Results daimon schema, so
  // a webapi dataset must never be redirected to a generated one.
  const target = resolveDcTarget(
    { id: "ds1", type: "webapi", dialect: "hana", resultsSchemaName: "CDM_RESULTS" },
    undefined,
  );
  assertEquals(target, { useSourceConnection: true, resultsSchema: "CDM_RESULTS" });
});

Deno.test("the prefect switch also returns webapi + hana to trex", () => {
  const target = resolveDcTarget(
    { id: "ds1", type: "webapi", dialect: "hana", resultsSchemaName: "CDM_RESULTS" },
    undefined,
    undefined,
    true,
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
