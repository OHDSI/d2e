<template>
  <div class="chartToolbar-main-container">
    <div class="d-flex">
      <button
        v-if="!showUnHideFilters"
        class="actionButton"
        @click="toggleLeftPanel"
        :title="getText('MRI_PA_TOOLTIP_COLLAPSE_FILTER_BAR')"
      >
        <span class="icon" style="font-family: app-icons">{{ hideIcon }}</span>
      </button>
      <button
        v-if="showUnHideFilters"
        class="actionButton"
        @click="toggleLeftPanel"
        :title="getText('MRI_PA_TOOLTIP_EXPAND_FILTER_BAR')"
      >
        <span class="icon" style="font-family: app-icons">{{ unHideIcon }}</span>
      </button>
    </div>
    <div class="actionButtonGroup">
      <div
        class="dashboardButton"
        v-if="getActiveBookmark && canOpenDashboard"
        :title="canOpenDashboard ? '' : getText('MRI_PA_OPEN_DASHBOARD_TOOLTIP_DISABLED')"
      >
        <Button
          :text="getText('MRI_PA_OPEN_DASHBOARD_TEXT')"
          :onClick="dashboardFlow.openDashboardModal"
          :disabled="!canOpenDashboard"
        />
      </div>
      <div class="attritionButton" v-if="getActiveBookmark && enableInclusionReport">
        <VButton @click="openInclusionReportModal">{{ getText('MRI_PA_INCLUSION_REPORT_BUTTON') }}</VButton>
      </div>
      <div class="d-flex iconActionButton">
        <template v-for="chart in chartConfig" :key="chart.name">
          <DisabledHoverPopover
            :disabled="isBelowMinCohortSize"
            :header="getText('MRI_PA_CHART_UNAVAILABLE', getText(chart.tooltip))"
            :message="minCohortSizeMessage"
          >
            <chartButton
              @clickEv="switchChart(chart)"
              :name="chart.name"
              :icon="chart.icon"
              :iconGroup="chart.iconGroup"
              :title="getText(chart.tooltip)"
              :activeChart="getActiveChart"
              :disabled="isBelowMinCohortSize"
            />
          </DisabledHoverPopover>
          <span class="separator"></span>
        </template>

        <button
          class="toolbarButton"
          :title="getText('MRI_PA_BUTTON_DRILL_DOWN')"
          v-bind:class="{ toolbarButtonDisabled: !drilldownEnabled }"
          :disabled="!drilldownEnabled"
          @click="drillDownClicked"
          data-testid="pa-drilldown-btn"
        >
          <span class="icon" style="font-family: app-icons"></span>
        </button>

        <span class="separator" />

        <button
          class="actionButton"
          @click="showFilterCardSummary"
          :title="getText('MRI_PA_TITLE_FILTER_SUMMARY_TOOLTIP')"
          data-testid="pa-filter-summary-btn"
        >
          <icon icon="summaryDoc" />
        </button>

        <span class="separator" />

        <downloadMenu></downloadMenu>

        <div class="vertical-spacer"></div>
        <patientCount :popOverPosition="patientCountPopoverPosition" />
        <span class="separator" />
        <!-- <span class="separator" />
      <button
        id="idConfigSettings"
        class="actionButton"
        @click="openSettingsConfig"
        :title="getText('MRI_PA_SELECT_CONFIGURATION')"
      >
        <span class="icon" style="font-family: app-icons"></span>
      </button> -->
      </div>
    </div>
  </div>

  <DashboardFlowModals
    :flow="dashboardFlow"
    :dataset-id="getSelectedDataset?.id || ''"
    :cohort-id="(dashboardFlow.savedCohortId ?? getActiveCohortMaterializedId)?.toString() || ''"
  />

  <Teleport to="#app">
    <VDialog
      :model-value="showInclusionReportModal"
      @update:modelValue="showInclusionReportModal = $event"
      @keydown.esc="closeInclusionReportModal"
      max-width="90%"
      persistent
    >
      <div class="inclusion-report-dialog" data-testid="pa-inclusion-report-dialog">
        <div class="inclusion-report-dialog__title">
          <div class="inclusion-report-dialog__title-text" data-testid="pa-inclusion-report-dialog-title">
            Attrition Plot
          </div>
          <button
            class="inclusion-report-dialog__close-btn"
            @click="closeInclusionReportModal"
            :title="'Close'"
            data-testid="pa-inclusion-report-dialog-close-btn"
          >
            <span class="icon" style="font-family: app-icons">&#x2715;</span>
          </button>
        </div>

        <div class="inclusion-report-dialog__content">
          <InclusionReport
            cohort-definition-id=""
            :source-key="inclusionReportSourceKey"
            :cache-key="inclusionReportCacheKey"
            generation-status="complete"
            :fetch-inclusion-report="fetchInclusionReport"
            :fetch-attrition-report="fetchAttritionReportFn"
            :show-person-event-switch="false"
            :filter-card-details="inclusionReportFilterCardDetails"
            :show-intersect-view="enableIntersectViewInclusionReport"
          />
        </div>
      </div>
    </VDialog>
  </Teleport>
</template>

<script lang="ts">
import { mapActions, mapGetters } from 'vuex'
import ChartButton from './ChartButton.vue'
import DropDownMenu from './DropDownMenu.vue'
import patientCount from './PatientCount.vue'
import DisabledHoverPopover from './DisabledHoverPopover.vue'
import Constants from '../utils/Constants'
import { formatNumber } from '../utils/NumberUtils'
import icon from '../lib/ui/app-icon.vue'
import appIcon from '../lib/ui/app-icon.vue'
import DownloadMenu from './DownloadMenu.vue'
import DashboardFlowModals from './DashboardFlowModals.vue'
import Button from './Button.vue'
import { useDashboardFlow } from '../composables/useDashboardFlow'
import { usePortalContext } from '../composables/usePortalContext'

function getBookmarkKey(bookmark) {
  if (!bookmark) {
    return null
  }

  return (
    bookmark.bmkId ||
    bookmark.id ||
    bookmark.cohortDefinitionId ||
    bookmark.atlasCohortDefinitionId ||
    bookmark.bookmarkname ||
    bookmark.name ||
    null
  )
}
import VButton from './vuetify/VButton.vue'
import VDialog from './vuetify/VDialog.vue'
import { defineAsyncComponent } from 'vue'
import type { RuleFilterCardDetails } from '../query-filter/types/InclusionReportTypes'
import {
  getAttributeName,
  getAdvanceTimeFilterFormatted,
  getInclusionReportFilterCardDetails,
} from '../utils/filterCardUtils'

// Loaded on demand so plotly.js stays out of the single-spa entry's static
// dependency graph. See docs: the chart chunk was blocking mount.
const InclusionReport = defineAsyncComponent(() => import('../query-filter/components/InclusionReport/index.vue'))

export default {
  name: 'chartToolbar',
  props: ['hideEv', 'config', 'collectionEv', 'showUnHideFilters'],
  emits: ['unhideEv', 'drilldown', 'open-filtersummary'],
  data() {
    // Initialize dashboard flow composable with dispatch and getters
    const store = (this as any).$store
    const dashboardFlow = useDashboardFlow(store.dispatch, store.getters)

    return {
      portalContext: usePortalContext(),
      chartConfig: [],
      disableCensoring: true,
      unHideIcon: '',
      hideIcon: '',
      hideIconToolTip: '',
      toggleFilterCardSummary: false,
      patientCountPopoverPosition: {},
      dashboardFlow,
      showDashboardModal: false,
      showSaveCohortModal: false,
      showInclusionReportModal: false,
      inclusionReportCache: null,
      fetchAttritionReportFn: null as ((ruleOrder?: number[]) => Promise<any>) | null,
    }
  },
  watch: {
    getHasAssignedConfig: {
      immediate: true,
      handler(val) {
        if (val) {
          this.chartConfig = this.visibleChartTypes(this.getAllChartConfigs)
          this.refreshPatientCount()
        }
      },
    },
    getActiveChart() {
      this.refreshPatientCount()
    },
    getActiveBookmark(newBookmark, oldBookmark) {
      if (getBookmarkKey(newBookmark) !== getBookmarkKey(oldBookmark)) {
        // Don't reset if we're in the middle of a dashboard flow
        if (!this.dashboardFlow.isProcessingDashboardFlow()) {
          this.dashboardFlow.resetDashboardFlowState()
        }
      }
    },
  },
  created() {
    this.fetchAttritionReportFn = (ruleOrder?: number[]) => this.fetchSelectiveInclusionReport(ruleOrder)
  },
  mounted() {
    try {
      this.$nextTick(() => {
        window.addEventListener('click', this.closeSubMenu)
      })
      this.chartConfig = this.visibleChartTypes(this.getAllChartConfigs)
      this.loadValuesForAttributePath({
        attributePathUid: 'conceptSets',
        searchQuery: '',
        attributeType: 'conceptSet',
      })
    } catch (e) {
      console.error(e)
    }
  },
  beforeUnmount() {
    window.removeEventListener('click', this.closeSubMenu)
  },
  computed: {
    ...mapGetters([
      'getActiveChart',
      'getChartSelection',
      'getHasAssignedConfig',
      'getAllChartConfigs',
      'getMriFrontendConfig',
      'getText',
      'getSelectedDataset',
      'getActiveCohortMaterializedId',
      'getActiveBookmark',
      'getBookmarksData',
      'getMaterializedCohorts',
      'getBookmarks',
      'getCurrentBookmarkHasChanges',
      'getPLRequest',
      'getWizardConfig',
      'getFilterCards',
      'getFilterCard',
      'getConstraintForAttribute',
      'getBookmarkFromIFR',
      'getConstraint',
      'getCanDatasetMaterializeCohorts',
      'getCurrentPatientCount',
    ]),
    chartSelection() {
      return this.getChartSelection()
    },
    drilldownEnabled() {
      return !!(this.chartSelection && this.chartSelection.length > 0)
    },
    hasChanges() {
      return this.getActiveBookmark?.isNew || this.getCurrentBookmarkHasChanges
    },
    isWizardFeatureEnabled() {
      if (!this.portalContext?.features) {
        return false
      }
      return this.portalContext.features.some(f => f.feature === 'wizards' && f.isEnabled === true)
    },
    canOpenDashboard() {
      return this.getCanDatasetMaterializeCohorts && this.isWizardFeatureEnabled
    },
    inclusionReportSourceKey() {
      return this.getSelectedDataset?.id
    },
    inclusionReportCacheKey() {
      return JSON.stringify(this.getBookmarksData)
    },
    enableInclusionReport() {
      return this.getMriFrontendConfig?._internalConfig?.panelOptions?.inclusionReport
    },
    inclusionReportFilterCardDetails(): RuleFilterCardDetails[] {
      const content = this.getBookmarksData?.filter?.cards?.content
      if (!content) return []
      return getInclusionReportFilterCardDetails(
        content,
        (configPath: string) => getAttributeName(configPath, this.getMriFrontendConfig, 'list'),
        (filter: any) => getAdvanceTimeFilterFormatted(filter, this.getFilterCard, this.getText)
      )
    },
    enableIntersectViewInclusionReport() {
      return !!this.getMriFrontendConfig?._internalConfig?.panelOptions?.intersectViewInclusionReport
    },
    isBelowMinCohortSize() {
      const minCohortSize = this.getAllChartConfigs?.minCohortSize
      if (minCohortSize == null) return false
      // Non-numeric count (e.g. '--' when cohort is too small to display) is treated as below minimum.
      const patientCount = Number(this.getCurrentPatientCount)
      return Number.isNaN(patientCount) || patientCount < Number(minCohortSize)
    },
    minCohortSize() {
      return this.getAllChartConfigs?.minCohortSize
    },
    minCohortSizeMessage() {
      return this.getText('MRI_PA_MIN_COHORT_SIZE_DISPLAY_MESSAGE', formatNumber(this.minCohortSize))
    },
  },
  methods: {
    ...mapActions([
      'setActiveChart',
      'setFireRequest',
      'toggleConfigSelectionDialog',
      'setDatasetVersion',
      'setDataset',
      'requestDatasetVersions',
      'loadValuesForAttributePath',
      'refreshPatientCount',
      'fireBookmarkQuery',
      'fireQuery',
      'onAddCohortOkButtonPress',
      'ajaxAuth',
      'addFilterCard',
      'addFilterCardConstraint',
      'updateConstraintValue',
      'updateDateConstraintValue',
      'setWizardConfig',
      'clearWizardConfig',
      'holdFireRequest',
      'releaseFireRequest',
    ]),
    openSettingsConfig() {
      this.toggleConfigSelectionDialog()
    },
    closeSubMenu(event) {
      if (
        this.downloadMenuOpened &&
        event.target !== this.$refs.menuButton &&
        event.target.parentElement !== this.$refs.menuButton
      ) {
        this.downloadButtonClose()
      }
    },
    visibleChartTypes(chartOptions) {
      if (chartOptions) {
        let activeChartDownloads = false
        let activeChartCollections = false
        let activeChartPdfDownloads = false

        if (chartOptions && !chartOptions.custom) {
          chartOptions.custom = {
            visible: true,
            downloadEnabled: false,
            pdfDownloadEnabled: false,
            collectionEnabled: false,
          }
        }

        if (chartOptions && !chartOptions.sac) {
          chartOptions.sac = {
            visible: true,
            downloadEnabled: false,
            pdfDownloadEnabled: false,
            collectionEnabled: false,
          }
        }

        const chartTypeData = []
        Object.keys(Constants.chartInfo).forEach(key => {
          if (chartOptions[key] && chartOptions[key].visible) {
            const chartInfo = Constants.chartInfo[key]
            Object.keys(chartOptions[key]).forEach(key2 => {
              chartInfo[key2] = chartOptions[key][key2]
            })
            if (chartInfo.name === chartOptions.initialChart) {
              activeChartDownloads = chartInfo.downloadEnabled || false
              activeChartPdfDownloads = chartInfo.pdfDownloadEnabled || false
              activeChartCollections = chartInfo.collectionEnabled || false
            }
            chartTypeData.push(chartInfo)
          }
        })

        this.activeChartDownloads = activeChartDownloads
        this.activeChartCollections = activeChartCollections
        this.activeChartPdfDownloads = activeChartPdfDownloads
        return chartTypeData
      }
      return []
    },
    switchChart(button) {
      this.setActiveChart(button.name)
      let activeChartDownloads = false
      let activeChartCollections = false
      let activeChartPdfDownloads = false

      this.chartConfig.forEach(element => {
        if (element.name === button.name) {
          activeChartDownloads = element.downloadEnabled
          activeChartCollections = element.collectionEnabled
          activeChartPdfDownloads = element.pdfDownloadEnabled
        }
      })

      this.activeChartDownloads = activeChartDownloads
      this.activeChartCollections = activeChartCollections
      this.activeChartPdfDownloads = activeChartPdfDownloads

      this.setFireRequest()
    },
    showFilterCardSummary() {
      this.toggleFilterCardSummary = !this.toggleFilterCardSummary
      this.$emit('open-filtersummary', this.toggleFilterCardSummary)
    },
    getHideIconToolTip() {
      if (this.hideIconToolTip === '') {
        this.hideIconToolTip = this.getText('MRI_PA_TOOLTIP_COLLAPSE_FILTER_BAR')
      }
      return this.hideIconToolTip
    },
    toggleLeftPanel() {
      this.$emit('unhideEv')
    },
    drillDownClicked() {
      this.$emit('drilldown')
    },
    async handleOpenDashboard() {
      if (this.hasChanges) {
        this.showSaveCohortModal = true
        return
      }
      if (!this.getActiveCohortMaterializedId) {
        this.showSaveCohortModal = true
        return
      }
      this.showDashboardModal = true
    },

    handleSaveCohortSuccess({ cohortId, bookmarkId }) {
      this.showDashboardModal = true
    },

    handleCancelSaveCohort() {
      this.showSaveCohortModal = false
    },

    closeDashboardModal() {
      this.showDashboardModal = false
    },
    openInclusionReportModal() {
      this.showInclusionReportModal = true
    },
    closeInclusionReportModal() {
      this.showInclusionReportModal = false
    },

    fetchInclusionReport() {
      const mriquery = JSON.stringify(this.getBookmarksData)
      const datasetId = this.getBookmarksData.datasetId

      if (this.inclusionReportCache && this.inclusionReportCache.mriquery === mriquery) {
        return Promise.resolve(this.inclusionReportCache.result)
      }

      return this.fireQuery({
        url: '/analytics-svc/api/services/population/json/inclusionreport',
        params: { mriquery, datasetId },
      }).then(result => {
        this.inclusionReportCache = { mriquery, result }
        return result
      })
    },
    fetchSelectiveInclusionReport(ruleOrder?: number[]) {
      const mriquery = JSON.stringify(this.getBookmarksData)
      const datasetId = this.getBookmarksData.datasetId
      const params: Record<string, any> = { mriquery, datasetId }
      if (ruleOrder) {
        params.ruleOrder = JSON.stringify(ruleOrder)
      }
      return this.fireQuery({
        url: '/analytics-svc/api/services/population/json/selectiveinclusionreport',
        params,
      })
    },
  },
  components: {
    ChartButton,
    DropDownMenu,
    icon,
    patientCount,
    DisabledHoverPopover,
    appIcon,
    DownloadMenu,
    DashboardFlowModals,
    Button,
    VButton,
    VDialog,
    InclusionReport,
  },
}
</script>
