import { ref, computed, watch, type Ref } from 'vue'
import plotly from '@/lib/CustomPlotly'
import { COLORS_ARRAY, FUNNEL_THRESHOLDS, FUNNEL_LEGEND_LABELS } from '../constants'
import type { InclusionReportResponse, RuleFilterCardDetails } from '@/query-filter/types/InclusionReportTypes'
import { getRuleDisplayName } from '@/utils/filterCardUtils'

export interface FunnelChartData {
  labels: string[]
  values: number[]
  hoverTexts: string[]
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
      const name = fullName.length > 35 ? fullName.slice(0, 35) + '...' : fullName
      labels.push(`${prefix}${name}`)
      values.push(stat.countSatisfying)
      hoverTexts.push(
        `${prefix}${fullName}<br>Count: ${stat.countSatisfying.toLocaleString()}<br>Percent: ${stat.percentSatisfying}`
      )
    })

    return { labels, values, hoverTexts }
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
        size: 16,
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
    }

    plotly.newPlot(funnelChartRef.value, [trace, ...legendTraces], layout, chartConfig)
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
