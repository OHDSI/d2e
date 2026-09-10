/**
 * Client for the two DQD endpoints the dashboard reads. Same calls, same query
 * parameter and same 404 semantics as the portal's axios layer
 * (plugins/ui/apps/portal/src/axios/dataflow.ts, consumed by
 * useDatasetLatestFlowRun + useDataQualityOverviewFromId) — plain fetch here
 * because the plugin ships no axios, and the gateway accepts the host's Logto
 * access token unchanged (see main.ts).
 *
 * Callers pass a resolved token rather than the host's `getToken`, because the
 * meaning of an unresolved one is a UI decision, not an HTTP one: the host
 * answers "" until login settles, and useDataQualityOverview waits that out
 * instead of firing an unauthenticated request and reporting the 401.
 *
 * The prefix is root-absolute on purpose: Atlas serves the shell from /atlas/,
 * so a relative base would resolve underneath it. vue-mri-ui-lib's dqd store
 * module reaches the same service through the same root prefix.
 */
const JOBPLUGINS_BASE = '/jobplugins';

/** Prefect flow-run states, as the portal enumerates them (SystemAdmin/DQD/types.ts). */
export type FlowRunStateType =
  | 'COMPLETED'
  | 'SCHEDULED'
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'FAILED'
  | 'CRASHED';

export interface FlowRun {
  id: string;
  state: { type: FlowRunStateType };
}

export interface OverviewCategoryRow {
  pass: number;
  fail: number;
  total: number;
  /** Already rounded server-side, e.g. "95%" — or "-" when the cell has no checks. */
  percentPass: string;
}

/** The all-checks cell carries the v2.0 NA/error counts the other cells omit. */
export interface OverviewTotalCategoryRow extends OverviewCategoryRow {
  allNa: number;
  allError: number;
  PassMinusAllNA: number;
  totalMinusAllErrorMinusAllNA: number;
  correctedPassPercentage: string;
}

export interface OverviewCategoryGroup<
  TTotal extends OverviewCategoryRow = OverviewCategoryRow,
> {
  plausibility: OverviewCategoryRow;
  conformance: OverviewCategoryRow;
  completeness: OverviewCategoryRow;
  total: TTotal;
}

/**
 * Run metadata jobplugins started returning with the overview (#3158). Optional
 * throughout: artifacts written before that change carry none of it, and the
 * service omits the whole `timing` object rather than sending empty fields.
 */
export interface OverviewTiming {
  startTimestamp?: string;
  endTimestamp?: string;
  /** Human-readable duration straight from the DQD artifact, e.g. "2 hours". */
  executionTime?: string;
  executionTimeSeconds?: number;
}

export interface OverviewResults {
  verification: OverviewCategoryGroup;
  validation: OverviewCategoryGroup;
  total: OverviewCategoryGroup<OverviewTotalCategoryRow>;
  timing?: OverviewTiming;
  dqdVersion?: string;
}

async function getJson<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T | null> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${JOBPLUGINS_BASE}${path}?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  // 404 means "nothing recorded for this dataset yet", not a failure — the same
  // reading vue-mri-ui-lib's dqd store applies to the flow-run endpoint.
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText || 'request failed'}`);
  }

  // The overview answers 200 with a null body when the flow run produced no DQD
  // artifact, so read the text first instead of trusting response.json().
  const body = await response.text();
  return body ? (JSON.parse(body) as T | null) : null;
}

/**
 * What the user reads when either request fails. The status line and stack stay
 * in the console: a bare "404 Not Found" in the UI tells them nothing they can
 * act on. Atlas3's datasource.service.ts draws the same line — `logger.error`
 * for the detail, 'Unable to load ... Please try again.' for the alert — and
 * likewise leaves this string untranslated.
 */
export const LOAD_FAILED_MESSAGE = 'Unable to load data quality results. Please try again.';

function reportFailure(attempted: string, cause: unknown): Error {
  console.error(`[data-quality] ${attempted}`, cause);
  return new Error(LOAD_FAILED_MESSAGE);
}

/** Latest data-quality flow run for the dataset, or null when none exists. */
export async function getLatestDataQualityFlowRun(
  datasetId: string,
  token: string,
): Promise<FlowRun | null> {
  try {
    return await getJson<FlowRun>('/dqd/data-quality/flow-run/latest', { datasetId }, token);
  } catch (cause) {
    throw reportFailure(`could not load the latest flow run for dataset ${datasetId}`, cause);
  }
}

/** Derived overview for one flow run, or null when it holds no DQD artifact. */
export async function getDataQualityOverview(
  flowRunId: string,
  datasetId: string,
  token: string,
): Promise<OverviewResults | null> {
  try {
    return await getJson<OverviewResults>(
      `/dqd/data-quality/flow-run/${flowRunId}/overview`,
      { datasetId },
      token,
    );
  } catch (cause) {
    throw reportFailure(
      `could not load the overview for flow run ${flowRunId} (dataset ${datasetId})`,
      cause,
    );
  }
}
