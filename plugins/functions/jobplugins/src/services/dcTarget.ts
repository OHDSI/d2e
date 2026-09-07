// Decides where a DC run executes and which results schema it writes to.
// webapi-typed datasets on a direct-connectable source dialect run on the
// SOURCE database and write into the dataset's registered resultsSchemaName —
// verbatim, because Atlas reads Achilles results from the WebAPI Results
// daimon schema and the name must byte-match the registered tableQualifier.
// Any other dataset runs through trex unless the caller explicitly asks for the
// source connection.
const SOURCE_DIALECTS = new Set(["postgres", "bigquery"]);

export interface DcTargetDataset {
  id: string;
  type?: string;
  dialect?: string;
  resultsSchemaName?: string;
}

export function resolveDcTarget(
  dataset: DcTargetDataset,
  _overrideResultsSchema: string | undefined,
  requestedUseSourceConnection = false,
): { useSourceConnection: boolean; resultsSchema: string | null } {
  const gated = dataset.type === "webapi" &&
    SOURCE_DIALECTS.has(dataset.dialect?.toLowerCase() ?? "");
  if (!gated) {
    // Non-webapi datasets may still ask to run on the source. The trex pgwire
    // passthrough cannot resolve HANA schemas, so a HANA dataset routed through
    // it fails in get_cdm_source before reaching the database; running on the
    // source is the only way those datasets can be characterized at all.
    // resultsSchema stays null so the caller keeps its own schema handling
    // (which already uppercases for HANA and lowercases for postgres) -- only
    // webapi datasets need the verbatim registered name.
    return {
      useSourceConnection: requestedUseSourceConnection,
      resultsSchema: null,
    };
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
