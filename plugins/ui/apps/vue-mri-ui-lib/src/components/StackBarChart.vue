<template>
  <div class="stackbar-wrapper">
    <div class="stackbar-chart-area">
      <div class="stackbar-container" id="stacked-chart"></div>
    </div>
    <StackBarChartLegend
      v-if="legendTraces.length > 1"
      :traces="legendTraces"
      :colorway="legendColorway"
      :bar-opacity="legendBarOpacity"
      :show-distribution-curve="showDistributionCurveLegend"
      :area-fill="legendAreaFill"
      :fill-alpha="legendFillAlpha"
    />
  </div>
</template>

<script lang="ts">
import { mapActions, mapGetters } from 'vuex'
import axios from 'axios'
import { useNotificationStore } from '../stores/notifications'
import Plotly from '../lib/CustomPlotly'
import Constants from '../utils/Constants'
import processCSV from '../utils/ProcessCSV'
import { generateDownloadFileName } from '../utils/generateDownloadFileName'
import { postProcessBarChartData } from './helpers/postProcessBarChartData'
import StackBarChartLegend from './StackBarChartLegend.vue'
import { applyById, getEffectiveBarChartMode, OVERLAY_BAR_OPACITY, KDE_FILL_ALPHA } from './StackBarModes/modes'

const DEFAULT_BAR_GAP = 0.3

export default {
  name: 'stackBarChart',
  components: {
    StackBarChartLegend,
  },
  setup() {
    return {
      notificationStore: useNotificationStore(),
    }
  },
  props: ['busyEv', 'shouldRerenderChart', 'colorAxisIndex'],
  data() {
    return {
      chartData: {} as { traces?: any[]; axisType?: string; categories?: any[]; measures?: any[]; data?: any[] },
      errorMessage: '',
      sbChartStyle: {},
      debounceId: 0,
      layout: { ...Constants.PlotlyConsts.layout, showlegend: false },
      resizeObserver: null,
      stackBarChart: null as HTMLElement | null,
      requestId: 0,
      requestCancel: null as (() => void) | null,
      isUnmounted: false,
    }
  },
  created() {
    this.layout = { ...Constants.PlotlyConsts.layout, showlegend: false }
    this.config = {
      ...Constants.PlotlyConsts.config,
      displayModeBar: true,
      modeBarButtons: [
        [
          {
            name: 'resetScaleCustom',
            title: 'Reset view',
            icon: {
              width: 857.1,
              height: 1000,
              path: 'm857 350q0-87-34-166t-91-137-137-92-166-34q-96 0-183 41t-147 114q-4 6-4 13t5 11l76 77q6 5 14 5 9-1 13-7 41-53 100-82t126-29q58 0 110 23t92 61 61 91 22 111-22 111-61 91-92 61-110 23q-55 0-105-20t-90-57l77-77q17-16 8-38-10-23-33-23h-250q-15 0-25 11t-11 25v250q0 24 22 33 22 10 39-8l72-72q60 57 137 88t159 31q87 0 166-34t137-92 91-137 34-166z',
              transform: 'matrix(1 0 0 -1 0 850)',
            },

            click: function (gd) {
              this.clearSelectionState({ plotElement: gd, resetAxes: true })
            }.bind(this),
          },
        ],
      ],
    }
    this.setupAxes()
    this.setFireRequest()
  },
  mounted() {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.stackBarChart && this.chartData && Object.keys(this.chartData).length !== 0) {
        clearTimeout(this.debounceId)
        this.debounceId = setTimeout(() => {
          Plotly.Plots.resize(this.stackBarChart)
        }, 100)
      }
    })

    if (this.$el) {
      this.resizeObserver.observe(this.$el)
    }
  },
  watch: {
    'sortProperty.props.value': function sorter(newVal) {
      this.chartData = this.processResponse(this.chartData, newVal)
      this.renderChart()
    },
    getChartSize() {
      const pdfSize = this.getChartSize
      const sbChartStyle = {
        width: null,
        height: null,
      }
      if (pdfSize.width) {
        sbChartStyle.width = `${pdfSize.width}px`
      }

      if (pdfSize.height) {
        sbChartStyle.height = `${pdfSize.height}px`
      }

      this.sbChartStyle = sbChartStyle

      this.$nextTick(() => {
        this.renderChart()
        if (pdfSize.width || pdfSize.height) {
          /*
          For Stack Bar Chart, we do not render ourself, so we must
          set timeout...
          */
          setTimeout(() => {
            this.setPdfChartReady(true)
          }, 2000)
        } else {
          this.setPdfChartReady(false)
        }
      })
    },
    getCsvFireDownload() {
      this.downloadCSV({ ...this.getBookmarksData })
        .then(response => processCSV(response, this.csvFileName))
        .catch(() => {
          // do something
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

      // Check if the chart has been reset
      const chartSortProperty = this.getChartProperty(Constants.MRIChartProperties.Sort)
      if (chartSortProperty?.props?.active === false) {
        this.setupAxes()
      }

      const bookmark = this.getBookmarksData
      if (Object.keys(bookmark).length !== 0 && bookmark) {
        this.startRequest(
          ({ cancelToken }) =>
            this.fireQuery({
              url: '/analytics-svc/api/services/population/json/barchart',
              params: { mriquery: JSON.stringify(this.getBookmarksData), datasetId: this.getBookmarksData.datasetId },
              cancelToken,
            }),
          response => {
            const chartData = postProcessBarChartData(response)
            this.chartData = this.processResponse(chartData)
            this.setCurrentPatientCount({
              currentPatientCount: this.chartData.totalPatientCount,
            })
            if (this.stackBarChart) {
              Plotly.purge(this.stackBarChart)
            }
            this.setupPlotly()

            if (this.chartData.hasOwnProperty('noDataReason')) {
              this.setCurrentPatientCount({
                currentPatientCount: '--',
              })

              if (this.chartData.noDataReason !== this.getText('MRI_PA_NO_MATCHING_PATIENTS')) {
                this.notificationStore.setAlertMessage({
                  message: this.chartData.noDataReason,
                })
              }
              return
            }

            this.renderChart()

            // Emit x-axis category counts for default color axis selection.
            // Only categories that resolve to a real allAxes slot are eligible: the backend puts a
            // synthetic 'dummy_category' on the x axis whenever the query has no group-by (i.e. no
            // x axis is selected), and its single value would otherwise satisfy the low-cardinality
            // default rule and nominate a slot that holds no attribute at all.
            const allAxesForEmit = this.getAllAxes || []
            const xAxisCategoryCounts = (this.chartData.categories || [])
              .filter(c => c.axis === Constants.AxisId.X && c.id !== 'dummy_category')
              .map(cat => ({
                axisIndex: allAxesForEmit.findIndex(a => a?.props?.attributeId && a.props.attributeId === cat.id),
                count: new Set(this.chartData.data.map(d => d[cat.id])).size,
              }))
              .filter(entry => entry.axisIndex >= 0)
            this.$emit('chartDataReady', xAxisCategoryCounts)
          },
          error => {
            const { response, code } = error

            let noDataReason = this.getText('MRI_PA_CHART_NO_DATA_DEFAULT_MESSAGE')

            if (code === 'ECONNABORTED') {
              // Handle timeout explicitly
              this.handleNoDataResponse(noDataReason)
              return
            }

            if (response) {
              // For all handled errors from backend
              if (response.status === 500) {
                noDataReason = response.data.errorMessage || response.data.err
                if (response.data.errorType === 'MRILoggedError') {
                  noDataReason = this.getText('MRI_DB_LOGGED_MESSAGE', response.data.logId)
                }
              }

              this.handleNoDataResponse(noDataReason)
            }
          }
        )
      }
    },
    shouldRerenderChart() {
      if (this.shouldRerenderChart) {
        if (this.stackBarChart) {
          Plotly.purge(this.stackBarChart)
        }
        this.setupPlotly()
        this.renderChart()
      }
    },
    colorAxisIndex() {
      this.renderChart()
    },
    getBarChartType() {
      // Plotly.react does not reliably reset trace-level (marker.opacity, width, offset) or
      // layout-level (bargap, barmode, xaxis.type/range/autorange, xaxis2, yaxis.rangemode)
      // properties set by mode apply() functions. Tear down and rebuild on every chart type change
      // so each chart starts from a clean Plotly state. setupPlotly already renders via newPlot
      // using the canonical bar traces in chartData.traces, so a follow-up renderChart would
      // race Plotly.react against newPlot's internal staging (manifests as the xaxis2/scatter
      // overlays being dropped on the first overlay-curve toggle after a mode dance).
      if (this.stackBarChart) {
        Plotly.purge(this.stackBarChart)
      }
      this.setupPlotly()
    },
    getShowDistributionOverlay() {
      // Toggling the overlay adds/removes xaxis2 and scatter traces; Plotly.react does not
      // pick up newly added layout axes reliably, so rebuild for the same reason as above.
      if (this.stackBarChart) {
        Plotly.purge(this.stackBarChart)
      }
      this.setupPlotly()
    },
  },
  computed: {
    ...mapGetters([
      'dataToTraces',
      'getMriFrontendConfig',
      'getChartSize',
      'getCsvFireDownload',
      'getActiveChart',
      'getActiveBookmark',
      'getText',
      'getFireRequest',
      'isFireRequestHeld',
      'getHasAssignedConfig',
      'getBookmarksData',
      'getChartableFilterCardByInstanceId',
      'sortProperty',
      'processResponse',
      'getChartProperty',
      'getAllAxes',
      'getBarChartType',
      'getShowDistributionOverlay',
    ]),
    csvFileName() {
      return generateDownloadFileName(this.getActiveBookmark?.bookmarkname, this.getActiveChart, 'csv')
    },
    legendTraces() {
      if (this.chartData?.colorLegend?.length > 0) {
        return this.chartData.colorLegend.map(item => ({
          name: item.name,
          meta: { fullName: item.name },
        }))
      }
      return (this.chartData?.traces || []).filter(t => t.showlegend !== false)
    },
    yAxisTitle() {
      if (getEffectiveBarChartMode(this.getBarChartType, this.getMriFrontendConfig) === 'distribution') {
        // KDP requires at least two bins to compute a kernel density curve. When there
        // is only a single bin the mode falls back to rendering count bars, and the axis
        // title falls back to the measure name.
        const firstTrace = this.chartData?.traces?.[0]
        const hasInsufficientBins = !!firstTrace && (firstTrace.y?.length || 0) <= 1
        if (!hasInsufficientBins) return this.getText('MRI_PA_CHART_YAXIS_DENSITY')
      }
      return this.chartData?.measures?.[0]?.name || ''
    },
    legendColorway() {
      if (this.chartData?.colorLegend?.length > 0) {
        return this.chartData.colorLegend.map(item => item.color)
      }
      return Object.values(Constants.ChartColorway)
    },
    legendBarOpacity() {
      // Overlapping histogram draws translucent bars
      const effectiveMode = getEffectiveBarChartMode(this.getBarChartType, this.getMriFrontendConfig)
      return effectiveMode === 'overlay' ? OVERLAY_BAR_OPACITY : 1
    },
    showDistributionCurveLegend() {
      const effectiveMode = getEffectiveBarChartMode(this.getBarChartType, this.getMriFrontendConfig)
      const supportsDistributionCurve = effectiveMode === 'overlay' || effectiveMode === 'partialOverlaySolid'
      if (!supportsDistributionCurve || !this.getShowDistributionOverlay) return false
      const firstTrace = this.chartData?.traces?.[0]
      return (firstTrace?.y?.length || 0) > 1
    },
    legendAreaFill() {
      // for kdp, fill color background with the solid curve color as the border.
      const effectiveMode = getEffectiveBarChartMode(this.getBarChartType, this.getMriFrontendConfig)
      if (effectiveMode !== 'distribution') return false
      const firstTrace = this.chartData?.traces?.[0]
      return (firstTrace?.y?.length || 0) > 1
    },
    legendFillAlpha() {
      return KDE_FILL_ALPHA
    },
  },
  beforeUnmount() {
    this.isUnmounted = true
    this.cancelRequest()
    this.$emit('busyEv', false)

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.stackBarChart) {
      Plotly.purge(this.stackBarChart)
      this.stackBarChart = null
    }
  },
  methods: {
    ...mapActions([
      'setAxisValue',
      'setChartPropertyValue',
      'fireQuery',
      'disableAllAxesandProperties',
      'setChartSelection',
      'setPdfChartReady',
      'downloadCSV',
      'setCurrentPatientCount',
      'setFireRequest',
      'completeDownloadCSV',
      'setPlotlyElement',
    ]),
    /**
     * Returns true when x-axis labels should be truncated.
     * Heuristic: estimate available chars per slot based on plot width,
     * and compare against the average label length.
     * Falls back to always-truncate when width is unknown.
     */
    shouldTruncateXAxisLabels(plotWidth: number, categoryCount: number, avgLabelLength: number): boolean {
      if (!plotWidth || !categoryCount) return true
      const charsPerSlot = plotWidth / categoryCount / 7
      return avgLabelLength > charsPerSlot * 0.9
    },
    /**
     * Builds the xaxis tick overrides to apply to a Plotly layout object.
     * Chooses full or truncated ticktext based on available space heuristic.
     */
    buildXAxisTicks() {
      if (!this.chartData || !this.chartData.tickvals) return null
      const tickvals: string[] = this.chartData.tickvals
      const ticktextFull: string[] = this.chartData.ticktextFull || tickvals
      const ticktext: string[] = this.chartData.ticktext || tickvals
      const categoryCount = tickvals.length
      // Measure plot width from DOM element if available
      const plotWidth = this.stackBarChart ? this.stackBarChart.clientWidth : 0
      // Compute average label length from full labels
      const avgLabelLength = ticktextFull.reduce((sum, t) => sum + t.length, 0) / (ticktextFull.length || 1)
      const useTruncated = this.shouldTruncateXAxisLabels(plotWidth, categoryCount, avgLabelLength)
      return {
        tickvals,
        ticktext: useTruncated ? ticktext : ticktextFull,
        tickangle: useTruncated ? 'auto' : 0,
      }
    },
    buildPlotlyLayout(resetAxes = false) {
      const layout = JSON.parse(JSON.stringify(Constants.PlotlyConsts.layout))
      layout.showlegend = false
      layout.xaxis.type = this.chartData.axisType
      layout.yaxis.title = { text: this.yAxisTitle }

      if (this.chartData?.axisType === 'category' && this.chartData?.tickvals && this.chartData?.ticktext) {
        const labelAlias = this.chartData.tickvals.reduce((acc, value, index) => {
          const original = String(value)
          const truncated = String(this.chartData.ticktext[index] ?? value)
          if (original !== truncated) {
            acc[original] = truncated
          }
          return acc
        }, {})

        if (Object.keys(labelAlias).length > 0) {
          layout.xaxis.labelalias = labelAlias
        }
      }

      if (resetAxes) {
        layout.xaxis.autorange = true
        layout.yaxis.autorange = true
      }
      return layout
    },
    hasTraceSelectedPoints() {
      if (!this.chartData?.traces) {
        return false
      }

      return this.chartData.traces.some(trace => {
        const selectedpoints = trace?.selectedpoints
        return Array.isArray(selectedpoints) && selectedpoints.length > 0
      })
    },
    clearSelectionState({ plotElement = this.stackBarChart, resetAxes = false } = {}) {
      this.setChartSelection({ selection: [] })

      const targetElement = plotElement || this.stackBarChart
      if (!targetElement) {
        return
      }

      const hasSelection = this.hasTraceSelectedPoints()
      const hasSelectionState = this.chartData?.traces?.some(trace => Array.isArray(trace?.selectedpoints))
      if (!hasSelection && !hasSelectionState) {
        if (resetAxes) {
          Plotly.relayout(targetElement, {
            'xaxis.autorange': true,
            'yaxis.autorange': true,
          })
        }
        return
      }

      if (this.chartData?.traces) {
        const clearedSelectedPoints = this.chartData.traces.map(() => null)
        this.chartData = this.dataToTraces(this.chartData, clearedSelectedPoints, 0)
        this.applyXAxisColoring()
      }

      this.reactWithCurrentMode(targetElement, { resetAxes })
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
    handleNoDataResponse(noDataReason) {
      if (this.stackBarChart) {
        Plotly.purge(this.stackBarChart)
      }
      this.chartData = {
        ...this.chartData,
        data: [],
        measures: [],
        categories: [],
        totalPatientCount: 0,
        noDataReason,
      }
      this.setCurrentPatientCount({ currentPatientCount: '--' })
      this.setupPlotly()
    },
    setupAxes() {
      this.disableAllAxesandProperties()
      this.setChartPropertyValue({
        id: Constants.MRIChartProperties.Sort,
        props: {
          layoutLeft: '',
          layoutTop: '',
          layoutBottom: '',
          icon: '',
          iconFamily: 'app-icons',
          active: true,
        },
      })
      this.setAxisValue({
        id: Constants.MRIChartDimensions.StackAttribute,
        props: {
          layoutLeft: '',
          layoutTop: '',
          layoutBottom: '',
          icon: '',
          iconFamily: 'app-icons',
          isCategory: true,
          isMeasure: false,
          active: true,
        },
      })
      this.setAxisValue({
        id: Constants.MRIChartDimensions.Y,
        props: {
          layoutLeft: '',
          layoutTop: '',
          layoutBottom: '',
          icon: '',
          iconFamily: 'app-MRI-icons',
          isCategory: false,
          isMeasure: true,
          active: true,
        },
      })
      for (let i = 0; i <= Constants.MRIChartDimensions.X2; i += 1) {
        this.setAxisValue({
          id: i,
          props: {
            layoutLeft: '',
            layoutTop: '',
            layoutBottom: '',
            icon: { 0: '', 1: '', 2: '' }[i],
            iconFamily: 'app-MRI-icons',
            isCategory: true,
            isMeasure: false,
            active: true,
          },
        })
      }
    },
    applyChartType(traces, layout) {
      if (!traces || !traces.length) return { traces, layout }
      const colorway = Object.values(Constants.ChartColorway)
      const effectiveMode = getEffectiveBarChartMode(this.getBarChartType, this.getMriFrontendConfig)
      const modeApply = applyById[effectiveMode] || applyById.stack
      // Each mode apply() is pure: it returns new trace objects/arrays without mutating its inputs.
      // This removes the need to JSON-clone this.chartData.traces before calling apply().
      return modeApply(traces, layout, {
        showDistributionOverlay: this.getShowDistributionOverlay,
        barGap: DEFAULT_BAR_GAP,
        colorway,
      })
    },
    reactWithCurrentMode(targetElement = this.stackBarChart, { resetAxes = false } = {}) {
      if (!targetElement || !this.chartData?.traces) return
      const layout = this.buildPlotlyLayout(resetAxes)
      // applyChartType returns new traces/layout objects — no clone needed.
      const { traces: tracesForPlotly, layout: finalLayout } = this.applyChartType(this.chartData.traces, layout)
      Plotly.react(targetElement, tracesForPlotly, finalLayout, this.config)
    },
    applyXAxisColoring() {
      // Apply x-axis category coloring if a color axis is selected.
      // Called after every dataToTraces() invocation so selection/deselection
      // does not wipe the per-bar marker colors set by XAxisColorButton.
      if (this.colorAxisIndex != null && this.chartData?.traces) {
        const colorValues = Object.values(Constants.ChartColorway)
        const xAxes = this.chartData.categories?.filter(c => c.axis === Constants.AxisId.X) || []
        // Resolve raw allAxes slot index to position within filtered xAxes/values[]
        const allAxesForColor = this.getAllAxes
        const selectedAxisAttrId = allAxesForColor?.[this.colorAxisIndex]?.props?.attributeId
        const valuesIndex = selectedAxisAttrId != null ? xAxes.findIndex(cat => cat.id === selectedAxisAttrId) : -1
        if (valuesIndex >= 0 && valuesIndex < xAxes.length) {
          // Collect unique x-axis values across all traces in stable order
          const uniqueVals: string[] = []
          const seen = new Set<string>()
          this.chartData.traces.forEach(trace => {
            trace.customdata?.forEach(cd => {
              const val = String(cd.values?.[valuesIndex] ?? '')
              if (val && !seen.has(val)) {
                seen.add(val)
                uniqueVals.push(val)
              }
            })
          })
          // Map each unique value to a ChartColorway color (cycling)
          const valColorMap: Record<string, string> = {}
          uniqueVals.forEach((val, i) => {
            valColorMap[val] = colorValues[i % colorValues.length]
          })
          // Assign per-bar marker colors on each trace
          this.chartData.traces.forEach(trace => {
            const colors =
              trace.customdata?.map(cd => valColorMap[String(cd.values?.[valuesIndex] ?? '')] || colorValues[0]) || []
            trace.marker = { ...trace.marker, color: colors }
          })
          // Build color legend for the legend component
          this.chartData.colorLegend = uniqueVals.map(val => ({ name: val, color: valColorMap[val] }))
        }
      } else {
        // Clear color-by state when no color axis is selected
        delete this.chartData.colorLegend
      }
    },
    renderChart() {
      if (this.chartData && Object.keys(this.chartData).length !== 0) {
        const data = JSON.parse(JSON.stringify(this.chartData))
        data.categories.forEach(category => {
          if (category.id !== 'dummy_category') {
            const filterCardPath = category.id.split('.')
            filterCardPath.pop()
            filterCardPath.pop()
            if (filterCardPath.length <= 1) {
              const defaultTitle = this.getText('MRI_PA_FILTERCARD_TITLE_BASIC_DATA')
              // Only add prefix if it's not already there to prevent duplicate prefixes
              if (!category.name || !category.name.startsWith(defaultTitle + ' - ')) {
                category.name = `${defaultTitle} - ${category.name}`
              }
            } else {
              const filterCard = this.getChartableFilterCardByInstanceId(filterCardPath.join('.'))
              // Guard: a category can reference a filter card that is no longer chartable
              // (e.g. after an inconsistent bookmark load). Skip the prefix rather than
              // dereferencing undefined and crashing the whole chart render.
              const filterCardName = filterCard?.name
              if (filterCardName && (!category.name || !category.name.startsWith(filterCardName + ' - '))) {
                category.name = category.name ? `${filterCardName} - ${category.name}` : filterCardName
              }
            }
          }
        })

        this.chartData = this.dataToTraces(data)

        this.applyXAxisColoring()

        this.reactWithCurrentMode()

        // Resize chart after DOM updates to account for legend space
        this.$nextTick(() => {
          Plotly.Plots.resize(this.stackBarChart)
        })
      }
    },
    setupPlotly() {
      this.stackBarChart = this.$el.querySelector('.stackbar-container')

      const initialLayout = this.buildPlotlyLayout()
      // applyChartType returns new traces/layout — no clone needed.
      const { traces: initialTracesForPlotly, layout: finalInitialLayout } = this.applyChartType(
        this.chartData.traces || [],
        initialLayout
      )
      Plotly.newPlot(this.stackBarChart, initialTracesForPlotly, finalInitialLayout, this.config)

      // Resize chart after DOM updates to account for legend space
      this.$nextTick(() => {
        Plotly.Plots.resize(this.stackBarChart)
      })

      const selectionUpdate = eventData => {
        // Guard: no points in payload → treat as deselect.
        // Plotly sets selectedpoints on the cloned traces it received (not on
        // this.chartData.traces), so we must source selection from the event
        // payload rather than reading trace.selectedpoints from the canonical copy.
        if (!eventData?.points?.length) {
          this.clearSelectionState()
          return
        }

        const selectedData = []
        const pushPoint = (dataId, dataValue) => {
          selectedData.push({ id: dataId, value: dataValue })
        }

        eventData.points.forEach(point => {
          // Skip generated non-bar traces (KDP scatter, distribution overlay): their
          // pointIndex doesn't map to canonical bar categories.
          if (point.data?.type !== 'bar') return
          const traceIndex = point.curveNumber
          const pointIndex = point.pointIndex
          const trace = this.chartData.traces[traceIndex]
          if (!trace) return

          const pointCustomData = trace.customdata[pointIndex]
          if (!pointCustomData) return
          const xAxes = pointCustomData.x
          const yAxis = pointCustomData.y

          xAxes.forEach((xAxis, axisIndex) => {
            // Use the canonical plotted value from trace.x (full, untruncated)
            let canonicalValue: string
            if (Array.isArray(trace.x[0])) {
              // multicategory display labels may be truncated; prefer canonical values from customdata
              canonicalValue = String(pointCustomData.values?.[axisIndex] ?? trace.x[axisIndex][pointIndex])
            } else {
              // single axis
              canonicalValue = String(pointCustomData.values?.[axisIndex] ?? trace.x[pointIndex])
            }
            pushPoint(xAxis.id, canonicalValue)
          })
          if (yAxis.length > 0) {
            pushPoint(yAxis[0].id, trace.meta ? trace.meta.fullName : trace.name)
          }
        })

        this.setChartSelection({ selection: selectedData })

        // Mirror Plotly's selection onto the canonical traces so subsequent renders
        // (mode switch, color-axis change, deselect) preserve it. Do NOT call
        // dataToTraces/reactWithCurrentMode here: Plotly has already drawn the
        // active selection visual, and reactWithCurrentMode clones the traces
        // before calling Plotly.react, which Plotly treats as a data swap and
        // tears down the in-flight selection highlight.
        // applyXAxisColoring() has already run on the canonical traces during
        // the last renderChart() call, so per-bar colors are already in place.
        this.chartData.traces.forEach((trace, i) => {
          trace.selectedpoints = eventData.points
            .filter(p => p.curveNumber === i && p.data?.type === 'bar')
            .map(p => p.pointIndex)
        })
      }

      const deselectionUpdate = () => {
        this.clearSelectionState()
      }

      this.stackBarChart.on('plotly_selected', selectionUpdate)
      this.stackBarChart.on('plotly_deselect', deselectionUpdate)
      this.setPlotlyElement({ element: this.stackBarChart })
    },
  },
}
</script>

<style scoped>
.stackbar-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 8px;
}
.stackbar-chart-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
}
.stackbar-container {
  flex: 1;
  min-width: 0;
  height: 100%;
}
</style>
