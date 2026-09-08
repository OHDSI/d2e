<template>
  <div class="km-container MriPaKaplan" ref="kmChart">
    <template v-if="errorMessage">
      <chartErrorMessage :errorMessage="errorMessage"></chartErrorMessage>
    </template>
    <template v-else>
      <div class="km-chart-containter">
        <div class="km-chart" id="km-chart" ref="chart" v-mouse-scroll="this.mousewheelHandler"></div>
        <div class="km-slider-row">
          <div class="km-slider" @mouseover="sliderHover" @mouseleave="sliderOut">
            <vue-slider ref="slider" v-model="rangeSliderValue" :max="sliderMaxRange" :real-time="true" :lazy="true">
              <template v-slot:tooltip="tooltip">
                <div
                  class="km-range-slider-tooltip"
                  @mouseleave="tooltipOut"
                  @mouseover="tooltipHover"
                  v-bind:class="{
                    visible: sliderHoverState || tooltipHoverState || tooltipFocusLeft || tooltipFocusRight,
                  }"
                >
                  <input
                    v-model="cachedRangeSliderValue[tooltip.index]"
                    v-on:click.stop="onInputClick"
                    v-on:keypress="sliderInputCheck(event, tooltip.index)"
                    v-on:mousedown.stop="onInputClick"
                    @focus="tooltipFocus(tooltip.index)"
                    @blur="tooltipBlur(tooltip.index)"
                  />
                </div>
              </template>
            </vue-slider>
          </div>
          <div class="km-unitMenu">
            <kMUnitMenu @updateUnitEvt="updateUnit"></kMUnitMenu>
          </div>
        </div>
      </div>
      <div ref="info" class="km-info">
        <div class="flexItem" v-on:mouseover="logRankMouseIn" v-on:mouseout="logRankMouseOut">
          <appLabel
            :cssClass="'km-label'"
            :title="getText('MRI_PA_KAPLAN_LOG_RANK')"
            :text="getText('MRI_PA_KAPLAN_LOG_RANK_HEADER')"
          />
          <button
            ref="kmLogRankHelp"
            v-if="showKMLogRankHelpPopOverIcon"
            class="km-help"
            @click="openKMLogRankHelpPopOver"
            v-bind:class="{ visible: showKMLogRankHelpPopOverHover || showKMLogRankHelpPopOver }"
          >
            <span class="icon" style="font-family: app-icons"></span>
          </button>
        </div>
        <div class="flexItem" v-on:mouseover="logRankMouseIn" v-on:mouseout="logRankMouseOut">
          <label class="km-logRankPValue">{{ globalPValue }}</label>
        </div>
        <div class="flexItem">
          <div class="axis-menu-button-wrapper kmInteractionList-wrapper kmControlComponent kmStatisticButton">
            <div class="buttonWrapper">
              <button class="MriPaKMInfoBtnTextOverFlow" @click="openKMStatisticsPopup">
                {{ getText('MRI_PA_KAPLAN_BUT_CURVE_ANA') }}
              </button>
            </div>
          </div>
        </div>
        <div class="flexItem" style="flex: 1">
          <kmLegend v-if="showSubComponents" :series="this.series" :categories="this.chartData.categories" />
        </div>
      </div>
      <chartPopover v-if="showTooltip" :position="tooltipPosition">
        <template v-slot:body>
          <div class="kmPopover">
            <div class="kmPopoverContentDimensions">
              <template v-for="category in tooltipCategories" :key="category.value">
                <span v-bind:style="{ color: category.bg }" class="kmPopoverContentDimensionValue">{{
                  category.value
                }}</span>
              </template>
            </div>
            <div class="kmPopoverContentMeasures">
              <template v-for="measures in tooltipMeasures" :key="measures.name">
                <div class="kmPopoverContentMeasuresContainer">
                  <span class="kmPopoverContentMeasureName">{{ measures.name }}</span>
                  <span class="kmPopoverContentMeasureValue">{{ measures.value }}</span>
                </div>
              </template>
            </div>
          </div>
        </template>
      </chartPopover>
      <messageBox v-if="showKMStatisticsPopup" dim="true" @close="closeKMStatisticsPopup" messageType="custom">
        <template v-slot:header>{{ getText('MRI_PA_KAPLAN_CURVE_ANA_HED') }}</template>
        <template v-slot:body>
          <div class="flex-spacer">
            <div style="padding: 30px 30px 30px 30px">
              <div class="body-container label-for">
                <kmStatisticsTable :dof="getGlobalDoF()" :pvalue="globalPValue" :chartData="this.chartData" />
              </div>
            </div>
          </div>
        </template>
        <template v-slot:footer>
          <div class="flex-spacer"></div>
          <appButton
            :click="closeKMStatisticsPopup"
            :text="getText('MRI_PA_KAPLAN_CURVE_ANA_POPUP_BUT_CLOSE')"
            v-focus
          ></appButton>
        </template>
      </messageBox>
      <errorMessageBox
        v-if="showKMStatisticsErrPopupForMoreCurves"
        @ok="closeKMStatisticsErrPopupForMoreCurves"
        :header="getText('MRI_PA_KAPLAN_CURVE_ANA_MORE_CURVES_SELECTED_ERR_POPUP_HED')"
        :message="getText('MRI_PA_KAPLAN_CURVE_ANA_MORE_CURVES_SELECTED')"
      />
      <errorMessageBox
        v-if="showKMStatisticsErrPopupForOneCurve"
        @ok="closeKMStatisticsErrPopupForOneCurve"
        :header="getText('MRI_PA_KAPLAN_CURVE_ANA_1_CURVE_SELECTED_ERR_POPUP_HED')"
        :message="getText('MRI_PA_KAPLAN_CURVE_ANA_1_CURVE_SELECTED')"
      />
      <dialogBox
        v-if="showKMLogRankHelpPopOver"
        @close="showKMLogRankHelpPopOver = false"
        :position="kmLogRankHelpPopoverPosition"
        :arrow="'arrowUp'"
        :arrowPosition="kmLogRankHelpArrowPosition"
        dialogWidth="300px"
      >
        <template v-slot:header>
          <span class="km-logrank-help-popover-header">{{
            getText('MRI_PA_KAPLAN_CURVE_ANA_1_CURVE_SELECTED_ERR_POPOVER_HED')
          }}</span>
        </template>
        <template v-slot:body>
          <div class="km-logrank-help-popover-content">
            <div class="km-logrank-help-popover-content-container">
              <div class="km-logrank-help-popover-content-data">
                {{ getText('MRI_PA_KAPLAN_CURVE_ANA_1_CURVE_SELECTED_ERR_POPOVER') }}
              </div>
            </div>
          </div>
        </template>
      </dialogBox>
    </template>
  </div>
</template>

<script lang="ts">
import d3 from 'd3'
import { mapActions, mapGetters } from 'vuex'
import axios from 'axios'
import appButton from '../lib/ui/app-button.vue'
import appCheckbox from '../lib/ui/app-checkbox.vue'
import appLabel from '../lib/ui/app-label.vue'
import Constants from '../utils/Constants'
import DateUtils from '../utils/DateUtils'
import processCSV from '../utils/ProcessCSV'
import { generateDownloadFileName } from '../utils/generateDownloadFileName'
import chartErrorMessage from './ChartErrorMessage.vue'
import ChartPopover from './ChartPopover.vue'
import DialogBox from './DialogBox.vue'
import KMEndEventMenu from './KMEndEventMenu.vue'
import KMInteractionList from './KMInteractionList.vue'
import kmLegend from './KMLegend.vue'
import KMStartEventMenu from './KMStartEventMenu.vue'
import kmStatisticsTable from './KMStatisticsTable.vue'
import KMUnitMenu from './KMUnitMenu.vue'
import messageBox from './MessageBox.vue'
import errorMessageBox from './Notification.vue'

const X_PADDING = 50
const Y_PADDING = 20
const MAX_LEGEND_WIDTH = 20
const DAYS_PER_DAY = 1
const DAYS_PER_WEEK = 7
const DAYS_PER_YEAR = 365.24
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12

/*
const MULTIPLIER = [
  5000, 2000, 1000,
  500, 200, 100,
  50, 20, 10,
  5, 2, 1,
  0.5, 0.2, 0.1,
  0.05, 0.02, 0.01,
];
*/
const MULTIPLIER = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]

const UNIT_DATA = {
  days: {
    label: 'MRI_PA_KAPLAN_DAYS_LONG',
    unitLabel: 'MRI_PA_KAPLAN_DAY',
    avgDaysInUnit: DAYS_PER_DAY,
    upperRangeLimit: DAYS_PER_MONTH,
    digitsAfterDecimalPoint: 0,
    fontStyle: 'normal',
    fontWeight: 'normal',
  },
  weeks: {
    label: 'MRI_PA_KAPLAN_WEEKS_LONG',
    unitLabel: 'MRI_PA_KAPLAN_WEEK',
    avgDaysInUnit: DAYS_PER_WEEK,
    upperRangeLimit: 12 * DAYS_PER_WEEK,
    digitsAfterDecimalPoint: 1,
    fontStyle: 'normal',
    fontWeight: 'normal',
  },
  months: {
    label: 'MRI_PA_KAPLAN_MONTHS_LONG',
    unitLabel: 'MRI_PA_KAPLAN_MONTH',
    avgDaysInUnit: DAYS_PER_MONTH,
    upperRangeLimit: 3 * DAYS_PER_YEAR,
    digitsAfterDecimalPoint: 1,
    fontStyle: 'italic',
    fontWeight: 'normal',
  },
  years: {
    label: 'MRI_PA_KAPLAN_YEARS_LONG',
    unitLabel: 'MRI_PA_KAPLAN_YEAR',
    avgDaysInUnit: DAYS_PER_YEAR,
    upperRangeLimit: null,
    digitsAfterDecimalPoint: 1,
    fontStyle: 'italic',
    fontWeight: 'normal',
  },
}

export default {
  name: 'kaplanMeier',
  data() {
    return {
      chartData: {},
      series: [],
      errorMessage: '',
      requestId: 0,
      requestCancel: null as (() => void) | null,
      isUnmounted: false,
      maxDataday: 0,
      maxDay: 0,
      minDay: 0,
      minProb: 0.0,
      xScale: 0,
      yScale: 0,
      kmChartStyle: {},
      selection: [],
      showTooltip: false,
      tooltipPosition: {},
      tooltipCategories: [],
      tooltipMeasures: [],
      showCensoring: false,
      showErrorLines: false,
      rangeSliderValue: [0, 0],
      cachedRangeSliderValue: [0, 0],
      sliderHoverState: false,
      tooltipHoverState: false,
      tooltipFocusLeft: false,
      tooltipFocusRight: false,
      sliderFocus: false,
      sliderWidth: 0,
      kmInterval: '',
      kmUnit: 'years',
      showKMStatisticsPopup: false,
      showKMStatisticsErrPopupForMoreCurves: false,
      showKMStatisticsErrPopupForOneCurve: false,
      showKMLogRankHelpPopOverHover: false,
      showKMLogRankHelpPopOverIcon: false,
      showKMLogRankHelpPopOver: false,
      globalPValue: '',
      allCurves: {},
      kmLogRankHelpPopoverPosition: {
        right: '8px',
      },
      kmLogRankHelpArrowPosition: {
        left: '270px',
      },
      // Other components need data to be setup first
      showSubComponents: false,
    }
  },
  created() {
    if (this.getKMDisplayInfo.censoring) {
      this.showCensoring = true
    }
    if (this.getKMDisplayInfo.errorlines) {
      this.showErrorLines = true
    }
  },
  mounted() {
    this.$nextTick(() => {
      window.addEventListener('resize', this.renderChart)
    })
    this.setupAxes()
    this.setFireRequest()
  },
  beforeUnmount() {
    this.isUnmounted = true
    this.cancelRequest()
    this.$emit('busyEv', false)
    window.removeEventListener('resize', this.renderChart)
  },
  computed: {
    ...mapGetters([
      'getMriFrontendConfig',
      'getSplitterWidth',
      'getText',
      'getChartSize',
      'getCsvFireDownload',
      'getActiveChart',
      'getActiveBookmark',
      'getChartProperty',
      'getKMDisplayInfo',
      'getKMFirstLoad',
      'getFireRequest',
      'isFireRequestHeld',
      'getBookmarksData',
      'translate',
    ]),
    csvFileName() {
      return generateDownloadFileName(this.getActiveBookmark?.bookmarkname, this.getActiveChart, 'csv')
    },
    kmEndEventModel() {
      return this.getChartProperty(Constants.MRIChartProperties.KMEndEvent)
    },
    kmStartEventModel() {
      return this.getChartProperty(Constants.MRIChartProperties.KMStartEvent)
    },
    sliderMaxRange() {
      return this.maxDataday ? this.maxDataday : 0
    },
    kmLogRankValue() {
      const data = this.chartData
      if (
        data &&
        data.logRankTestResults &&
        data.logRankTestResults.overallResult &&
        data.logRankTestResults.overallResult.pValue
      ) {
        return data.logRankTestResults.overallResult.pValue
      }
      return '0'
    },
    getCurves() {
      const data = this.chartData
      const pairResults = data.kaplanMeierStatistics.curvePairResults

      Object.keys(pairResults).forEach(key => {
        const { outerEl, outerElTitle, innerEl, innerElTitle } = pairResults[key]
        if (!this.allCurves[outerEl]) {
          this.allCurves[outerEl] = {
            title: outerElTitle,
          }
        }
        if (!this.allCurves[innerEl]) {
          this.allCurves[innerEl] = {
            title: innerElTitle,
          }
        }
      })
      return this.allCurves
    },
  },
  watch: {
    getSplitterWidth() {
      this.renderChart()
    },
    getChartSize() {
      const pdfSize = this.getChartSize
      const kmChartStyle: any = {}
      if (pdfSize.width) {
        kmChartStyle.width = pdfSize.width
      }

      if (pdfSize.height) {
        kmChartStyle.height = pdfSize.height
      }

      this.kmChartStyle = kmChartStyle

      this.$nextTick(() => {
        this.renderChart()
        if (pdfSize.width || pdfSize.height) {
          this.setPdfChartReady(true)
        } else {
          this.setPdfChartReady(false)
        }
      })
    },
    rangeSliderValue() {
      this.minDay = this.rangeSliderValue[0]
      this.maxDay = this.rangeSliderValue[1]
      const currentUnitInfo = this.getOptimalUnitInfo(this.minDay, this.maxDay)
      this.cachedRangeSliderValue[0] =
        Math.round((this.rangeSliderValue[0] * 100) / currentUnitInfo.avgDaysInUnit) / 100
      this.cachedRangeSliderValue[1] =
        Math.round((this.rangeSliderValue[1] * 100) / currentUnitInfo.avgDaysInUnit) / 100
      this.renderChart()
    },
    getCsvFireDownload() {
      const { kmEndEventIdentifier, kmStartEventOccurence, kmEventIdentifier, kmEndEventOccurence } =
        this.buildRequest()

      this.downloadCSV({
        ...this.getBookmarksData,
        kmEndEventIdentifier,
        kmStartEventOccurence,
        kmEventIdentifier,
        kmEndEventOccurence,
      })
        .then(response => processCSV(response, this.csvFileName))
        .catch(() => {
          // do nothing
        })
        .finally(() => {
          this.completeDownloadCSV()
        })
    },
    getFireRequest() {
      // Skip if fire requests are being held (during batch updates like applying required filters)
      if (this.isFireRequestHeld) {
        return
      }
      const callback = chartData => {
        this.showSubComponents = false
        this.chartData = this.processResponse(chartData)
        this.series = []
        this.setCurrentPatientCount({
          currentPatientCount: chartData.totalPatientCount,
        })
        this.errorMessage = this.chartData.noDataReason || ''

        if (!this.errorMessage) {
          if (
            this.chartData &&
            this.chartData.kaplanMeierStatistics &&
            this.chartData.kaplanMeierStatistics.overallResult &&
            this.chartData.kaplanMeierStatistics.overallResult.pValue
          ) {
            if (this.chartData.kaplanMeierStatistics.overallResult.pValue === '--') {
              this.showKMLogRankHelpPopOverIcon = true
              this.globalPValue = this.chartData.kaplanMeierStatistics.overallResult.pValue
            } else {
              this.showKMLogRankHelpPopOverIcon = false
              this.globalPValue = this.formatPValue(this.chartData.kaplanMeierStatistics.overallResult.pValue)
            }
          } else {
            this.showKMLogRankHelpPopOverIcon = false
            this.globalPValue = this.formatPValue(' = 0')
          }
          this.series = this.translateSeries(this.chartData)
          this.setKMLegends({
            categories: this.chartData.categories,
            series: this.series,
          })
          this.renderChart()
          this.resetRangeSlider()
          this.showSubComponents = true
        }
        this.$emit('busyEv', false)

        if (this.chartData.hasOwnProperty('noDataReason')) {
          this.setCurrentPatientCount({
            currentPatientCount: '--',
          })
        }
      }

      this.errorMessage = ''
      const bookmark = this.getBookmarksData
      if (Object.keys(bookmark).length !== 0 && bookmark) {
        // Through startRequest, as every other chart does. It cancels the request
        // still in flight and drops any response that lands after a newer one went
        // out — without it, two quick edits both stayed alive and the slower (older)
        // response wrote the count last, for a cohort no longer on screen. That write
        // also clears the store's staleness flag, so a reader waiting for the new
        // result (pa_get_cohort_result) stops waiting and takes the old number.
        this.startRequest(
          ({ cancelToken }) =>
            this.fireQuery({
              url: '/analytics-svc/api/services/population/json/kaplanmeier',
              params: { mriquery: JSON.stringify(bookmark) },
              cancelToken,
            }),
          callback,
          ({ response }) => {
            if (response) {
              let noDataReason = this.getText('MRI_PA_CHART_NO_DATA_DEFAULT_MESSAGE')

              // For all handled errors from backend
              if (response.status === 500) {
                noDataReason = response.data.errorMessage
                if (response.data.errorType === 'MRILoggedError') {
                  noDataReason = this.getText('MRI_DB_LOGGED_MESSAGE', response.data.logId)
                }
              }

              callback({
                data: [],
                measures: [],
                categories: [],
                totalPatientCount: 0,
                noDataReason,
              })
            }
          }
        )
      } else {
        this.$emit('busyEv', false)
      }
    },
    getKMDisplayInfo() {
      this.showCensoring = this.getKMDisplayInfo.censoring
      this.showErrorLines = this.getKMDisplayInfo.errorlines
      this.$nextTick(() => {
        this.renderChart()
      })
    },
  },
  methods: {
    ...mapActions([
      'setAxisValue',
      'fireQuery',
      'disableAllAxesandProperties',
      'setPdfChartReady',
      'setTicks',
      'setTicksData',
      'downloadCSV',
      'setCurrentPatientCount',
      'setFireRequest',
      'setKMLegends',
      'setKMFirstLoad',
      'completeDownloadCSV',
      'setChartPropertyValue',
    ]),
    buildRequest() {
      const kmRequest = JSON.parse(JSON.stringify(this.getBookmarksData))
      const kmEndEvent = this.kmEndEventModel
      const kmStartEvent = this.kmStartEventModel
      if (kmEndEvent && kmEndEvent.props && kmEndEvent.props.value) {
        kmRequest.kmEndEventIdentifier = kmEndEvent.props.value.kmEndEventIdentifier
        kmRequest.kmEndEventOccurence = kmEndEvent.props.value.kmEndEventOccurence
      }

      if (!kmRequest.kmEndEventIdentifier) {
        kmRequest.kmEndEventIdentifier = 'patient.dateOfDeath'
      }

      if (!kmRequest.kmEndEventOccurence) {
        kmRequest.kmEndEventOccurence = ''
      }

      if (kmStartEvent && kmStartEvent.props && kmStartEvent.props.value) {
        kmRequest.kmEventIdentifier = kmStartEvent.props.value.kmEventIdentifier
        kmRequest.kmStartEventOccurence = kmStartEvent.props.value.kmStartEventOccurence
      }

      if (!kmRequest.kmEventIdentifier) {
        kmRequest.kmEventIdentifier = 'patient.dateOfBirth'
      }

      if (!kmRequest.kmStartEventOccurence) {
        kmRequest.kmStartEventOccurence = 'start_min'
      }
      return kmRequest
    },
    zoom(day, factor) {
      if (day > 0) {
        let minday = this.minDay
        let maxday = this.maxDay
        const width = maxday - minday

        minday = Math.floor(day * (1.0 - factor) + factor * minday)
        maxday = Math.ceil(minday + factor * width)

        if (minday < 0) {
          minday = 0
        }

        if (maxday > this.maxDataday) {
          maxday = this.maxDataday
        }

        if (minday > maxday) {
          minday = maxday
        }

        const newRangeSliderValue = [minday, maxday]
        this.rangeSliderValue = newRangeSliderValue
      }
    },
    mousewheelHandler(event) {
      event.stopImmediatePropagation()

      const zoomScrollArea = this.$refs.chart.getBoundingClientRect()
      const xScroll = event.clientX
      const yScroll = event.clientY

      if (
        zoomScrollArea.left <= xScroll &&
        zoomScrollArea.right >= xScroll &&
        zoomScrollArea.top <= yScroll &&
        zoomScrollArea.bottom >= yScroll
      ) {
        event.stopImmediatePropagation()

        const offsetX = xScroll - zoomScrollArea.left
        const day = this.xScale.invert(offsetX)
        let normalizedDelta = 0 // positive = UP, negative = DOWN
        if (event.detail) {
          normalizedDelta = -event.detail / 3
        } else if (event.wheelDelta) {
          normalizedDelta = event.wheelDelta / 120
        }
        if (normalizedDelta > 0) {
          this.zoom(day, 0.75)
        } else if (normalizedDelta < 0) {
          this.zoom(day, 1.0 / 0.75)
        }
      }
    },

    logRankMouseIn() {
      this.showKMLogRankHelpPopOverHover = true
    },
    logRankMouseOut() {
      this.showKMLogRankHelpPopOverHover = false
    },
    translateSeries(chartData) {
      if (chartData) {
        const duplicateResponse = JSON.parse(JSON.stringify(chartData))
        return this.translate(duplicateResponse.data)
      }
      return []
    },
    updateUnit(event) {
      const newUnit = this.getUnitInfo(event.newKey)
      if (this.kmInterval) {
        const oldUnit = this.getUnitInfo(event.oldKey)
        this.kmInterval *= newUnit.avgDaysInUnit / oldUnit.avgDaysInUnit
      }
      this.cachedRangeSliderValue[0] = Math.round((this.rangeSliderValue[0] * 100) / newUnit.avgDaysInUnit) / 100
      this.cachedRangeSliderValue[1] = Math.round((this.rangeSliderValue[1] * 100) / newUnit.avgDaysInUnit) / 100
      this.kmUnit = event.newKey
      this.renderChart()
    },
    sliderHover() {
      this.sliderHoverState = true
    },
    sliderOut() {
      this.sliderHoverState = false
    },
    tooltipHover() {
      this.tooltipHoverState = true
    },
    tooltipOut() {
      this.tooltipHoverState = false
    },
    tooltipFocus(index) {
      if (index === 0) {
        this.tooltipFocusLeft = true
      }
      if (index === 1) {
        this.tooltipFocusRight = true
      }
    },
    tooltipBlur(index) {
      if (index === 0) {
        this.tooltipFocusLeft = false
      }
      if (index === 1) {
        this.tooltipFocusRight = false
      }
    },
    onInputClick(event) {
      if (event && event.stopPropagation) {
        event.stopPropagation()
      }
    },
    updateSliderValue(sliderIndex) {
      let newValue = this.rangeSliderValue[sliderIndex]
      if (
        this.cachedRangeSliderValue &&
        (this.cachedRangeSliderValue[sliderIndex] || this.cachedRangeSliderValue[sliderIndex] === 0) &&
        !isNaN(this.cachedRangeSliderValue[sliderIndex])
      ) {
        newValue = parseFloat(this.cachedRangeSliderValue[sliderIndex])

        const currentUnitInfo = this.getOptimalUnitInfo(this.minDay, this.maxDay)
        newValue *= currentUnitInfo.avgDaysInUnit
      }
      const newRangeSliderValue = [0, 0]
      for (let i = 0; i < 2; i += 1) {
        newRangeSliderValue[i] = i === sliderIndex ? newValue : this.rangeSliderValue[i]
      }
      if (newRangeSliderValue[0] > newRangeSliderValue[1]) {
        const temp = newRangeSliderValue[0]
        newRangeSliderValue[0] = newRangeSliderValue[1]
        newRangeSliderValue[1] = temp
      }
      this.rangeSliderValue = newRangeSliderValue
    },
    sliderInputCheck(event, sliderIndex) {
      const evt = event || window.event
      const code = evt.which ? evt.which : evt.keyCode
      if (code === 13) {
        this.updateSliderValue(sliderIndex)
        evt.preventDefault()
      } else if (!((code >= 48 && code <= 57) || code === 46 || code === 69 || code === 101)) {
        // Not 0-9, e, E, or .
        evt.preventDefault()
      }
      return true
    },
    intervalInputCheck() {
      const evt: any = event || window.event
      const code = evt.which ? evt.which : evt.keyCode
      if (code === 13) {
        // this.updateSliderValue(sliderIndex);
        evt.preventDefault()
      } else if (!((code >= 48 && code <= 57) || code === 46 || code === 69 || code === 101)) {
        // Not 0-9, e, E, or .
        evt.preventDefault()
      }
      return true
    },
    resetRangeSlider() {
      this.rangeSliderValue = [0, this.maxDataday]
    },
    startRequest(fire, onSuccess, onError) {
      this.requestId += 1
      const requestId = this.requestId

      if (this.requestCancel) {
        this.requestCancel()
        this.requestCancel = null
      }

      const cancelToken = new axios.CancelToken(c => {
        this.requestCancel = () => c('cancel')
      })

      this.$emit('busyEv', true)

      fire({ cancelToken })
        .then(data => {
          if (this.isUnmounted || requestId !== this.requestId) return
          onSuccess(data)
        })
        .catch(error => {
          if (this.isUnmounted || requestId !== this.requestId) return
          onError(error)
        })
        .finally(() => {
          if (this.isUnmounted || requestId !== this.requestId) return
          this.requestCancel = null
          this.$emit('busyEv', false)
        })
    },
    cancelRequest() {
      if (this.requestCancel) {
        this.requestCancel()
        this.requestCancel = null
      }
    },
    setupAxes() {
      this.disableAllAxesandProperties()

      this.setChartPropertyValue({
        id: Constants.MRIChartProperties.KMStartEvent,
        props: {
          layoutLeft: 0,
          layoutTop: 153.7,
          layoutBottom: '',
          active: true,
        },
      })

      this.setChartPropertyValue({
        id: Constants.MRIChartProperties.KMEndEvent,
        props: {
          layoutLeft: 0,
          layoutTop: 293.5,
          layoutBottom: '',
          active: true,
        },
      })

      const iLevelHeight = 41
      for (let i = 0; i <= Constants.MRIChartDimensions.X3; i += 1) {
        this.setAxisValue({
          id: i,
          props: {
            layoutLeft: '0px',
            layoutTop: '',
            layoutBottom: `${20 + i * iLevelHeight}px`,
            icon: { 0: '', 1: '', 2: '' }[i],
            iconFamily: 'app-MRI-icons',
            isCategory: true,
            isMeasure: false,
            active: true,
          },
        })
      }
    },
    selectOptimalUnitForInterval(minDay, maxDay) {
      const keysSortedByUnitLength = Object.keys(UNIT_DATA).sort((a, b) => {
        const aUnitNo = UNIT_DATA[a].avgDaysInUnit
        const bUnitNo = UNIT_DATA[b].avgDaysInUnit
        if (aUnitNo < bUnitNo) {
          return -1
        }
        if (aUnitNo > bUnitNo) {
          return 1
        }
        return 0
      })
      if (typeof minDay !== 'number' || typeof maxDay !== 'number') {
        return keysSortedByUnitLength[keysSortedByUnitLength.length - 1]
      }
      if (minDay > maxDay) {
        throw new Error(`The start of the interval (${minDay}) is smaller than the end (${maxDay})!`)
      }
      const lengthInDays = maxDay - minDay
      const allowedUnitLabels = keysSortedByUnitLength.filter(unitKey => {
        const currentRangeLimit = UNIT_DATA[unitKey].upperRangeLimit
        return typeof currentRangeLimit !== 'number' || lengthInDays <= currentRangeLimit
      })
      if (allowedUnitLabels.length === 0) {
        throw new Error(`No allowed unit found for the interval (${minDay},${maxDay})!`)
      }
      const smallestAllowedUnitLabel = allowedUnitLabels[0]
      return smallestAllowedUnitLabel
    },
    getUnitInfo(unitLabel) {
      return UNIT_DATA[unitLabel]
    },
    getOptimalUnitInfo(minDay, maxDay) {
      let unitKey = this.kmUnit
      if (!unitKey) {
        unitKey = this.selectOptimalUnitForInterval(minDay, maxDay)
      }
      const unitInfo = this.getUnitInfo(unitKey)
      return unitInfo
    },
    genericDayFormatter(days, unitInfo, unitLabelIsNeeded) {
      if (typeof days !== 'number') {
        return ''
      }
      const convertedValue = days / unitInfo.avgDaysInUnit
      let returnString = convertedValue.toFixed(unitInfo.digitsAfterDecimalPoint)
      if (unitLabelIsNeeded) {
        returnString += ` ${unitInfo.label}`
      }
      return returnString
    },
    getActiveDayFormatter(unitLabelIsNeeded) {
      const minDay = this.minDay
      const maxDay = this.maxDay
      const currentUnitInfo = this.getOptimalUnitInfo(minDay, maxDay)
      const formatFunc = daysNo => this.genericDayFormatter(daysNo, currentUnitInfo, unitLabelIsNeeded)
      return formatFunc
    },
    computeCensoredPoints(series, minday, maxday, minprob, minDistance, xScale) {
      series.mCensored = []
      if (this.showCensoring && series.censored && series.mPoints.length > 0) {
        // compute y values for censored data
        let j = 0
        let iClusterStart = 0
        let nClusterY = 0
        let iClusterCount = 0

        // Use some() to allow ending the loop early by returning true
        series.censored.some((censored, i) => {
          const xvalue = censored[0]
          const iPointCount = censored[1]

          if (xvalue > maxday) {
            return true
          }
          if (iPointCount <= 0 || xvalue < minday) {
            return false
          }
          while (j < series.mPoints.length - 1 && xvalue > series.mPoints[j + 1][0]) {
            j += 1
          }
          const yvalue = series.mPoints[i][1]
          if (yvalue < minprob) {
            return true
          }
          const refPoint = iClusterCount > 0 ? iClusterStart : xvalue
          const k = i + 1
          if (k < series.censored.length && series.mPoints[k][1] !== series.mPoints[i][1]) {
            // Check if the interval has ended
            if (iClusterCount === 0) {
              series.mCensored.push([xvalue, yvalue, iPointCount])
            } else {
              series.mCensored.push([iClusterStart, nClusterY, iClusterCount])
              iClusterCount = 0
            }
          } else if (k < series.censored.length && xScale(series.censored[k][0]) - xScale(refPoint) < minDistance) {
            if (iClusterCount === 0) {
              iClusterStart = refPoint
              nClusterY = yvalue
              iClusterCount = iPointCount
            }
            iClusterCount += series.censored[k][1]
          } else if (iClusterCount === 0) {
            series.mCensored.push([xvalue, yvalue, iPointCount])
          } else {
            series.mCensored.push([iClusterStart, nClusterY, iClusterCount])
            iClusterCount = 0
          }
          return false
        })
      }
    },
    pickColor(index) {
      return [
        '#EB7300',
        '#93C939',
        '#F0AB00',
        '#960981',
        '#EB7396',
        '#E35500',
        '#4FB81C',
        '#D29600',
        '#760A85',
        '#C87396',
        '#BC3618',
        '#247230',
        '#BE8200',
        '#45157E',
        '#A07396',
      ][index % 15]
    },
    processResponse(resp) {
      const newResponse = JSON.parse(JSON.stringify(resp))

      newResponse.data.forEach(mData => {
        mData.name = newResponse.categories
          .map(mCategory => {
            const oAttributeConfig = this.getMriFrontendConfig.getAttributeByPath(mCategory.id)
            if (oAttributeConfig) {
              if (
                oAttributeConfig.getType() === Constants.CDMAttrType.Date ||
                oAttributeConfig.getType() === Constants.CDMAttrType.Datetime
              ) {
                const dDate = DateUtils.parseISODate(mData[mCategory.id])
                if (dDate) {
                  if (oAttributeConfig.getType() === Constants.CDMAttrType.Date) {
                    return DateUtils.displayDateFormat(dDate)
                  }
                  return DateUtils.displayDateTimeFormat(dDate)
                }
              }
            } else if (mCategory.id === 'dummy_category') {
              return this.getText('MRI_PA_CURRENT_COHORT')
            }
            return mData[mCategory.id]
          })
          .join(', ')

        // Remove all entries that have a negative value for x
        // That can be caused by bad patient data (eg. DoD before DoB and interactions)
        mData.censored = mData.censored.filter(aCensor => aCensor[0] >= 0)
        mData.points = mData.points.filter(aPoint => aPoint[0] >= 0)
      })

      newResponse.categories.forEach(mCategory => {
        if (mCategory.id === 'dummy_category') {
          mCategory.name = this.getText('MRI_PA_DUMMY_CATEGORY')
        }
      })

      return newResponse
    },
    renderChart() {
      if (!this.$refs.chart) {
        return
      }
      if (this.$refs.chart.firstChild) {
        this.$refs.chart.removeChild(this.$refs.chart.firstChild)
      }

      if (this.getKMFirstLoad && Object.keys(this.getKMFirstLoad).length > 0) {
        if (this.getKMFirstLoad.init) {
          this.showCensoring = false
          this.showErrorLines = false
        }

        this.showCensoring = this.getKMFirstLoad.censoring

        this.showErrorLines = this.getKMFirstLoad.errorlines

        this.setKMFirstLoad({ firstLoad: {} })
      }
      let height = Math.floor(
        this.$refs.chart.getBoundingClientRect().bottom - this.$refs.chart.getBoundingClientRect().top
      )
      let width = Math.floor(
        this.$refs.chart.getBoundingClientRect().right - this.$refs.chart.getBoundingClientRect().left
      )

      if (this.kmChartStyle && this.kmChartStyle.width) {
        width = this.kmChartStyle.width
      }

      if (this.kmChartStyle && this.kmChartStyle.height) {
        height = this.kmChartStyle.height
      }

      this.sliderWidth = (width * 90) / 100

      const ypadding = Y_PADDING
      const xpadding = X_PADDING
      const series = this.series
      const minprob = this.minProb
      let minday = this.minDay
      let maxday = this.maxDay
      const dayFormatterNoUnitLabel = this.getActiveDayFormatter(false)
      const axislabelverticalpadding = 30
      const offsetVerticalSpacingXAxisUnit = 14
      const offsetHorizontalSpacingXAxisUnit = 2

      // Set the unit to optimal value
      const currentUnitInfo = this.getOptimalUnitInfo(minday, maxday)

      const xTicks = Math.min(width / 40, 10) // how many ticks to show on the x axis
      const yTicks = Math.min(height / 40, 10) // ... and on the y axis

      // Find the largest day no (time interval) in data set
      let iMaxdayInData = 0
      series.forEach(serie => {
        if (serie.points.length > 0) {
          const lastpoint = serie.points[serie.points.length - 1]
          iMaxdayInData = lastpoint[0] >= iMaxdayInData ? lastpoint[0] : iMaxdayInData
        }
      })

      this.maxDataday = iMaxdayInData

      // Ensure that mainday and maxday have sensible values
      if (iMaxdayInData && (typeof maxday === 'undefined' || maxday > iMaxdayInData)) {
        maxday = iMaxdayInData
        this.maxDay = maxday
      }

      if (maxday === 0) {
        this.maxDay = iMaxdayInData
        maxday = iMaxdayInData
      }

      if ((typeof maxday !== 'undefined' && minday > maxday) || minday < 0 || typeof minday === 'undefined') {
        minday = 0
        this.minDay = minday
      }

      // Set x-axis scale
      const xScale = d3.scale
        .linear()
        .domain([minday, maxday])
        .range([xpadding, width - xpadding])
      this.xScale = xScale

      // Set y-axis scale
      const yScale = d3.scale
        .linear()
        .domain([minprob, 1])
        .range([height - ypadding - axislabelverticalpadding, ypadding])
      this.yScale = yScale

      const svg = d3.select(document.createElementNS(d3.ns.prefix.svg, 'svg'))

      if (series.length > 0) {
        const dataLines = []

        svg
          .attr('viewBox', `0 0 ${width} ${height}`)
          .attr('preserveAspectRatio', 'none')
          .attr('pointer-events', 'all')
          .attr('width', width)
          .attr('height', height)

        // If we don't add an invisible rectangle that comprises the whole SVG,
        // click events to this latter won't be propagated correctly in IE.
        svg.append('rect').attr('x', 0).attr('y', 0).attr('width', width).attr('height', height).attr('fill', 'none')

        const line = d3.svg
          .line()
          .x(d => xScale(d[0]))
          .y(d => yScale(d[1]))
          .interpolate('step-after')

        const standardAxisFontSize = '14px'

        // Do we have enforceable TickValues?
        // For Automated Behavior, we will look at first option that
        let tickValues
        const kmInterval = parseFloat(this.kmInterval)
        const bisector = d3.bisector(d => d[0]).left

        if (kmInterval && kmInterval > 0) {
          tickValues = []
          let tickPoint = 0
          tickValues.push(minday)
          while (tickPoint <= maxday) {
            if (tickPoint > minday) {
              tickValues.push(tickPoint)
            }
            tickPoint += kmInterval * currentUnitInfo.avgDaysInUnit
          }
        } else {
          for (let i = 0; i < MULTIPLIER.length; i += 1) {
            let tickPoint = 0
            tickValues = []
            tickValues.push(minday)
            while (tickPoint <= maxday) {
              if (tickPoint > minday) {
                tickValues.push(tickPoint)
              }
              tickPoint += MULTIPLIER[i] * currentUnitInfo.avgDaysInUnit
            }
            if (tickValues.length <= xTicks) {
              break
            }
          }
        }

        // X-axis
        const xAxis = d3.svg
          .axis()
          .scale(xScale)
          .tickFormat(dayFormatterNoUnitLabel)
          .tickSize(6, 10)
          .tickValues(tickValues)
          .ticks(xTicks)
        svg
          .append('g')
          .attr('class', 'axis kmXAxis')
          .attr('transform', `translate(0,${height - ypadding - axislabelverticalpadding})`)
          .call(xAxis)
          .selectAll('text')
          .style('text-anchor', 'middle')
          .style('font-size', standardAxisFontSize)
          .style('font-style', currentUnitInfo.fontStyle)
          .style('font-weight', currentUnitInfo.fontWeight)
          .attr('dy', '1em')

        // Add x-axis label
        svg
          .append('text')
          .attr('text-anchor', 'middle')
          .attr(
            'transform',
            `translate(${width / offsetHorizontalSpacingXAxisUnit},${height - offsetVerticalSpacingXAxisUnit})`
          )
          .style('font-size', standardAxisFontSize)
          .style('font-style', currentUnitInfo.fontStyle)
          .style('font-weight', currentUnitInfo.fontWeight)
          .text(this.getText(currentUnitInfo.label))
          .attr('dy', '.2em')

        // Y-axis
        const yAxis = d3.svg.axis().scale(yScale).orient('left').tickFormat(d3.format('p%')).ticks(yTicks)
        svg
          .append('g')
          .attr('class', 'axis')
          .attr('transform', `translate(${xpadding},0)`)
          .call(yAxis)
          .selectAll('text')
          .style('font-size', standardAxisFontSize)

        // Add grid (Horizontal lines)
        const gridYAxis = d3.svg
          .axis()
          .scale(yScale)
          .orient('left')
          .ticks(yTicks)
          .tickSize(-(width - 2 * xpadding), 0)
          .tickFormat('')
        svg.append('g').attr('class', 'grid').attr('transform', `translate(${xpadding},0)`).call(gridYAxis)

        // todo ? this.addColors(series);
        series.forEach((s, i) => {
          if (!s.mColor) {
            s.mColor = this.pickColor(i)
          }
        })

        // todo ? this.destroyPopups();
        // todo ? this._popup = [];
        // todo ? var oNumberFormatter = NumberFormat.getIntegerInstance({
        // groupingEnabled: true,
        // });

        // Draw actual curves
        series.forEach((serie, i) => {
          if (serie.points.length === 0) {
            return
          }
          // compute y values for censored data points
          serie.mPoints = serie.points.slice(0)
          // consoring events within this interval from each other will get a numeric label
          const iMinDistance = 10
          this.computeCensoredPoints(serie, minday, maxday, minprob, iMinDistance, xScale)

          // fix extremes by adding extra points
          // FIX LEFT-HAND SIDE: remove all points before minday.
          // Then, if first point does not has X=minday, add an extra point (0,firstpoint.Y)
          let j = 0
          while (j < serie.mPoints.length && serie.mPoints[j][0] < minday) {
            j += 1
          }
          serie.mPoints.splice(0, j)

          if (serie.mPoints.length > 0 && serie.mPoints[0][0] !== minday) {
            const newpoint = serie.mPoints[0].slice(0)
            newpoint[0] = minday
            serie.mPoints.splice(0, 0, newpoint)
          }

          // FIX RIGHT-HAND SIDE:
          // remove points (X,Y) with X > maxday || Y < minprob
          j = serie.mPoints.length - 1
          while (j > 0 && (serie.mPoints[j][0] > maxday || serie.mPoints[j][1] < minprob)) {
            j -= 1
          }
          serie.mPoints.splice(j + 1, serie.mPoints.length - j - 1)

          // Draw curves
          svg
            .append('g')
            .attr('class', 'curve')
            .append('path')
            .style('stroke', serie.mColor)
            .style('pointer-events', 'stroke')
            .attr('d', line(serie.mPoints))

          svg
            .append('g')
            .attr('class', 'shadow-curve')
            .append('path')
            .style('pointer-events', 'stroke')
            .style('opacity', 0)
            .style('stroke-width', 2)
            .attr('d', line(serie.mPoints))
            .attr('series', i)
            .on('mouseenter', () => {
              const seriesKey = d3.event.currentTarget.getAttribute('series')
              const gridElement = document.querySelector('g.grid')
              const gLeft = gridElement.getBoundingClientRect().left
              const cX = d3.event.clientX
              const cY = d3.event.clientY
              let mouseX = cX - gLeft + xpadding
              if (mouseX < xpadding) {
                mouseX = xpadding
              }
              const seriesData = series[seriesKey]
              const data = seriesData.mPoints
              const approximateXDomainValue = Math.round(xScale.invert(mouseX))

              const position = bisector(data, approximateXDomainValue)
              const larger = data[position]
              const smaller = data[position - 1]

              // use the x value derived from the mouse coordinate x position
              // also convert x value to the current x axis unit
              const currentUnit = this.getUnitInfo(this.kmUnit)
              const daysInUnit = currentUnit.avgDaysInUnit
              const xValUnit = currentUnit.unitLabel
              const decimalPlaces = currentUnit.digitsAfterDecimalPoint
              const xVal = (approximateXDomainValue / daysInUnit).toFixed(decimalPlaces)
              const finalValueSet: any = { x: xVal }
              // compare which data x value is closest to x value derived from mouse x position
              let finalElement

              finalElement = smaller || larger

              finalValueSet.y = finalElement[1]
              finalValueSet.underRisk = finalElement[3]

              this.tooltipPosition = {
                left: `${cX + 10}px`,
                top: `${cY + 10}px`,
                position: 'fixed',
              }

              this.showTooltip = true

              this.tooltipCategories = [
                {
                  bg: seriesData.mColor,
                  value: seriesData.name,
                },
              ]

              this.tooltipMeasures = [
                {
                  name: this.getText('MRI_PA_KAPLAN_TLTIP_PATIENTS_LABEL'),
                  value: seriesData.pcount.toLocaleString(),
                },
                {
                  name: `${this.getText('MRI_PA_KAPLAN_TLTIP_SURVIVAL_PERIOD_LABEL')} (${this.getText(xValUnit)}):`,
                  value: finalValueSet.x.toLocaleString(),
                },
                {
                  name: this.getText('MRI_PA_KAPLAN_TLTIP_PROBABILITY_LABEL'),
                  value: `${(finalValueSet.y * 100).toFixed(2)}%`,
                },
                {
                  name: this.getText('MRI_PA_KAPLAN_TLTIP_NUMBER_AT_RISK_LABEL'),
                  value: finalValueSet.underRisk.toLocaleString(),
                },
              ]
            })
            .on('mouseleave', () => {
              this.showTooltip = false
            })

          // Draw uncertainty intervcal
          if (
            this.showErrorLines &&
            (serie.errorlines || typeof serie.errorlines === 'undefined') &&
            serie.mPoints.length > 0 &&
            serie.mPoints[0].length > 2
          ) {
            const d3upperErrorLine = d3.svg
              .line()
              .x(d => xScale(d[0]))
              .y(d => (d.length > 2 ? yScale(Math.min(d[1] + d[2], 1.0)) : yScale(d[1])))
              .interpolate('step-after')

            const d3lowerErrorLine = d3.svg
              .line()
              .x(d => xScale(d[0]))
              .y(d => (d.length > 2 ? yScale(Math.max(d[1] - d[2], minprob)) : yScale(d[1])))
              .interpolate('step-after')

            svg
              .append('g')
              .attr('class', 'error-curve')
              .append('path')
              .style('stroke', serie.mColor)
              .attr('d', d3upperErrorLine(serie.mPoints))

            svg
              .append('g')
              .attr('class', 'error-curve')
              .append('path')
              .style('stroke', serie.mColor)
              .attr('d', d3lowerErrorLine(serie.mPoints))
          }

          // Add censoring events
          if (serie.mCensored.length > 0) {
            svg
              .append('g')
              .style('stroke', serie.mColor)
              .style('fill', 'none')
              .selectAll('line')
              .data(serie.mCensored)
              .enter()
              .append('line')
              .attr('x1', d => xScale(d[0]))
              .attr('y1', d => yScale(d[1] - 0.02))
              .attr('x2', d => xScale(d[0]))
              .attr('y2', d => yScale(d[1] + 0.01))

            // Cluster number Text for censoring ticks
            svg
              .append('g')
              .attr('class', 'censored-label')
              .selectAll('text')
              .data(serie.mCensored.filter(el => el[2] > 1))
              .enter()
              .append('text')
              .attr('x', d => xScale(d[0]))
              .attr('y', d => yScale(d[1]))
              .attr('dy', -6)
              .attr('text-anchor', 'start')
              .style('fill', serie.mColor)
              .text(d => d[2])
          }
          dataLines.push(serie)
        }, this)

        // Store Tick Values in States
        if (tickValues && tickValues.length > 0) {
          const tickData = []
          for (let i = 0; i < series.length; i += 1) {
            const data = series[i].mPoints
            const dataForSeries = []
            for (let ii = 0; ii < tickValues.length; ii += 1) {
              const tickValue = tickValues[ii]
              const position = bisector(data, tickValue)
              const larger = data[position]
              const smaller = data[position - 1]

              // use the x value derived from the mouse coordinate x position
              const finalValueSet: any = { x: tickValue }
              // compare which data x value is closest to x value derived from mouse x position
              let finalElement

              finalElement = smaller || larger

              finalValueSet.y = finalElement ? finalElement[1] : 'NoData'
              finalValueSet.underRisk = finalElement ? finalElement[3] : 'NoData'
              dataForSeries.push(
                finalElement ? `${Math.round(finalElement[1] * 10000) / 100}% (${finalElement[3]})` : 'NoData'
              )
            }
            tickData.push(dataForSeries)
          }
          this.setTicksData({ kmTicksData: tickData })
          const kmTickType = currentUnitInfo
          const kmTicks = tickValues.map(val => `${Math.round((val / currentUnitInfo.avgDaysInUnit) * 100) / 100}`)
          this.setTicks({ kmTickType, kmTicks })
        }
      }

      let newypos = 0
      let newxpos = 0
      let ypos
      let xpos
      let maxwidth = 0
      const maxlegendwidth = MAX_LEGEND_WIDTH

      d3.select(this.$el)
        .selectAll('.label-slot')
        .attr('transform', function todo2() {
          const length = d3.select(this).select('text').node().getComputedTextLength() + 30
          xpos = newxpos
          ypos = newypos
          if (maxlegendwidth < xpos + length) {
            xpos = 0
            newxpos = 0
            newypos += 20
            ypos = newypos
          }
          newxpos += length
          if (newxpos > maxwidth) {
            maxwidth = newxpos
          }
          return `translate(${xpos},${ypos})`
        })

      ypos = Y_PADDING + 20
      xpos =
        Math.floor(this.$refs.chart.getBoundingClientRect().right - this.$refs.chart.getBoundingClientRect().left) -
        X_PADDING -
        maxwidth
      // position legend as far right as possible within the total width
      d3.select(this.$el).select('.label-area').attr('transform', `translate(${xpos},${ypos})`)

      this.$refs.chart.appendChild(svg.node())
    },
    openKMStatisticsPopup() {
      const data = this.chartData
      if (data && data.data) {
        if (data.data.length > 5) {
          this.showKMStatisticsErrPopupForMoreCurves = true
        } else if (data.data.length === 1) {
          this.showKMStatisticsErrPopupForOneCurve = true
        } else {
          this.allCurves = {}
          this.showKMStatisticsPopup = true
        }
      }
    },
    openKMLogRankHelpPopOver() {
      this.kmLogRankHelpPopoverPosition.top = `${this.$refs.kmLogRankHelp.getBoundingClientRect().bottom + 16}px`
      this.showKMLogRankHelpPopOver = true
    },
    closeKMStatisticsPopup() {
      this.showKMStatisticsPopup = false
    },
    closeKMStatisticsErrPopupForMoreCurves() {
      this.showKMStatisticsErrPopupForMoreCurves = false
    },
    closeKMStatisticsErrPopupForOneCurve() {
      this.showKMStatisticsErrPopupForOneCurve = false
    },
    formatPValue(val) {
      return `${this.getText('MRI_PA_KAPLAN_LOG_RANK_P')}${val}`
    },
    getGlobalDoF() {
      const data = this.chartData
      return data.kaplanMeierStatistics.overallResult.dof
    },
  },
  components: {
    ChartPopover,
    KMStartEventMenu,
    KMEndEventMenu,
    KMInteractionList,
    KMUnitMenu,
    chartErrorMessage,
    DialogBox,
    appButton,
    messageBox,
    appCheckbox,
    kmStatisticsTable,
    errorMessageBox,
    kmLegend,
    appLabel,
  },
}
</script>
