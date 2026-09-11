<script setup lang="ts">
import { useStore } from 'vuex'
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type {
  InclusionReportResponse,
  AttritionApiResponse,
  RuleFilterCardDetails,
} from '@/query-filter/types/InclusionReportTypes'
import GroupButtons from '../GroupButtons.vue'
import SummaryTable from './components/SummaryTable.vue'
import FilterControls from './components/FilterControls.vue'
import RulesTable from './components/RulesTable.vue'
import EstimatedProgressSpinner from './components/EstimatedProgressSpinner.vue'
import { useInclusionReportData } from './composables/useInclusionReportData'
import { useRuleManagement } from './composables/useRuleManagement'
import { useFunnelChart } from './composables/useFunnelChart'
import { useTreemapChart } from './composables/useTreemapChart'
import { computeExpectedDurationMs } from './estimatedProgressSpinnerDuration'
import VButton from '@/components/vuetify/VButton.vue'
import VMenu from '@/components/vuetify/VMenu.vue'
import appTab from '@/lib/ui/app-tab.vue'

const store = useStore()
const getText = (key: string, param?: string | string[]) => store.getters.getText(key, param)

const props = withDefaults(
  defineProps<{
    cohortDefinitionId: string
    sourceKey: string
    generationStatus?: 'idle' | 'pending' | 'complete' | 'failed'
    cacheKey?: string
    showPersonEventSwitch?: boolean
    filterCardDetails?: RuleFilterCardDetails[]
    showIntersectView?: boolean
    patientCount?: number | null
    fetchInclusionReport: (
      cohortDefinitionId: string,
      sourceKey: string,
      modeId: number
    ) => Promise<InclusionReportResponse>
    fetchAttritionReport?: (ruleOrder?: number[], signal?: AbortSignal) => Promise<AttritionApiResponse>
  }>(),
  {
    showPersonEventSwitch: true,
    showIntersectView: false,
  }
)

const isFading = ref(false)

// View state
const selectedPersonEventView = ref<'PERSON' | 'EVENT'>('PERSON')
const selectedVisualization = ref<'ATTRITION' | 'INTERSECT'>('ATTRITION')

const personEventOptions = computed(() => [
  { value: 'PERSON', label: getText('MRI_PA_INCLUSION_REPORT_BY_PERSON') },
  { value: 'EVENT', label: getText('MRI_PA_INCLUSION_REPORT_BY_EVENT') },
])
const visualizationOptions = computed(() => {
  const options = [{ value: 'ATTRITION', text: getText('MRI_PA_INCLUSION_REPORT_ATTRITION') }]
  if (props.showIntersectView) {
    options.push({ value: 'INTERSECT', text: getText('MRI_PA_INCLUSION_REPORT_INTERSECT') })
  }
  return options
})

watch(
  () => props.showIntersectView,
  newVal => {
    if (!newVal && selectedVisualization.value === 'INTERSECT') {
      selectedVisualization.value = 'ATTRITION'
    }
  }
)

// Use composables - order matters here!
// First, get the data fetching composable (without filtered summary initially)
const dataComposable = useInclusionReportData(
  {
    cohortDefinitionId: props.cohortDefinitionId,
    sourceKey: props.sourceKey,
    generationStatus: props.generationStatus,
    cacheKey: props.cacheKey,
    showIntersectView: props.showIntersectView,
    fetchInclusionReport: props.fetchInclusionReport,
    fetchAttritionReport: props.fetchAttritionReport,
  },
  selectedPersonEventView
)

const {
  isLoadingInclusionReport,
  inclusionReportResponse,
  hasInclusionRules,
  treemapData,
  shouldFetchInclusionReport,
  fetchInclusionReportInternal,
  lastAttritionApiResponse,
} = dataComposable

// Then get rule management which depends on inclusionReportResponse
const {
  checkedRulesIds,
  draggableAttritionStats,
  allAnyOption,
  passedFailedOption,
  isReorderLoading,
  errorMessage,
  toggleRuleSelection,
  isRuleChecked,
  areAllRulesChecked,
  toggleAllRules,
  handleDragEnd,
  getRowIndex,
  moveRowUp,
  moveRowDown,
  handleAllAnyChange,
  handlePassedFailedChange,
  filteredSummary,
} = useRuleManagement(
  inclusionReportResponse,
  treemapData,
  props.showIntersectView,
  props.fetchAttritionReport,
  lastAttritionApiResponse,
  getText
)

const { funnelChartRef, downloadFunnelChart, downloadFunnelChartCSV } = useFunnelChart(
  inclusionReportResponse,
  draggableAttritionStats,
  getText,
  computed(() => props.filterCardDetails)
)

const { treemapChartRef, disposeTreemap, downloadTreemapImage, downloadTreemapCSV } = useTreemapChart(
  treemapData,
  checkedRulesIds,
  allAnyOption,
  passedFailedOption,
  selectedVisualization,
  getText
)

// Fall back to 1 (not 0) when filterCardDetails isn't provided by the caller,
// so that patientCount still influences the estimated duration in computeExpectedDurationMs.
const ruleCount = computed(() => props.filterCardDetails?.length ?? 1)
const expectedDurationMs = computed(() => computeExpectedDurationMs(ruleCount.value, props.patientCount))

// Keep the loader mounted until the progress spinner animates to 100%.
const showLoader = ref(false)
const showReorderLoader = ref(false)

watch(
  isLoadingInclusionReport,
  newVal => {
    if (newVal) showLoader.value = true
  },
  { immediate: true }
)

watch(isReorderLoading, newVal => {
  if (newVal) showReorderLoader.value = true
})

function handleLoaderFinished() {
  if (!isLoadingInclusionReport.value) showLoader.value = false
}

function handleReorderLoaderFinished() {
  if (!isReorderLoading.value) showReorderLoader.value = false
}

// Event handlers
function handlePersonEventViewChange(newView: 'PERSON' | 'EVENT') {
  selectedPersonEventView.value = newView
  if (shouldFetchInclusionReport.value) {
    fetchInclusionReportInternal(props.cohortDefinitionId, props.sourceKey)
  }
}

async function handleVisualizationChange(newView: 'ATTRITION' | 'INTERSECT') {
  isFading.value = true
  await new Promise(r => setTimeout(r, 200))
  selectedVisualization.value = newView
  await nextTick()
  isFading.value = false
}

// Lifecycle hooks
onMounted(() => {
  if (shouldFetchInclusionReport.value) {
    fetchInclusionReportInternal(props.cohortDefinitionId, props.sourceKey)
  }
})

onUnmounted(() => {
  disposeTreemap()
})
</script>

<template>
  <div v-if="showPersonEventSwitch" class="group-buttons-container">
    <group-buttons
      :options="personEventOptions"
      :limit-value="selectedPersonEventView"
      @update-limit-value="handlePersonEventViewChange($event as 'PERSON' | 'EVENT')"
      class="person-event-view-buttons"
    />
    <p v-if="selectedPersonEventView === 'PERSON'">
      {{ getText('MRI_PA_INCLUSION_REPORT_USING_ONE_EVENT_PER_PERSON') }}
    </p>
    <p v-else>{{ getText('MRI_PA_INCLUSION_REPORT_USING_ALL_EVENTS') }}</p>
  </div>

  <div v-if="showLoader" class="status-message loading">
    <EstimatedProgressSpinner
      :loading="isLoadingInclusionReport"
      :expected-duration-ms="expectedDurationMs"
      @finished="handleLoaderFinished"
      :size="96"
      :stroke="6"
    />
  </div>

  <div v-else-if="inclusionReportResponse" class="inclusion-report-container">
    <!-- Summary Table -->
    <SummaryTable :summary="inclusionReportResponse.summary" />

    <div v-if="hasInclusionRules" class="inclusion-rules-detail">
      <!-- Visualization Type Selector -->
      <div v-if="visualizationOptions.length > 1" class="group-buttons-container">
        <!-- <group-buttons
          :options="visualizationOptions"
          :limit-value="selectedVisualization"
          @update-limit-value="handleVisualizationChange($event as 'ATTRITION' | 'INTERSECT')"
          class="person-event-view-buttons"
        /> -->
        <appTab
          class="visualization-tabs"
          :tabItems="visualizationOptions"
          :value="selectedVisualization"
          @onSelectedChange="handleVisualizationChange($event as 'ATTRITION' | 'INTERSECT')"
        />
      </div>
      <div class="tab-content" :class="{ 'tab-fading': isFading }">
        <!-- Filter Controls (only show in INTERSECT view) -->
        <FilterControls
          v-if="selectedVisualization === 'INTERSECT'"
          :all-any-option="allAnyOption"
          :passed-failed-option="passedFailedOption"
          @update:all-any-option="handleAllAnyChange"
          @update:passed-failed-option="handlePassedFailedChange"
        />

        <div v-if="errorMessage" class="inclusion-report-error">
          {{ errorMessage }}
        </div>

        <div class="rules-section">
          <div class="rules-table-wrapper">
            <div v-if="showReorderLoader" class="reorder-loading-overlay">
              <EstimatedProgressSpinner
                :loading="isReorderLoading"
                :expected-duration-ms="expectedDurationMs"
                @finished="handleReorderLoaderFinished"
                :size="96"
                :stroke="6"
              />
            </div>
            <!-- Rules Table -->
            <RulesTable
              :selected-visualization="selectedVisualization"
              :selected-person-event-view="selectedPersonEventView"
              :draggable-attrition-stats="draggableAttritionStats"
              :inclusion-rule-stats="inclusionReportResponse.inclusionRuleStats"
              :are-all-rules-checked="areAllRulesChecked()"
              :is-rule-checked="isRuleChecked"
              :get-row-index="getRowIndex"
              :filter-card-details="filterCardDetails"
              @toggle-all-rules="toggleAllRules"
              @toggle-rule-selection="toggleRuleSelection"
              @drag-end="handleDragEnd"
              @move-row-up="moveRowUp"
              @move-row-down="moveRowDown"
              @update:draggable-attrition-stats="draggableAttritionStats = $event"
            />
          </div>
          <div>
            <p class="footnote"><sup>1</sup> {{ getText('MRI_PA_INCLUSION_REPORT_FOOTNOTE') }}</p>
            <p class="footnote">
              {{ getText('MRI_PA_MESSAGE_CENSORING_DISCLAIMER') }}
            </p>
          </div>
          <!-- Filtered Summary (only show in INTERSECT view) -->
          <div v-if="selectedVisualization === 'INTERSECT'" class="filtered-summary">
            <p>
              {{ getText('MRI_PA_INCLUSION_REPORT_FILTERED_POPULATION') }}:
              {{ filteredSummary.value.toLocaleString() }} ({{ filteredSummary.percent }})
            </p>
          </div>

          <!-- Charts -->
          <div v-show="selectedVisualization === 'ATTRITION'" class="chart-section">
            <div class="chart-header">
              <h4>{{ getText('MRI_PA_INCLUSION_REPORT_ATTRITION_PLOT') }}</h4>
              <VMenu>
                <template #activator="{ props }">
                  <VButton
                    v-bind="props"
                    rounded
                    variant="outlined"
                    class="download-btn"
                    :title="getText('MRI_PA_INCLUSION_REPORT_EXPORT')"
                    >{{ getText('MRI_PA_INCLUSION_REPORT_EXPORT') }}</VButton
                  >
                </template>
                <v-list-item @click="downloadFunnelChartCSV">{{
                  getText('MRI_PA_INCLUSION_REPORT_EXPORT_CSV')
                }}</v-list-item>
                <v-list-item @click="downloadFunnelChart">{{
                  getText('MRI_PA_INCLUSION_REPORT_EXPORT_PNG')
                }}</v-list-item>
              </VMenu>
            </div>
            <div ref="funnelChartRef" class="funnel-chart"></div>
          </div>
          <div v-show="selectedVisualization === 'INTERSECT'" class="chart-section">
            <div class="chart-header">
              <h4>{{ getText('MRI_PA_INCLUSION_REPORT_POPULATION_TREEMAP') }}</h4>
              <VMenu>
                <template #activator="{ props }">
                  <VButton
                    v-bind="props"
                    rounded
                    variant="outlined"
                    class="download-btn"
                    :title="getText('MRI_PA_INCLUSION_REPORT_EXPORT')"
                    >{{ getText('MRI_PA_INCLUSION_REPORT_EXPORT') }}</VButton
                  >
                </template>
                <v-list-item @click="downloadTreemapCSV">{{
                  getText('MRI_PA_INCLUSION_REPORT_EXPORT_CSV')
                }}</v-list-item>
                <v-list-item @click="downloadTreemapImage">{{
                  getText('MRI_PA_INCLUSION_REPORT_EXPORT_PNG')
                }}</v-list-item>
              </VMenu>
            </div>
            <div ref="treemapChartRef" class="treemap-chart"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="no-data">{{ getText('MRI_PA_INCLUSION_REPORT_NO_DATA') }}</div>
</template>

<style scoped lang="scss">
.inclusion-rules-detail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.group-buttons-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  .group-button {
    width: 80%;
  }

  .visualization-tabs {
    width: 100%;
    z-index: 1;
    padding-bottom: 4px;
    :deep(.app-list) {
      width: 100%;
      display: flex;
      justify-content: space-between;

      .app-listItem {
        width: 100%;
        background-color: transparent !important;
        color: var(--color-primary) !important;
        font-size: 16px !important;
        // font-weight: bold;
        &.app-listItemSelected {
          font-weight: 500;
        }
      }
    }
  }
}

.inclusion-report-container {
  margin-top: 1rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}

.rules-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rules-table-wrapper {
  position: relative;
}

.reorder-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 10;
}

h4 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-primary);
  font-weight: 500;
}

.status-message.no-data {
  padding: 2rem;
  text-align: center;
  color: var(--color-neutral);
}

.status-message.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.filtered-summary {
  margin: 0.5rem 0;

  p {
    margin: 0;
    font-size: 0.95rem;
    color: #333;
  }
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h4 {
    margin: 0;
  }
}

.download-btn {
  width: fit-content;
  color: var(--color-ui-darkest-text);
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.chart-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
  min-height: 400px;
  width: 100%;

  .funnel-chart {
    width: 100%;
    height: fit-content;
    border: 1px solid var(--color-ui-light-border, #ddd);
    border-radius: 4px;
    margin-bottom: 2em;
  }

  .treemap-chart {
    height: 500px;
    width: 100%;
    border: 1px solid var(--color-ui-light-border, #ddd);
    border-radius: 4px;
  }
}

.tab-content {
  transition: opacity 0.2s ease;
  opacity: 1;
}

.tab-fading {
  opacity: 0.1;
}

.footnote {
  max-width: 80ch;
}

.inclusion-report-error {
  color: var(--color-error-text, #b00020);
  background-color: var(--color-error-bg, #fdecea);
  border: 1px solid var(--color-error-border, #f5c6cb);
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 8px;
  font-size: 14px;
}
</style>
