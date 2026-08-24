import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  getDataQualityOverview,
  getLatestDataQualityFlowRun,
  type FlowRun,
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
 */
const IN_PROGRESS_STATES: FlowRunStateType[] = ['SCHEDULED', 'PENDING', 'RUNNING', 'PAUSED'];
const CANCELLED_STATES: FlowRunStateType[] = ['CANCELLING', 'CANCELLED'];
const FAILED_STATES: FlowRunStateType[] = ['FAILED', 'CRASHED'];
const POLL_INTERVAL_MS = 10_000;

export type DataQualityStatus =
  /** No data source picked in the Atlas header yet. */
  | 'no-source'
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
  errorMessage: Ref<string>;
  /**
   * Re-runs the load behind the error state's Retry button. Safe to call while a
   * load is already in flight: `latestRequest` discards whichever finishes first.
   * Atlas3's store exposes `retryFetchReport` for the same purpose.
   */
  retry: () => void;
}

export function useDataQualityOverview(
  datasetId: Ref<string>,
  getToken: () => Promise<string>,
): UseDataQualityOverview {
  const flowRun = ref<FlowRun | null>(null);
  const overview = ref<OverviewResults | null>(null);
  const errorMessage = ref('');
  const loading = ref(false);

  // Atlas mutates the selected source in place rather than remounting us, so a
  // slow answer for the previous source can land after the switch. Every load
  // claims a sequence number and only the newest one is allowed to commit.
  let latestRequest = 0;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function stopPolling(): void {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  function syncPolling(): void {
    const stateType = flowRun.value?.state?.type;
    const shouldPoll = stateType !== undefined && IN_PROGRESS_STATES.includes(stateType);
    if (shouldPoll) {
      if (pollTimer === undefined) {
        pollTimer = setInterval(() => void load(true), POLL_INTERVAL_MS);
      }
    } else {
      stopPolling();
    }
  }

  /** `quiet` keeps the poll from flashing the page back to its loading state. */
  async function load(quiet = false): Promise<void> {
    const sourceKey = datasetId.value;
    const requestId = ++latestRequest;

    if (!sourceKey) {
      stopPolling();
      flowRun.value = null;
      overview.value = null;
      errorMessage.value = '';
      loading.value = false;
      return;
    }

    if (!quiet) loading.value = true;
    try {
      const latest = await getLatestDataQualityFlowRun(sourceKey, getToken);
      const results =
        latest?.state?.type === 'COMPLETED'
          ? await getDataQualityOverview(latest.id, sourceKey, getToken)
          : null;
      if (requestId !== latestRequest) return;
      flowRun.value = latest;
      overview.value = results;
      errorMessage.value = '';
    } catch (error) {
      if (requestId !== latestRequest) return;
      overview.value = null;
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      if (requestId === latestRequest) {
        loading.value = false;
        syncPolling();
      }
    }
  }

  const status = computed<DataQualityStatus>(() => {
    if (!datasetId.value) return 'no-source';
    if (loading.value) return 'loading';
    if (errorMessage.value) return 'error';
    const stateType = flowRun.value?.state?.type;
    if (stateType === undefined) return 'no-run';
    if (IN_PROGRESS_STATES.includes(stateType)) return 'in-progress';
    if (CANCELLED_STATES.includes(stateType)) return 'cancelled';
    if (FAILED_STATES.includes(stateType)) return 'failed';
    return overview.value ? 'ready' : 'no-results';
  });

  watch(
    datasetId,
    () => {
      stopPolling();
      flowRun.value = null;
      overview.value = null;
      errorMessage.value = '';
      void load();
    },
    { immediate: true },
  );

  onUnmounted(stopPolling);

  return {
    status,
    overview,
    flowRunStateType: computed(() => flowRun.value?.state?.type),
    errorMessage,
    retry: () => void load(),
  };
}
