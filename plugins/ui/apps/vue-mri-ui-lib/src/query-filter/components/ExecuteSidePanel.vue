<script lang="ts">
export default {
  compatConfig: {
    MODE: 3,
  },
}
</script>

<script setup lang="ts">
import bsCard from '@/lib/ui/bs-card.vue'
import appTab from '@/lib/ui/app-tab.vue'
import { ref, computed, defineAsyncComponent } from 'vue'
import Samples from './Samples.vue'
import { d2eWebapiService } from '@/query-filter/services/D2eWebapiService'

// Loaded on demand so plotly.js stays out of the single-spa entry's static
// dependency graph. See docs: the chart chunk was blocking mount.
const InclusionReport = defineAsyncComponent(() => import('./InclusionReport/index.vue'))

const props = defineProps<{
  cohortDefinitionId: string
  availableSources: any[]
  patientCounts?: Record<string, number | null>
  isGeneratingCohort?: boolean
  generationStatus: Record<string, 'idle' | 'pending' | 'complete' | 'failed'>
}>()

const tabList = [
  {
    text: 'Inclusion report',
    value: 'inclusion-report',
  },
  {
    text: 'Analysis',
    value: 'analysis',
  },
  {
    text: 'Sample',
    value: 'sample',
  },
]

const selectedView = ref<'inclusion-report' | 'analysis' | 'sample'>('inclusion-report')
const activeDataset = ref<string>(props.availableSources[0].sourceKey)

// Emit an event to parent to trigger cohort generation for a source
const emit = defineEmits(['generate-cohort'])

const getPatientCountStatus = (sourceKey: string) => {
  const status = props.generationStatus[sourceKey]
  const count = props.patientCounts?.[sourceKey]

  if (status === 'pending') return 'pending'
  if (status === 'failed') return 'failed'
  if (count !== null && count !== undefined) return 'success'
  return 'not-generated'
}

const getDisplayPatientCount = (sourceKey: string) => {
  const countStatus = getPatientCountStatus(sourceKey)

  switch (countStatus) {
    case 'pending':
      return 'Pending'
    case 'failed':
      return 'Failed'
    case 'success':
      if (
        props.patientCounts &&
        props.patientCounts[sourceKey] !== undefined &&
        props.patientCounts[sourceKey] !== null
      ) {
        return props.patientCounts[sourceKey]!.toLocaleString()
      } else {
        return 'Not generated'
      }
    case 'not-generated':
    default:
      return 'Not generated'
  }
}

const shouldShowPatientLabel = (sourceKey: string) => {
  return getPatientCountStatus(sourceKey) === 'success'
}

const handleGenerateCohort = (sourceKey: string) => {
  emit('generate-cohort', sourceKey)
}

const isGeneratingForSource = (sourceKey: string) => {
  return props.generationStatus[sourceKey] === 'pending'
}
const hasCohortGenerated = computed(() => {
  return props.patientCounts?.[activeDataset.value] !== null && props.patientCounts?.[activeDataset.value] !== undefined
})

const fetchInclusionReport = (cohortDefinitionId: string, sourceKey: string, modeId: number) => {
  return d2eWebapiService.getInclusionReport(cohortDefinitionId, sourceKey, modeId)
}
</script>

<template>
  <div class="execute-content">
    <aside class="side">
      <!-- dataset list -->
      <h3 class="sidepanel-title">Datasets</h3>
      <div v-for="source in availableSources" :key="source.sourceId">
        <bsCard
          class="dataset-card"
          v-bind:class="{ 'active-dataset': activeDataset === source.sourceKey }"
          @click="activeDataset = source.sourceKey"
        >
          <template v-slot:header>
            <div class="card-header-content">
              <h3>{{ source.sourceName }}</h3>
            </div>
          </template>
          <div class="card-body-content">
            <div class="patient-count-display">
              <div v-if="isGeneratingForSource(source.sourceKey)" class="patient-count-label generating-label">
                Generating...
              </div>
              <div v-else>
                <div
                  class="patient-count-value"
                  :class="{ 'patient-count-actual': getPatientCountStatus(source.sourceKey) === 'success' }"
                >
                  {{ getDisplayPatientCount(source.sourceKey) }}
                </div>
                <div v-if="shouldShowPatientLabel(source.sourceKey)" class="patient-count-label">Patients</div>
              </div>
            </div>
            <div class="card-controls">
              <div class="generate-spinner-container" v-if="isGeneratingForSource(source.sourceKey)">
                <d4l-spinner class="generate-spinner" size="1" />
              </div>

              <button
                v-else
                @click.stop="handleGenerateCohort(source.sourceKey)"
                :disabled="isGeneratingForSource(source.sourceKey)"
                class="btn btn-primary generate-cohort-btn"
              >
                Generate cohort
              </button>
            </div>
          </div>
        </bsCard>
      </div>

      <div style="height: 24px"></div>
    </aside>
    <!-- Main content -->
    <section class="main-content">
      <appTab class="tabs" :tabItems="tabList" :value="selectedView" @onSelectedChange="selectedView = $event" />
      <div class="tab-content">
        <div v-if="generationStatus[activeDataset] === 'pending'" class="status-message pending">
          Generating cohort... Please wait
        </div>
        <div v-else-if="generationStatus[activeDataset] === 'failed'" class="status-message error">
          Cohort generation failed. Please try again.
        </div>
        <div v-else-if="!hasCohortGenerated" class="status-message">Please generate the cohort first</div>
        <div v-else>
          <InclusionReport
            v-if="selectedView === 'inclusion-report'"
            :cohort-definition-id="cohortDefinitionId"
            :source-key="activeDataset"
            :generation-status="generationStatus[activeDataset]"
            :patient-count="patientCounts?.[activeDataset]"
            :fetch-inclusion-report="fetchInclusionReport"
            :show-intersect-view="true"
          />
          <h3 v-if="selectedView === 'analysis'">Analysis</h3>
          <Samples
            v-if="selectedView === 'sample'"
            :cohort-definition-id="cohortDefinitionId"
            :source-key="activeDataset"
            :patient-count="patientCounts?.[activeDataset]"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/ExecuteSidePanel.scss';
</style>
