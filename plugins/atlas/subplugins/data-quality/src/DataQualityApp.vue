<script setup lang="ts">
/**
 * DQD dashboard for the data source selected in the Atlas header — Figma node
 * 1747:229812 of the D2E WebApp main file.
 *
 * Data comes from the same place the portal's DQD overview reads: the dataset's
 * latest data-quality flow run, then that run's derived overview. The job-state
 * branches below mirror DQDJobResults.tsx, which is what makes a still-running or
 * failed job say so instead of rendering an empty card.
 *
 * The state treatments follow Atlas3's own convention, so this plugin reads like
 * the reports it sits beside in DataSourcesView:
 *
 *   fetch in flight      -> AtlasSkeleton    (DataSourcesView's loading.report)
 *   job of unknown length -> spinner + chip  (DataSourceRunTable's 'running' row)
 *   load failed          -> danger alert + Retry  (DataSourcesView, JobsSection)
 *   nothing to show      -> icon + muted text (DataSourcesView's __empty block)
 *
 * The spinner/skeleton split is deliberate rather than an oversight: a skeleton
 * promises content in a moment, which is a lie for a Prefect run that can take
 * hours. Atlas3 draws the same line — every one of its skeletons stands in for a
 * fetch, and both of its long-running-job surfaces use a spinner.
 */
import { computed } from 'vue';
import {
  AtlasAlert,
  AtlasButton,
  AtlasChip,
  AtlasIcon,
  AtlasProgressCircular,
  AtlasSkeleton,
} from '@ohdsi/atlas-ui';
import OverviewSummary from './components/OverviewSummary.vue';
import OverviewTable from './components/OverviewTable.vue';
import {
  useDataQualityOverview,
  type DataQualityStatus,
} from './composables/useDataQualityOverview';
import { useHostContext } from './composables/useHostContext';
import { formatDuration, formatRunTimestamp } from './utils/format';

const ctx = useHostContext();
const { t } = ctx;
const { status, overview, flowRunStateType, errorMessage, retry } = useDataQualityOverview(
  ctx.datasetId,
  ctx.getToken,
);

/**
 * The states that mean "nothing to render yet", as opposed to a job that ended
 * badly — those stay alerts below, because a cancelled or failed run is an
 * outcome the user may need to act on rather than an absence.
 */
const EMPTY_STATES: Partial<
  Record<DataQualityStatus, { icon: string; key: string; fallback: string }>
> = {
  'no-source': {
    // Same icon Atlas3 uses for its own "pick a source" hint.
    icon: 'mdi-database-arrow-down-outline',
    key: 'plugins.dataQuality.noSource',
    fallback: 'Select a data source to see its data quality results.',
  },
  'no-run': {
    icon: 'mdi-clipboard-text-off-outline',
    key: 'plugins.dataQuality.noRun',
    fallback: 'No data quality job has run for this data source yet.',
  },
  'no-results': {
    icon: 'mdi-information-outline',
    key: 'plugins.dataQuality.noResults',
    fallback: 'The latest data quality job finished without producing results.',
  },
};

const emptyState = computed(() => EMPTY_STATES[status.value] ?? null);

// Run metadata is optional: artifacts written before jobplugins started emitting
// it (#3158) have none, so the footer only appears once there is something in it.
const generatedOn = computed(() => {
  const timing = overview.value?.timing;
  return formatRunTimestamp(timing?.startTimestamp ?? timing?.endTimestamp);
});
const duration = computed(() => formatDuration(overview.value?.timing));
const dqdVersion = computed(() => overview.value?.dqdVersion ?? '');
</script>

<template>
  <div class="dq-root">
    <!-- Fetch in flight: the shape of what is arriving is known, so stand in for
         it rather than spinning. -->
    <AtlasSkeleton
      v-if="status === 'loading'"
      type="heading, paragraph, table"
      class="dq-skeleton"
      data-testid="dq-loading"
    />

    <div v-else-if="status === 'in-progress'" class="dq-state" data-testid="dq-job-progress">
      <AtlasProgressCircular indeterminate size="16" width="2" color="warning" />
      <AtlasChip tone="warning" size="sm" data-testid="dq-job-state">
        {{ flowRunStateType }}
      </AtlasChip>
      <p class="dq-state__text">
        {{
          t(
            'plugins.dataQuality.jobInProgress',
            'Results appear here once the data quality job finishes.',
          )
        }}
      </p>
    </div>

    <AtlasAlert v-else-if="status === 'error'" severity="danger" data-testid="dq-error">
      {{ errorMessage }}
      <template #actions>
        <AtlasButton variant="ghost" size="sm" data-testid="dq-retry" @click="retry">
          {{ t('plugins.dataQuality.retry', 'Retry') }}
        </AtlasButton>
      </template>
    </AtlasAlert>

    <AtlasAlert v-else-if="status === 'cancelled'" severity="warning">
      {{
        t('plugins.dataQuality.cancelled', 'The latest data quality job was cancelled.')
      }}
    </AtlasAlert>

    <AtlasAlert v-else-if="status === 'failed'" severity="danger">
      {{
        t(
          'plugins.dataQuality.failed',
          'The latest data quality job failed. Re-run it to see results here.',
        )
      }}
    </AtlasAlert>

    <div v-else-if="emptyState" class="dq-empty" data-testid="dq-empty">
      <AtlasIcon :icon="emptyState.icon" size="36" class="dq-empty__icon" />
      <p class="dq-empty__text">{{ t(emptyState.key, emptyState.fallback) }}</p>
    </div>

    <div v-else-if="overview" class="dq-dashboard" data-testid="dq-overview">
      <OverviewSummary :data="overview" />
      <div class="dq-dashboard__results">
        <OverviewTable :data="overview" />
        <div v-if="generatedOn || dqdVersion" class="dq-dashboard__footer">
          <p v-if="generatedOn">
            Generated on {{ generatedOn }}<template v-if="duration"> in {{ duration }}</template>
          </p>
          <p v-if="dqdVersion">Data quality dashboard version: {{ dqdVersion }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The card the design draws around this content is the surface's own: Atlas
   mounts us inside `AtlasCard padding="md"` (DataSourcesView's
   `datasources-view__report`), which already supplies the frame, the inset and
   the elevation. Drawing our own would stack a second card inside the first, so
   everything here is flat and keeps only the design's internal rhythm. */
.dq-dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--dq-space-m);
}

.dq-dashboard__results {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dq-dashboard__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px var(--dq-space-s);
  font-size: 14px;
  line-height: 1.5;
  color: var(--dq-text-muted);
}

.dq-dashboard__footer p {
  margin: 0;
}

/* Atlas3 rounds its report skeleton to 12px; matched here so the placeholder
   sits in the host card the same way the real content does. */
.dq-skeleton {
  border-radius: 12px;
  background: transparent;
}

.dq-state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--dq-text-muted);
}

.dq-state__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

/* Atlas3's `datasources-view__empty`: an MD3 "filled" placeholder region, the
   tint alone signalling emptiness with no border or dashed outline. Its metrics
   land exactly on tokens this plugin already defines (56px/24px). The colours
   come from --dq-* rather than --v-theme-* because the plugin's Vuetify runs
   with `theme: false` and inherits the host's :root tokens instead. */
.dq-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: var(--dq-space-xl) var(--dq-space-m);
  border-radius: 12px;
  background: var(--dq-surface-subtle);
}

.dq-empty__icon {
  color: var(--dq-text-muted);
  opacity: 0.7;
}

.dq-empty__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--dq-text-muted);
  text-align: center;
}
</style>
