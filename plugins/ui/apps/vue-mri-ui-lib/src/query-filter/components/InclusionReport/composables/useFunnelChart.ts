import { ref, computed, watch, type Ref } from 'vue'
import plotly from '@/lib/CustomPlotly'
import {
  COLORS_ARRAY,
  FUNNEL_THRESHOLDS,
  FUNNEL_LEGEND_LABELS,
  FUNNEL_FONT_FAMILY,
  FUNNEL_FONT_SIZE,
  FUNNEL_LABEL_MAX_LINES,
  FUNNEL_LABEL_MAX_WIDTH,
  FUNNEL_HOVER_MAX_WIDTH,
  FUNNEL_HOVER_FONT_SIZE,
} from '../constants'
import type { InclusionReportResponse, RuleFilterCardDetails } from '@/query-filter/types/InclusionReportTypes'
import { getRuleDisplayName } from '@/utils/filterCardUtils'
import { wrapTextByWidth, wrapTextToLineLimit } from '@/utils/ExportUtils'

export interface FunnelChartData {
  /** One y axis label per funnel point, each distinct from the rest - see `labelPoints` */
  labels: string[]
  values: number[]
  hoverTexts: string[]
  /** Funnel point index, keyed by the y axis label plotly draws for it */
  labelPoints: Record<string, number>
}

/** The funnel is plotted first, with the legend placeholder traces after it. */
const FUNNEL_TRACE_INDEX = 0

const ZERO_WIDTH_SPACE = '\u200B'

/** The graph div plotly hands back: an element that also carries plotly's event emitter API. */
type PlotlyGraphDiv = HTMLElement & {
  on?: (event: string, handler: () => void) => void
  removeAllListeners?: (event: string) => void
}

/**
 * Text is measured off-screen with the font plotly renders it in - the chart font for the y axis
 * labels, plotly's own hover font for the tooltips. Environments without a canvas (jsdom) fall
 * back to an average glyph width, which is close enough to keep wrapping sane in tests.
 */
const APPROX_GLYPH_WIDTH_RATIO = 0.55
const approxMeasureCtx = (fontSize: number) =>
  ({
    measureText: (s: string) => ({ width: s.length * fontSize * APPROX_GLYPH_WIDTH_RATIO }),
  }) as unknown as CanvasRenderingContext2D

const measureCtxByFont = new Map<string, CanvasRenderingContext2D>()
const getMeasureCtx = (fontSize: number, fontFamily: string): CanvasRenderingContext2D => {
  const font = `${fontSize}px ${fontFamily}`
  const cached = measureCtxByFont.get(font)
  if (cached) return cached

  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = document.createElement('canvas').getContext('2d')
  } catch {
    ctx = null
  }
  // Test DOMs hand back a context stub with no measureText, so check the method, not the object.
  const measureCtx = typeof ctx?.measureText === 'function' ? ctx : approxMeasureCtx(fontSize)
  measureCtx.font = font
  measureCtxByFont.set(font, measureCtx)
  return measureCtx
}

/**
 * Plotly's hover only covers the plot area, so a y axis label triggers the hover for its own funnel
 * layer by hand - the same tooltip, holding the full rule name, that the layer itself shows, which
 * is how a label the wrapping cut short gives up its full text. Plotly draws each label as an
 * unclassed <text> inside a `g.ytick` and keeps the string it was handed - <br>s and all - in
 * `data-unformatted`, so that is what keys the lookup. Pointer events need re-enabling per label
 * because `.main-svg` switches them off for everything outside the drag layer.
 */
const attachLabelHovers = (graphDiv: PlotlyGraphDiv, pointsByLabel: Record<string, number>) => {
  graphDiv.querySelectorAll<SVGTextElement>('g.ytick > text').forEach(tick => {
    const pointNumber = pointsByLabel[tick.getAttribute('data-unformatted') ?? '']
    // Assigned rather than added as listeners: plotly reuses the tick elements across redraws,
    // so this has to overwrite what a previous render left behind instead of stacking on it.
    if (pointNumber === undefined) {
      tick.onmouseover = null
      tick.onmouseout = null
      return
    }

    tick.style.pointerEvents = 'all'
    tick.onmouseover = () => plotly.Fx.hover(graphDiv, [{ curveNumber: FUNNEL_TRACE_INDEX, pointNumber }])
    tick.onmouseout = () => plotly.Fx.unhover(graphDiv)
  })
}

export interface AttritionStat {
  id: number
  name: string
  isExclude: boolean
  countSatisfying: number
  percentSatisfying: string
  pctDiff: string
}

export function useFunnelChart(
  inclusionReportResponse: Ref<InclusionReportResponse | null>,
  draggableAttritionStats: Ref<AttritionStat[]>,
  getText: (key: string, param?: string | string[]) => string,
  filterCardDetails?: Ref<RuleFilterCardDetails[] | undefined>
) {
  const funnelChartRef = ref<HTMLElement | null>(null)

  /** Basic Data rules are labelled by their attribute name rather than the "Basic Data" card name */
  const ruleLabel = (stat: AttritionStat) => getRuleDisplayName(stat.name, filterCardDetails?.value?.[stat.id])

  const funnelChartData = computed<FunnelChartData | null>(() => {
    if (!inclusionReportResponse.value || draggableAttritionStats.value.length === 0) return null

    const summary = inclusionReportResponse.value.summary
    const stats = draggableAttritionStats.value

    // Build funnel data with base count as first level
    const labels = ['Total']
    const values = [summary.baseCount]
    const hoverTexts = ['Total: ' + summary.baseCount.toLocaleString()]

    // Add each inclusion rule with calculated statistics
    stats.forEach(stat => {
      const prefix = stat.isExclude ? '- ' : '+ '
      const fullName = ruleLabel(stat)
      const fullLabel = `${prefix}${fullName}`
      // Plotly renders <br> as a line break in tick labels; without it a long rule name is
      // drawn as one line that keeps widening the left margin. The full name stays in the hover.
      const lines = wrapTextToLineLimit(
        getMeasureCtx(FUNNEL_FONT_SIZE, FUNNEL_FONT_FAMILY),
        fullLabel,
        FUNNEL_LABEL_MAX_WIDTH,
        FUNNEL_LABEL_MAX_LINES
      )
      labels.push(lines.join('<br>'))
      values.push(stat.countSatisfying)
      // Wrapped so the tooltip stays narrow enough to sit beside its bar like every other row's.
      const hoverName = wrapTextByWidth(
        getMeasureCtx(FUNNEL_HOVER_FONT_SIZE, FUNNEL_FONT_FAMILY),
        fullLabel,
        FUNNEL_HOVER_MAX_WIDTH
      ).join('<br>')
      hoverTexts.push(
        `${hoverName}<br>Count: ${stat.countSatisfying.toLocaleString()}<br>Percent: ${stat.percentSatisfying}`
      )
    })

    // Every label is hoverable, so each one maps to the funnel point it was drawn for.
    const labelPoints: Record<string, number> = {}
    const drawnLabels = new Set<string>()
    const uniqueLabels = labels.map((label, pointNumber) => {
      let unique = label
      while (drawnLabels.has(unique)) unique += ZERO_WIDTH_SPACE
      drawnLabels.add(unique)
      labelPoints[unique] = pointNumber
      return unique
    })

    return { labels: uniqueLabels, values, hoverTexts, labelPoints }
  })

  const renderFunnelChart = () => {
    if (!funnelChartRef.value || !funnelChartData.value) return

    // Compute ratios relative to previous layer
    const ratios = funnelChartData.value.values.map((v, i) => (i === 0 ? 1 : v / funnelChartData.value!.values[i - 1]))

    // Map each ratio to a color based on thresholds
    const layerColors = ratios.map(ratio => {
      for (let i = 0; i < FUNNEL_THRESHOLDS.length; i++) {
        if (ratio <= FUNNEL_THRESHOLDS[i]) return COLORS_ARRAY[i]
      }
      return COLORS_ARRAY[COLORS_ARRAY.length - 1]
    })

    const trace = {
      type: 'funnel',
      y: funnelChartData.value.labels,
      x: funnelChartData.value.values,
      text: funnelChartData.value.hoverTexts,
      hoverinfo: 'text',
      textposition: 'inside',
      texttemplate: 'n: %{x:,} (%{percentInitial:.2%})',
      constraintext: 'outside',
      textinfo: 'value+percent initial',
      marker: {
        color: layerColors,
        line: {
          color: '#949494',
          width: 1,
        },
      },
      hoverlabel: {
        bgcolor: '#f9f9f9', // css var doesn't work here
        // Plotly's hover labels default to Arial rather than the layout font, so they are told
        // to use the chart font too - which is also the font the hover text is wrapped against.
        font: {
          size: FUNNEL_HOVER_FONT_SIZE,
          family: FUNNEL_FONT_FAMILY,
        },
      },
      showlegend: false, // Hide legend for main trace
      connector: {
        fillcolor: 'transparent',
        line: {
          color: '#949494',
          width: 1,
        },
        visible: true,
      },
    }

    // Create dummy traces for legend - only for colors actually used
    const usedColors = new Set(layerColors)
    const legendTraces = COLORS_ARRAY.map((color, index) => ({
      type: 'scatter',
      x: [null],
      y: [null],
      mode: 'markers',
      // These placeholders hold no hoverable data. Keeping them out of plotly's hover search also
      // stops compare mode from rotating the tooltip 60deg to stack one label per searchable trace.
      hoverinfo: 'skip',
      marker: {
        size: 10,
        color: color,
      },
      name: FUNNEL_LEGEND_LABELS[index],
      showlegend: true,
    })).filter((_trace, index) => usedColors.has(COLORS_ARRAY[index]))

    const layout = {
      // Compare mode drops plotly's "is the cursor inside the bar?" test, so the whole row is
      // hoverable .
      hovermode: 'y',
      font: {
        size: FUNNEL_FONT_SIZE,
        family: FUNNEL_FONT_FAMILY,
      },
      height: 800,
      yaxis: {
        automargin: true,
        autorange: 'reversed',
        showgrid: false,
        zeroline: false,
      },
      xaxis: {
        automargin: true,
        showgrid: false,
        showline: false,
        showticklabels: false,
        zeroline: false,
      },
      showlegend: true,
      legend: {
        orientation: 'v',
        x: 1.02,
        y: 1,
        xanchor: 'left',
        yanchor: 'top',
        title: {
          text: '       Attrition', // leading space needed to align title with legend item text
          font: {
            size: 16,
          },
        },
      },
    }

    const chartConfig = {
      responsive: true,
      displayModeBar: false,
      // The drag handles plotly puts along each axis sit on top of the last 20px of every tick
      // label; without them the label tooltips are hoverable across their full width.
      showAxisDragHandles: false,
    }

    const { labelPoints } = funnelChartData.value

    plotly
      .newPlot(funnelChartRef.value, [trace, ...legendTraces], layout, chartConfig)
      .then((graphDiv: PlotlyGraphDiv) => {
        attachLabelHovers(graphDiv, labelPoints)
        // A responsive resize redraws the tick labels and takes the handlers with them, so they
        // are re-attached after every redraw.
        graphDiv.removeAllListeners?.('plotly_afterplot')
        graphDiv.on?.('plotly_afterplot', () => attachLabelHovers(graphDiv, labelPoints))
      })
  }

  const downloadFunnelChart = () => {
    if (!funnelChartRef.value) return
    plotly
      .toImage(funnelChartRef.value, { format: 'png', width: 1200, height: 800, scale: 2 })
      .then((dataUrl: string) => {
        const link = document.createElement('a')
        link.download = 'attrition-plot.png'
        link.href = dataUrl
        link.click()
      })
  }

  const downloadFunnelChartCSV = () => {
    if (!inclusionReportResponse.value || draggableAttritionStats.value.length === 0) return

    const summary = inclusionReportResponse.value.summary
    const stats = draggableAttritionStats.value

    const headers = [
      getText('MRI_PA_INCLUSION_REPORT_FILTER_COLUMN'),
      getText('MRI_PA_INCLUSION_REPORT_NO_OF_PERSONS'),
      getText('MRI_PA_INCLUSION_REPORT_PERCENTAGE_OF_TOTAL'),
    ]
    const rows = [
      [getText('MRI_PA_INCLUSION_REPORT_TOTAL_PERSONS'), summary.baseCount.toString(), '100.00%'],
      ...stats.map(stat => {
        const prefix = stat.isExclude
          ? `${getText('MRI_PA_FILTERCARD_TITLE_EXCLUSION')} - `
          : `${getText('MRI_PA_FILTERCARD_TITLE_INCLUSION')} - `
        return [`${prefix}${ruleLabel(stat)}`, stat.countSatisfying.toString(), stat.percentSatisfying]
      }),
    ]

    const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows.map(r => r.map(escapeCsvCell).join(','))].join(
      '\n'
    )
    const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'attrition-plot.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // Watch for changes in funnelChartData to render funnel chart
  watch(
    () => funnelChartData.value,
    () => {
      renderFunnelChart()
    },
    { flush: 'post' } // Ensure <div ref="funnelChartRef"> exists
  )

  // Re-render when chart container is mounted (e.g. after the loading spinner hides).
  // The funnelChartData watcher may fire while showLoader keeps the chart div out of the DOM,
  // leaving funnelChartRef null. Once the spinner finishes and the div is mounted, render now.
  watch(
    funnelChartRef,
    newRef => {
      if (newRef) {
        renderFunnelChart()
      }
    },
    { flush: 'post' }
  )

  return {
    funnelChartRef,
    downloadFunnelChart,
    downloadFunnelChartCSV,
  }
}
