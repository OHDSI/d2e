/**
 * Prefect flow-run state helpers.
 *
 * The jobplugins endpoints return raw Prefect flow runs, which carry the state
 * twice: `state.type` is the uppercase enum (RUNNING) while `state_name` is its
 * title-case label (Running). `state_name` also has labels with no matching
 * type -- Late and AwaitingRetry are both SCHEDULED, Retrying and Resuming are
 * both RUNNING -- so comparing a single field against a single literal misses
 * states. Read the state through these helpers instead.
 *
 * Mirrors FlowRunInProgressJobStateTypes in the portal app
 * (src/plugins/SystemAdmin/DQD/types.ts).
 */

interface FlowRunLike {
  state?: { type?: string }
  state_name?: string
}

// Uppercased so that a `state.type` and an uppercased `state_name` both match.
const IN_PROGRESS_STATES = [
  'SCHEDULED',
  'LATE',
  'AWAITINGRETRY',
  'PENDING',
  'PAUSED',
  'RUNNING',
  'RETRYING',
  'RESUMING',
]

const COMPLETED_STATE = 'COMPLETED'

const getFlowRunStateType = (flowRun?: FlowRunLike | null): string =>
  (flowRun?.state?.type || flowRun?.state_name || '').toUpperCase()

/** True while Prefect still owes us a result: queued, starting, running or paused. */
export const isFlowRunInProgress = (flowRun?: FlowRunLike | null): boolean =>
  IN_PROGRESS_STATES.includes(getFlowRunStateType(flowRun))

/** True once the run finished successfully and its results can be displayed. */
export const isFlowRunCompleted = (flowRun?: FlowRunLike | null): boolean =>
  getFlowRunStateType(flowRun) === COMPLETED_STATE
