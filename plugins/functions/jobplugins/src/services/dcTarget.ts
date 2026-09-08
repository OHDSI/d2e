// Decides where a DC run executes and which results schema it writes to.
// webapi-typed datasets on a direct-connectable source dialect run on the
// SOURCE database and write into the dataset's registered resultsSchemaName —
// verbatim, because Atlas reads Achilles results from the WebAPI Results
// daimon schema and the name must byte-match the registered tableQualifier.
// HANA datasets default to the SOURCE database: the trex pgwire passthrough
// cannot resolve HANA schemas, so a run routed through it dies in
// get_cdm_source with `Table with name cdm_source does not exist` before it
// reaches the database. The Prefect variable below switches them back to trex
// without a redeploy, for when that passthrough is fixed.
// Any other dataset runs through trex unless the caller explicitly asks for the
// source connection.
const SOURCE_DIALECTS = new Set(["postgres", "bigquery"]);

/** Dialects that cannot be reached through the trex pgwire passthrough. */
const DIRECT_ONLY_DIALECTS = new Set(["hana"]);

/**
 * Prefect variable that forces the dialects above back onto trex.
 * Set it to "true" to restore the pre-existing passthrough behaviour.
 */
export const DC_DIRECT_DIALECTS_USE_TREX_VARIABLE = "dc_direct_dialects_use_trex";

/** Whether a Prefect variable's raw value reads as true. */
export function isTruthyVariable(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export interface DcTargetDataset {
  id: string;
  type?: string;
  dialect?: string;
  resultsSchemaName?: string;
}

export function resolveDcTarget(
  dataset: DcTargetDataset,
  _overrideResultsSchema: string | undefined,
  requestedUseSourceConnection?: boolean,
  directDialectsUseTrex = false,
): { useSourceConnection: boolean; resultsSchema: string | null } {
  const dialect = dataset.dialect?.toLowerCase() ?? "";
  // A dialect trex cannot reach still runs on the source -- unless the Prefect
  // switch has been set, which puts it back on the passthrough everywhere.
  const directOnly = DIRECT_ONLY_DIALECTS.has(dialect) && !directDialectsUseTrex;
  const gated = dataset.type === "webapi" &&
    (SOURCE_DIALECTS.has(dialect) || directOnly);
  if (!gated) {
    // Precedence: an explicit request from the caller wins; otherwise dialects
    // that trex cannot reach default to the source connection, unless the
    // Prefect switch has been set to send them back through trex.
    // resultsSchema stays null so the caller keeps its own schema handling
    // (which already uppercases for HANA and lowercases for postgres) -- only
    // webapi datasets need the verbatim registered name.
    const useSourceConnection = requestedUseSourceConnection ?? directOnly;
    return { useSourceConnection, resultsSchema: null };
  }
  if (!dataset.resultsSchemaName) {
    // A misconfigured dataset is a client error, not a server fault. Tag the
    // error with statusCode so the controller answers 400 — the same convention
    // DataTransformation/StrategusResults already use in this service.
    const error = new Error(
      `webapi dataset ${dataset.id} has no results schema configured`,
    ) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  // The DTO override is deliberately ignored for webapi datasets.
  return { useSourceConnection: true, resultsSchema: dataset.resultsSchemaName };
}
