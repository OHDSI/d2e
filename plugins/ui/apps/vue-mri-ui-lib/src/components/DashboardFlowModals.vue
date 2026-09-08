<template>
  <Teleport to="#app">
    <DashboardSelectionModal
      :is-open="flow.showDashboardSelectionModal"
      :dashboards="flow.dashboardCodes"
      :wizard-definitions="flow.wizardDefinitions"
      :loading="flow.dashboardMetadataLoading"
      :error="flow.dashboardSelectionError"
      @close="flow.closeDashboardSelectionModal"
      @select="flow.handleDashboardSelected"
    />
  </Teleport>

  <Teleport to="#app">
    <CompleteRequiredFiltersModal
      :is-open="flow.showRequiredFiltersModal"
      :all-fields="flow.allWizardFields"
      :sections="flow.selectedWizardDefinition?.sections"
      :form-note="flow.selectedWizardDefinition?.formNote"
      :initial-values="flow.initialFormValues"
      :initial-display-values="flow.initialDisplayValues"
      :loading="flow.applyingRequiredFilters"
      :error="flow.requiredFiltersError"
      @cancel="flow.handleRequiredFiltersCancel"
      @submit="flow.handleRequiredFiltersSubmit"
    />
  </Teleport>

  <Teleport to="#app">
    <ConfigureTable1Dialog
      :is-open="flow.showTable1ConfigModal"
      :dataset-id="datasetId"
      :initial-concept-sets="flow.confirmedTable1ConceptSets"
      @cancel="flow.handleTable1ConfigCancel"
      @close="flow.closeDashboardFlow"
      @confirm="flow.handleTable1ConfigConfirm"
    />
  </Teleport>

  <Teleport to="#app">
    <ShinyDashboardModal
      v-if="flow.showDashboardModal"
      :is-open="flow.showDashboardModal"
      :dataset-id="datasetId"
      :cohort-id="cohortId"
      :wizard-config="flow.dashboardContext.wizardConfig"
      :conditions="flow.dashboardContext.conditions"
      :mriquery="flow.dashboardContext.mriquery"
      @close="flow.closeDashboardModal"
    />
  </Teleport>

  <Teleport to="#app">
    <SaveCohortModal
      :is-open="flow.showSaveCohortModal"
      :mode="flow.saveCohortModalMode"
      :wizard-config="flow.dashboardContext.wizardConfig"
      @success="flow.handleSaveCohortSuccess"
      @cancel="flow.handleCancelSaveCohort"
      @close="flow.closeDashboardFlow"
    />
  </Teleport>
</template>

<script setup lang="ts">
// The five modals the dashboard-wizard flow needs, moved verbatim out of
// ChartToolbar.vue so ExplorationsPage.vue can mount the same flow without
// duplicating the bindings.
//
// `flow` arrives as a prop, and Vue's component props are shallow-reactive:
// a plain object nested inside a prop does not get the deep-reactive,
// ref-auto-unwrapping treatment that `data()` gives it in ChartToolbar (an
// Options API component). Wrapping it in `reactive()` here restores that
// unwrapping for the template bindings above, without changing the prop's
// own declared type.
import { reactive } from 'vue'
import type { useDashboardFlow } from '../composables/useDashboardFlow'
import ShinyDashboardModal from './ShinyViewer/ShinyDashboardModal.vue'
import SaveCohortModal from './ShinyViewer/SaveCohortModal.vue'
import DashboardSelectionModal from './ShinyViewer/DashboardSelectionModal.vue'
import CompleteRequiredFiltersModal from './ShinyViewer/CompleteRequiredFiltersModal.vue'
import ConfigureTable1Dialog from './ShinyViewer/ConfigureTable1Dialog.vue'

interface Props {
  flow: ReturnType<typeof useDashboardFlow>
  datasetId: string
  cohortId: string
}

const props = defineProps<Props>()
const flow = reactive(props.flow)
</script>
