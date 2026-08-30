import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  LOAD_FAILED_MESSAGE,
  getDataQualityOverview,
  getLatestDataQualityFlowRun,
  type FlowRunStateType,
  type OverviewResults,
} from '../api/dqd';

/**
 * Loads the DQD overview for the selected data source, following the same two
 * steps the portal takes: resolve the dataset's latest data-quality flow run,
 * then read that run's derived overview
 * (plugins/ui/apps/portal/src/plugins/SystemAdmin/DQD/DQDJobResults/DQDJobResults.tsx
 * + hooks/dataflow/useDatasetLatestFlowRun.ts + useDataQualityOverviewFromId.ts).
 * The in-progress poll below is the portal's 10-second refetch.
 *
 * The portal also has a release-scoped variant of the first step
 * (useDatasetLatestFlowRun's `releaseId` branch -> getDatasetReleaseFlowRun).
 * There is deliberately no equivalent here: the Atlas header selects a data
 * source, not a release, and the host context handed to a parcel carries only
 * `sourceKey` (types.ts, PluginHostContext). We always read the dataset's latest
 * run, which is what the portal does with no release picked.
 *
 * Only the flow run's *state* is kept, not the run: its id is used to fetch the
 * overview and then has no reader, so holding the whole object would be state
 * nothing observes.
 */
const IN_PROGRESS_STATES: FlowRunStateType[] = ['SCHEDULED', 'PENDING', 'RUNNING', 'PAUSED'];
const CANCELLED_STATES: FlowRunStateType[] = ['CANCELLING', 'CANCELLED'];
const FAILED_STATES: FlowRunStateType[] = ['FAILED', 'CRASHED'];

/**
 * States worth re-reading. CANCELLING is here without being in-progress: it
 * renders as the cancelled outcome, but Prefect turns it into CANCELLED within
 * seconds, so treating it as terminal would leave the run's final state unread.
 * The portal polls it too — DQDJobResults.tsx clears its interval only on
 * COMPLETED or a failed state.
 */
const POLLED_STATES: FlowRunStateType[] = [...IN_PROGRESS_STATES, 'CANCELLING'];
const POLL_INTERVAL_MS = 10_000;

/**
 * How many consecutive background polls may fail before the alert takes over
 * from the progress indicator. A single blip mid-job is not news the user can
 * act on and the next tick usually answers, but a gateway that stays down must
 * not hide behind a spinner for the length of a DQD run.
 */
const POLL_FAILURE_TOLERANCE = 2;

/**
 * The host resolves its access token asynchronously and answers "" until login
 * settles (main.ts, DqHostCtx.getToken), so an unauthenticated first paint is a
 * timing artefact rather than a failure — waiting it out beats showing "Unable
 * to load…" to a user who is in fact signed in. Roughly 10s of patience, after
 * which we send the request anyway and let the gateway's answer speak.
 * The portal needs none of this: its axios interceptor owns the token.
 */
const AUTH_RETRY_MS = 500;
const AUTH_MAX_ATTEMPTS = 20;

export type DataQualityStatus =
  /** No data source picked in the Atlas header yet. */
  | 'no-source'
  /** First load, source switch, Retry — or still waiting for the host's token. */
  | 'loading'
  /** A run exists but has not finished; the poll is running. */
  | 'in-progress'
  | 'cancelled'
  | 'failed'
  /** No data-quality job has ever run for this data source. */
  | 'no-run'
  /** The run completed but wrote no DQD artifact to read. */
  | 'no-results'
  | 'error'
  | 'ready';

export interface UseDataQualityOverview {
  status: Ref<DataQualityStatus>;
  overview: Ref<OverviewResults | null>;
  flowRunStateType: Ref<FlowRunStateType | undefined>;
  /** Only meaningful while `status` is 'error'. */
  errorMessage: Ref<string>;
  /**
   * Re-runs the load behind the error state's Retry button. Safe to call while a
   * load is already in flight: the new one retires it, so only the newest answer
   * commits. Atlas3's store exposes `retryFetchReport` for the same purpose.
   */
  retry: () => void;
}

export function useDataQualityOverview(
  datasetId: Ref<string>,
  getToken: () => Promise<string>,
): UseDataQualityOverview {
  const flowRunStateType = ref<FlowRunStateType | undefined>(undefined);
  const overview = ref<OverviewResults | null>(null);
  /**
   * The thrown value, not its message: an error whose message is empty would
   * read as "no error" in `status` and quietly show the no-run placeholder for a
   * request that actually failed.
   */
  const loadError = ref<Error | null>(null);
  const loading = ref(false);

  /**
   * The load cycle currently allowed to commit, or undefined when none is
   * outstanding. Atlas mutates the selected source in place rather than
   * remounting us, so a slow answer for the previous source can land after the
   * switch: each load aborts its predecessor and then checks its own signal
   * after every await, so only the newest one writes to the refs above.
   *
   * The signal is deliberately not passed to the api layer. Its job here is to
   * mark a cycle superseded, and plumbing it into fetch would make the request
   * reject with an AbortError that `reportFailure` flattens into the generic
   * load-failure sentence — an abort would then read as a gateway failure.
   */
  let activeLoad: AbortController | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let authTimer: ReturnType<typeof setTimeout> | undefined;
  let pollFailures = 0;
  let authAttempts = 0;

  function stopPolling(): void {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  function stopAuthWait(): void {
    if (authTimer !== undefined) {
      clearTimeout(authTimer);
      authTimer = undefined;
    }
  }

  /** Back to "nothing known yet" — for a source switch, or no source at all. */
  function forget(): void {
    stopPolling();
    stopAuthWait();
    activeLoad?.abort();
    activeLoad = undefined;
    pollFailures = 0;
    authAttempts = 0;
    flowRunStateType.value = undefined;
    overview.value = null;
    loadError.value = null;
  }

  function syncPolling(): void {
    const stateType = flowRunStateType.value;
    const shouldPoll = stateType !== undefined && POLLED_STATES.includes(stateType);
    if (shouldPoll) {
      if (pollTimer === undefined) {
        // Skip the tick while a load is still outstanding. Each load supersedes
        // its predecessor, so an overlapping poll would retire the pending
        // answer before it lands — under latency above the interval that repeats
        // every tick and nothing ever commits, freezing the dashboard mid-run.
        pollTimer = setInterval(() => {
          if (activeLoad) return;
          void load(true);
        }, POLL_INTERVAL_MS);
      }
    } else {
      stopPolling();
    }
  }

  /** `quiet` keeps the poll from flashing the page back to its loading state. */
  async function load(quiet = false): Promise<void> {
    const sourceKey = datasetId.value;

    if (!sourceKey) {
      forget();
      loading.value = false;
      return;
    }

    // Retire whoever was mid-flight; this load owns the cycle from here.
    activeLoad?.abort();
    const { signal } = (activeLoad = new AbortController());

    if (!quiet) loading.value = true;

    // A rejection from the host's getToken is read as "no token yet" so the wait
    // below applies to it as well, rather than surfacing a host-internal error.
    const token = await getToken().catch((cause: unknown) => {
      console.warn('[data-quality] host token unavailable', cause);
      return '';
    });
    if (signal.aborted) return;

    if (!token && authAttempts < AUTH_MAX_ATTEMPTS) {
      // Stay in whatever state we are in — 'loading' on first paint, the running
      // job's spinner during a poll — and read the token again shortly. Note the
      // early return leaves `loading` alone on purpose.
      authAttempts += 1;
      stopAuthWait();
      authTimer = setTimeout(() => void load(quiet), AUTH_RETRY_MS);
      return;
    }
    authAttempts = 0;

    try {
      const latest = await getLatestDataQualityFlowRun(sourceKey, token);
      const results =
        latest?.state?.type === 'COMPLETED'
          ? await getDataQualityOverview(latest.id, sourceKey, token)
          : null;
      if (signal.aborted) return;
      flowRunStateType.value = latest?.state?.type;
      overview.value = results;
      loadError.value = null;
      pollFailures = 0;
    } catch (error) {
      if (signal.aborted) return;
      pollFailures += 1;
      // A background poll that fails has not invalidated what we already know:
      // the job was in flight a moment ago and the next tick usually answers.
      // Swapping a healthy progress indicator for a red alert over one blip is
      // exactly what `quiet` exists to prevent — so keep the last known state,
      // and only report once the failure has repeated enough to be worth it.
      if (quiet && pollFailures <= POLL_FAILURE_TOLERANCE) {
        console.warn('[data-quality] background refresh failed, keeping last known state', error);
        return;
      }
      // Reported failure: drop what we were showing, so the alert never sits
      // above numbers that no longer describe the run.
      overview.value = null;
      loadError.value = error instanceof Error ? error : new Error(String(error));
    } finally {
      // Runs for the early return above too, which is what keeps the poll alive
      // across a tolerated failure: the flow-run state is still in-progress.
      // Skipped when superseded, so a retired load neither clears the cycle a
      // newer one now owns nor re-arms its timer.
      if (!signal.aborted) {
        activeLoad = undefined;
        loading.value = false;
        syncPolling();
      }
    }
  }

  const status = computed<DataQualityStatus>(() => {
    if (!datasetId.value) return 'no-source';
    if (loading.value) return 'loading';
    if (loadError.value) return 'error';
    const stateType = flowRunStateType.value;
    if (stateType === undefined) return 'no-run';
    if (IN_PROGRESS_STATES.includes(stateType)) return 'in-progress';
    if (CANCELLED_STATES.includes(stateType)) return 'cancelled';
    if (FAILED_STATES.includes(stateType)) return 'failed';
    return overview.value ? 'ready' : 'no-results';
  });

  watch(
    datasetId,
    () => {
      forget();
      void load();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    // Clearing the timers is not enough: a request still in flight would reach
    // its `finally` still holding the cycle and call syncPolling(), re-arming
    // the interval after teardown and polling the gateway forever. Aborting
    // retires it, so no late completion can commit or restart a timer.
    activeLoad?.abort();
    activeLoad = undefined;
    stopPolling();
    stopAuthWait();
  });

  return {
    status,
    overview,
    flowRunStateType,
    // The api layer already turns every failure into this sentence; the fallback
    // covers a throw from anywhere else.
    errorMessage: computed(() => loadError.value?.message || LOAD_FAILED_MESSAGE),
    retry: () => {
      pollFailures = 0;
      authAttempts = 0;
      void load();
    },
  };
}
