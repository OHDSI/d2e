<template>
  <div class="chartController" v-bind:class="{ withoutAxis: withoutAxis, genomics: getActiveChart === 'vb' }">
    <div v-if="getChartCover" class="chartCover"></div>
    <div class="chartControllerContent">
      <div class="axisContainer" ref="axisContainer">
        <!-- <div class="kaplanAxis-label" v-if="getActiveChart === 'vb'">{{ getText('MRI_PA_KAPLAN_AXIS_TITLE') }}</div> -->
        <div class="axis-group axis-group--top">
          <chartTypeAxisButton
            v-if="getActiveChart === 'stacked' && chartTypeAxisButtonVisible"
            :parentContainer="$refs.axisContainer"
          ></chartTypeAxisButton>
          <div class="axis-subgroup">
            <axisMenuButton
              v-if="getAllAxes[Constants.MRIChartDimensions.Y]?.props.active"
              :dimensionIndex="Constants.MRIChartDimensions.Y"
              :beforeSelect="getBeforeSelectHandler(Constants.MRIChartDimensions.Y)"
            ></axisMenuButton>
            <axisMenuButton
              v-if="getAllAxes[Constants.MRIChartDimensions.StackAttribute]?.props.active"
              :dimensionIndex="Constants.MRIChartDimensions.StackAttribute"
              :beforeSelect="getBeforeSelectHandler(Constants.MRIChartDimensions.StackAttribute)"
            ></axisMenuButton>
          </div>
          <cohortEntryExit v-if="displayShowCohortEntryExit"></cohortEntryExit>
        </div>
        <div class="axis-group axis-group--bottom">
          <div class="axis-subgroup">
            <div class="sort-button">
              <!-- <div class="sort-label" v-if="displaySort">{{ getText('MRI_PA_CHART_SORT_LABEL') }}</div> -->
              <sortMenuButton v-if="displaySort"></sortMenuButton>
            </div>
            <xAxisColorButton
              :parentContainer="$refs.axisContainer"
              :selectedAxis="colorAxisIndex"
              :disabled="isColorButtonDisabled"
              @colorAxisSelected="onColorAxisSelected"
            ></xAxisColorButton>
          </div>
          <div class="axis-subgroup">
            <axisMenuButton
              v-if="getAllAxes[Constants.MRIChartDimensions.X2]?.props.active"
              :dimensionIndex="Constants.MRIChartDimensions.X2"
              :beforeSelect="getBeforeSelectHandler(Constants.MRIChartDimensions.X2)"
            ></axisMenuButton>
            <axisMenuButton
              v-if="getAllAxes[Constants.MRIChartDimensions.X1]?.props.active"
              :dimensionIndex="Constants.MRIChartDimensions.X1"
              :beforeSelect="getBeforeSelectHandler(Constants.MRIChartDimensions.X1)"
            ></axisMenuButton>
            <axisMenuButton
              v-if="getAllAxes[Constants.MRIChartDimensions.X3]?.props.active"
              :dimensionIndex="Constants.MRIChartDimensions.X3"
              :beforeSelect="getBeforeSelectHandler(Constants.MRIChartDimensions.X3)"
            ></axisMenuButton>
          </div>
        </div>
      </div>
      <div class="chartContainer">
        <div v-if="isBelowMinCohortSize && !chartBusy" class="min-cohort-placeholder">
          <CohortDefinitionIcon class="min-cohort-placeholder__icon" />
          <div class="min-cohort-placeholder__title">{{ getText('MRI_PA_NOT_ENOUGH_DATA_TITLE') }}</div>
          <div class="min-cohort-placeholder__message">{{ notEnoughDataMessage }}</div>
        </div>
        <loadingAnimation v-if="showChartLoadingAnimation"></loadingAnimation>
        <stackBarChart
          v-if="getActiveChart === 'stacked'"
          @busyEv="setChartBusy"
          :shouldRerenderChart="shouldRerenderChart"
          :colorAxisIndex="effectiveColorAxisIndex"
          @chartDataReady="onChartDataReady"
        ></stackBarChart>
        <!-- <variantBrowser v-if="getActiveChart === 'vb'" :response="response" @busyEv="setChartBusy"></variantBrowser> -->
        <patientListContainer
          v-if="getActiveChart === 'list'"
          @busyEv="setChartBusy"
          :showLeftPane="showLeftPane"
        ></patientListContainer>
      </div>
    </div>
    <messageBox
      messageType="warning"
      dim="true"
      dialogWidth="400px"
      v-if="showClearConfirmation"
      @close="cancelClearSelection"
    >
      <template v-slot:header>{{ getText('MRI_PA_CONFIRM_SELECTION_CHANGE') }}</template>
      <template v-slot:body>
        <div>{{ clearConfirmationMessage }}</div>
      </template>
      <template v-slot:footer>
        <div class="flex-spacer"></div>
        <appButton :click="confirmClearSelection" :text="getText('MRI_PA_BUTTON_CONFIRM')"></appButton>
        <appButton :click="cancelClearSelection" :text="getText('MRI_PA_BUTTON_CANCEL')"></appButton>
      </template>
    </messageBox>
  </div>
</template>

<script lang="ts">
import { mapActions, mapGetters } from 'vuex'
import appCheckbox from '../lib/ui/app-checkbox.vue'
import appLabel from '../lib/ui/app-label.vue'
import Constants from '../utils/Constants'
import { formatNumber } from '../utils/NumberUtils'
import messageBox from './MessageBox.vue'
import appButton from '../lib/ui/app-button.vue'
import AxisMenuButton from './AxisMenuButton.vue'
import DropDownMenu from './DropDownMenu.vue'
import XAxisColorButton from './XAxisColorButton.vue'
import ChartTypeAxisButton from './ChartTypeAxisButton.vue'
import LoadingAnimation from './LoadingAnimation.vue'
import PatientListContainer from './PatientListContainer.vue'
import SacChart from './SACChart.vue'
import SortMenuButton from './SortMenuButton.vue'
import CohortEntryExit from './CohortEntryExit.vue'
import StackBarChart from './StackBarChart.vue'
import CohortsAppMenu from './CohortsAppMenu.vue'
import patientCount from './PatientCount.vue'
import CohortDefinitionIcon from './icons/CohortDefinitionIcon.vue'

export default {
  name: 'chartController',
  props: ['shouldRerenderChart', 'showLeftPane', 'chartBusy'],
  data() {
    return {
      Constants,
      response: {},
      showCensoring: false,
      showErrorLines: false,
      series: [],
      activeChartCollections: false,
      hasSetDefaultColorAxis: false,
      showClearConfirmation: false,
      clearConfirmationMessage: '',
      pendingConfirmResolve: null as ((value: boolean) => void) | null,
      pendingCancelRevert: null as (() => void) | null,
    }
  },
  created() {
    if (this.getKMDisplayInfo.hasOwnProperty('censoring')) {
      this.showCensoring = this.getKMDisplayInfo.censoring
    }
    if (this.getKMDisplayInfo.hasOwnProperty('errorlines')) {
      this.showErrorLines = this.getKMDisplayInfo.errorlines
    }
  },
  updated() {
    if (this.getKMDisplayInfo.hasOwnProperty('censoring')) {
      this.showCensoring = this.getKMDisplayInfo.censoring
    }
    if (this.getKMDisplayInfo.hasOwnProperty('errorlines')) {
      this.showErrorLines = this.getKMDisplayInfo.errorlines
    }
  },
  mounted() {
    this.$nextTick(() => {
      window.addEventListener('click', this.closeSubMenu)
    })
  },
  beforeUnmount() {
    window.removeEventListener('click', this.closeSubMenu)
    this.$emit('setChartBusy', false)
  },
  watch: {
    getActiveChart() {
      // Reset busy state when switching chart types so a destroyed chart
      // cannot leave the loading indicator stuck.
      this.$emit('setChartBusy', false)
    },
    getActiveBookmark(newVal, oldVal) {
      // Reset only when  switching to a different cohort.
      // Do NOT reset when a new cohort is saved for the first time:
      const isSavingNewCohort = !oldVal?.bmkId && !!newVal?.bmkId
      if (!isSavingNewCohort && newVal?.bmkId !== oldVal?.bmkId) {
        this.hasSetDefaultColorAxis = false
        this.setColorAxisIndex(null)
      }
    },
    getBarChartType(newVal: string) {
      // Clear the X-axis color selection whenever the chart type stops being stacked bar chart
      if (newVal !== 'stack') {
        this.setColorAxisIndex(null)
      }
    },
  },
  computed: {
    ...mapGetters([
      'getActiveChart',
      'getAllAxes',
      'getAllChartProperties',
      'getAllChartConfigs',
      'getMriFrontendConfig',
      'getText',
      'getGenomicsAxisVisible',
      'getChartCover',
      'getChartSelection',
      'getKMDisplayInfo',
      'getActiveBookmark',
      'getDatasetReloadInProgress',
      'getBarChartType',
      'getColorAxisIndex',
      'getCurrentPatientCount',
    ]),
    showChartLoadingAnimation() {
      return this.chartBusy && !this.getDatasetReloadInProgress
    },
    minCohortSize() {
      return this.getAllChartConfigs?.minCohortSize
    },
    notEnoughDataMessage() {
      return this.minCohortSize != null
        ? this.getText('MRI_PA_NOT_ENOUGH_DATA_MESSAGE', formatNumber(this.minCohortSize))
        : this.getText('MRI_PA_NOT_ENOUGH_DATA_MESSAGE_NO_MIN')
    },
    isBelowMinCohortSize() {
      const minCohortSize = this.minCohortSize ?? 0
      // Non-numeric count (e.g. '--' when cohort is too small to display) is treated as below minimum.
      const patientCount = Number(this.getCurrentPatientCount)
      return Number.isNaN(patientCount) || patientCount < Number(minCohortSize)
    },
    colorAxisIndex() {
      return this.getColorAxisIndex
    },
    isColorButtonDisabled() {
      return this.getBarChartType !== 'stack'
    },
    effectiveColorAxisIndex() {
      return this.isColorButtonDisabled ? null : this.colorAxisIndex
    },
    stackAttributeHasSelection() {
      const axis = this.getAllAxes[Constants.MRIChartDimensions.StackAttribute]
      return !!(axis?.props?.filterCardId && axis?.props?.key)
    },
    showCohorts() {
      if (this.getMriFrontendConfig) {
        return this.getMriFrontendConfig._internalConfig.panelOptions.addToCohorts
      }
      return false
    },
    chartProperties() {
      return this.getAllChartProperties()
    },
    displaySort() {
      const chartProperties = this.chartProperties
      if (
        chartProperties &&
        chartProperties[Constants.MRIChartProperties.Sort] &&
        chartProperties[Constants.MRIChartProperties.Sort].props &&
        chartProperties[Constants.MRIChartProperties.Sort].props.active
      ) {
        return true
      }
      return false
    },
    withoutAxis() {
      return this.getActiveChart === 'list' || (this.getActiveChart === 'vb' && !this.getGenomicsAxisVisible)
    },
    drilldownEnabled() {
      if (
        // this.getActiveChart !== "vb" &&
        this.chartSelection &&
        this.chartSelection.length > 0
      ) {
        return true
      }
      return false
    },
    chartSelection() {
      return this.getChartSelection()
    },
    displayShowCohortEntryExit() {
      return this.getMriFrontendConfig?._internalConfig?.panelOptions?.cohortEntryExit || false
    },
    chartTypeAxisButtonVisible() {
      const stackedOptions = this.getMriFrontendConfig?._internalConfig?.chartOptions?.stacked
      if (!stackedOptions) return false
      return (
        !!stackedOptions.overlappingHistogramEnabled ||
        !!stackedOptions.overlappingBarChartEnabled ||
        !!stackedOptions.kernelDensityPlotEnabled
      )
    },
  },
  methods: {
    ...mapActions(['setFireRequest', 'setKMDisplayInfo', 'clearAxisValue', 'setColorAxisIndex', 'setDefaultColorAxisIndex']),
    setChartBusy(status) {
      this.$emit('setChartBusy', status)
    },
    updateDisplay() {
      this.setKMDisplayInfo({
        displayInfo: {
          errorlines: this.showErrorLines,
          censoring: this.showCensoring,
        },
      })
      this.$emit('drilldown')
    },
    chartConfigs() {
      return this.getAllChartConfigs
    },
    getBeforeSelectHandler(index: number) {
      if (index === Constants.MRIChartDimensions.StackAttribute) {
        return this.confirmStackingOverColor
      }
      return null
    },
    confirmStackingOverColor(): Promise<boolean> {
      if (this.getColorAxisIndex === null) {
        return Promise.resolve(true)
      }
      this.clearConfirmationMessage = this.getText('MRI_PA_CONFIRM_CLEAR_COLOR')
      this.pendingCancelRevert = null
      return new Promise<boolean>(resolve => {
        this.pendingConfirmResolve = (confirmed: boolean) => {
          if (confirmed) {
            this.setColorAxisIndex(null)
          }
          resolve(confirmed)
        }
        this.showClearConfirmation = true
      })
    },
    onColorAxisSelected(axisIndex: number) {
      if (this.stackAttributeHasSelection) {
        this.clearConfirmationMessage = this.getText('MRI_PA_CONFIRM_CLEAR_STACKING')
        this.pendingCancelRevert = null
        this.pendingConfirmResolve = (confirmed: boolean) => {
          if (confirmed) {
            this.setColorAxisIndex(axisIndex)
            this.clearAxisValue(Constants.MRIChartDimensions.StackAttribute)
            this.setFireRequest()
          }
        }
        this.showClearConfirmation = true
      } else {
        this.setColorAxisIndex(axisIndex)
        this.clearAxisValue(Constants.MRIChartDimensions.StackAttribute)
      }
    },
    confirmClearSelection() {
      if (this.pendingConfirmResolve) {
        this.pendingConfirmResolve(true)
      }
      this.showClearConfirmation = false
      this.clearConfirmationMessage = ''
      this.pendingConfirmResolve = null
      this.pendingCancelRevert = null
    },
    cancelClearSelection() {
      if (this.pendingCancelRevert) {
        this.pendingCancelRevert()
      }
      if (this.pendingConfirmResolve) {
        this.pendingConfirmResolve(false)
      }
      this.showClearConfirmation = false
      this.clearConfirmationMessage = ''
      this.pendingConfirmResolve = null
      this.pendingCancelRevert = null
    },
    // Conditions that make an automatic default-selection admissible and that can change
    // between the chart response and the deferred commit below.
    canAutoDefaultColorAxis() {
      // colorAxisIndex already set (restored from bookmark or chosen by the user) → don't override
      if (this.getColorAxisIndex !== null) return false
      if (this.stackAttributeHasSelection) return false
      if (this.isColorButtonDisabled) return false
      return true
    },
    onChartDataReady(xAxisCategoryCounts: { axisIndex: number; count: number }[]) {
      if (xAxisCategoryCounts.length === 0) return
      if (this.hasSetDefaultColorAxis) return
      if (!this.canAutoDefaultColorAxis()) return
      this.hasSetDefaultColorAxis = true

      // Find the axis with the smaller number of categories
      const sorted = [...xAxisCategoryCounts].sort((a, b) => a.count - b.count)
      const smallest = sorted[0]

      // Only set default if the smallest category count is <= 5
      if (smallest.count > 5) return

      // StackBarChart resolves the color attribute from getAllAxes at render time, so the slot
      // must still hold the attribute these counts were measured on — otherwise the bars would be
      // colored by an attribute whose cardinality was never checked against the limit above.
      const attributeId = this.getAllAxes?.[smallest.axisIndex]?.props?.attributeId
      if (!attributeId) return

      this.$nextTick(() => {
        // Re-check: the guards above were evaluated a tick ago and the axis configuration
        // (or the color selection itself) may have changed since.
        if (!this.canAutoDefaultColorAxis()) return
        if (this.getAllAxes?.[smallest.axisIndex]?.props?.attributeId !== attributeId) return
        this.setDefaultColorAxisIndex(smallest.axisIndex)
      })
    },
  },
  components: {
    messageBox,
    appButton,
    AxisMenuButton,
    DropDownMenu,
    XAxisColorButton,
    ChartTypeAxisButton,
    LoadingAnimation,
    SortMenuButton,
    CohortEntryExit,
    StackBarChart,
    PatientListContainer,
    SacChart,
    appLabel,
    appCheckbox,
    CohortsAppMenu,
    patientCount,
    CohortDefinitionIcon,
  },
}
</script>
