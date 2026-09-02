import { ref, watch, nextTick, type Ref } from 'vue'
import * as echarts from 'echarts'
import { formatTreemapTooltip } from '../computeTreemapStats'
import { shouldIncludeRect } from '../ruleSelectionFilter'
import { TREEMAP_LEGEND_ITEMS, EXCLUDED_COLOR } from '../constants'

export function useTreemapChart(
  treemapData: Ref<any>,
  checkedRulesIds: Ref<number[]>,
  allAnyOption: Ref<'ALL' | 'ANY'>,
  passedFailedOption: Ref<'PASSED' | 'FAILED'>,
  selectedVisualization: Ref<'ATTRITION' | 'INTERSECT'>,
  getText: (key: string, param?: string | string[]) => string
) {
  const treemapChartRef = ref<HTMLElement | null>(null)
  const echartsTreemap = ref<any>(null)
  const availableWidth = ref(0)

  const disposeTreemap = () => {
    if (echartsTreemap.value) {
      echartsTreemap.value.dispose()
      echartsTreemap.value = null
    }
  }

  // Get colors used in the treemap data, except the EXCLUDED_COLOR (gray) used for filtered out rectangles
  const collectUsedColors = (node: any): Set<string> => {
    const usedColors = new Set<string>()

    const collect = (n: any) => {
      const isLeafNode = !n.children || n.children.length === 0
      if (isLeafNode && n.itemStyle?.color && n.itemStyle.color !== EXCLUDED_COLOR) {
        usedColors.add(n.itemStyle.color)
      }
      if (n.children) {
        n.children.forEach(collect)
      }
    }

    collect(node)
    return usedColors
  }

  // Filter legend items to only include colors that are actually used in the data
  const getActiveLegendItems = (usedColors: Set<string>) => {
    return TREEMAP_LEGEND_ITEMS.filter(item => usedColors.has(item.color))
  }

  // Create ECharts graphic for legend at the bottom center of the chart
  const createLegendGraphics = (legendItems: Array<{ name: string; color: string }>, chartWidth: number) => {
    const ITEM_WIDTH = 180 // Approximate width per legend item
    const LEGEND_BOTTOM = 17.5
    const CIRCLE_RADIUS = 7.5
    const TEXT_OFFSET = 20

    const totalLegendWidth = legendItems.length * ITEM_WIDTH
    const legendStartX = (chartWidth - totalLegendWidth) / 2

    return legendItems
      .map((item, index) => {
        const xPos = legendStartX + index * ITEM_WIDTH
        return [
          {
            type: 'circle',
            id: `legend-circle-${index}`,
            left: xPos,
            bottom: LEGEND_BOTTOM,
            z: 100,
            shape: {
              r: CIRCLE_RADIUS,
            },
            style: {
              fill: item.color,
            },
          },
          {
            type: 'text',
            id: `legend-text-${index}`,
            left: xPos + TEXT_OFFSET,
            bottom: LEGEND_BOTTOM,
            z: 100,
            style: {
              text: item.name,
              fontSize: 16,
              fill: '#333',
              textAlign: 'left',
              textVerticalAlign: 'middle',
            },
          },
        ]
      })
      .flat()
  }

  const createTreemapOption = (dataToRender: any, legendGraphics: any[]): echarts.EChartsOption => {
    return {
      tooltip: {
        show: true,
        formatter: (params: any) => formatTreemapTooltip(params.data?.tooltip),
        backgroundColor: 'var(--color-ui-extra-light-bg)',
        textStyle: {
          color: 'var(--d2e-color-primary, #000080)',
          fontSize: 16,
        },
        confine: true,
        padding: [8, 12],
      },
      graphic: legendGraphics,
      series: [
        {
          type: 'treemap',
          data: [dataToRender],
          roam: 'move',
          nodeClick: false,
          breadcrumb: {
            show: false,
          },
          label: {
            show: false,
          },
          itemStyle: {
            borderColor: '#000', // css var doesn't work here
            borderWidth: 0.3,
          },
          bottom: 40, // Reserve space for legend at the bottom
        },
      ],
    }
  }

  const applyFiltering = (node: any): any => {
    const newNode: any = {
      name: node.name,
      value: node.value,
      tooltip: node.tooltip,
      itemStyle: node.itemStyle ? { ...node.itemStyle } : {},
    }

    // Process children first
    if (node.children && node.children.length > 0) {
      newNode.children = node.children.map((child: any) => applyFiltering(child))
    }

    // Check if this node should be included based on filtering criteria
    // Only apply gray color to leaf nodes (nodes without children)
    const isLeafNode = !node.children || node.children.length === 0
    const isIncluded = shouldIncludeRect(node.name, checkedRulesIds.value, allAnyOption.value, passedFailedOption.value)

    if (isLeafNode && !isIncluded) {
      // Gray out excluded leaf nodes
      newNode.itemStyle = {
        color: EXCLUDED_COLOR,
      }
    }

    return newNode
  }

  const renderTreemap = async () => {
    if (!treemapChartRef.value || !treemapData.value) return

    await nextTick()
    availableWidth.value = treemapChartRef.value.clientWidth

    // Dispose and reinitialize chart
    disposeTreemap()
    echartsTreemap.value = echarts.init(treemapChartRef.value)

    // Apply filtering to treemap data
    const dataToRender = applyFiltering(treemapData.value)

    // Collect colors and create legend
    const usedColors = collectUsedColors(dataToRender)
    const legendItems = getActiveLegendItems(usedColors)
    const legendGraphics = createLegendGraphics(legendItems, treemapChartRef.value.clientWidth)

    // Create and apply chart option
    const option = createTreemapOption(dataToRender, legendGraphics)
    echartsTreemap.value.setOption(option)
  }

  // Watch for changes in treemapData to render treemap
  watch(
    () => [treemapData.value, selectedVisualization.value],
    () => {
      // Only render if we're in INTERSECT view
      if (selectedVisualization.value !== 'INTERSECT' || !treemapData.value) {
        return
      }
      renderTreemap()
    },
    { flush: 'post' } // Ensure <div ref="treemapChartRef"> exists
  )

  // Re-render when chart container is mounted (e.g. after the loading spinner hides).
  // The treemapData watcher may fire while showLoader keeps the chart div out of the DOM,
  // leaving treemapChartRef null. Once the spinner finishes and the div is mounted, render now.
  watch(
    treemapChartRef,
    newRef => {
      if (newRef && selectedVisualization.value === 'INTERSECT' && treemapData.value) {
        renderTreemap()
      }
    },
    { flush: 'post' }
  )

  // Watch for changes in filtering options
  watch(
    () => [allAnyOption.value, passedFailedOption.value, checkedRulesIds.value],
    () => {
      // Re-render treemap when filtering options change
      if (selectedVisualization.value === 'INTERSECT' && treemapData.value) {
        renderTreemap()
      }
    },
    { deep: true }
  )

  const downloadTreemapImage = () => {
    if (!echartsTreemap.value) return
    const dataUrl = echartsTreemap.value.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff',
    })
    const link = document.createElement('a')
    link.download = 'population-treemap.png'
    link.href = dataUrl
    link.click()
  }

  const collectLeafData = (node: any): Array<{ count: number; passed: string[]; failed: string[] }> => {
    const leaves: Array<{ count: number; passed: string[]; failed: string[] }> = []
    const traverse = (n: any) => {
      const isLeaf = !n.children || n.children.length === 0
      if (isLeaf && n.tooltip) {
        leaves.push({
          count: n.value,
          passed: n.tooltip.passed || [],
          failed: n.tooltip.failed || [],
        })
      }
      if (n.children) {
        n.children.forEach(traverse)
      }
    }
    traverse(node)
    return leaves
  }

  const downloadTreemapCSV = () => {
    if (!treemapData.value) return

    const filteredData = applyFiltering(treemapData.value)
    const leaves = collectLeafData(filteredData)

    const replacePrefixes = (criteria: string[]) =>
      criteria.map(c =>
        c
          .replace(/^\+ /, `${getText('MRI_PA_FILTERCARD_TITLE_INCLUSION')} - `)
          .replace(/^- /, `${getText('MRI_PA_FILTERCARD_TITLE_EXCLUSION')} - `)
      )

    const headers = [
      getText('MRI_PA_INCLUSION_REPORT_NO_OF_PERSONS'),
      getText('MRI_PA_INCLUSION_REPORT_PASSED'),
      getText('MRI_PA_INCLUSION_REPORT_FAILED'),
    ]
    const rows = leaves.map(leaf => [
      leaf.count.toString(),
      replacePrefixes(leaf.passed).join('; '),
      replacePrefixes(leaf.failed).join('; '),
    ])

    const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows.map(r => r.map(escapeCsvCell).join(','))].join(
      '\n'
    )
    const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'population-treemap.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return {
    treemapChartRef,
    disposeTreemap,
    downloadTreemapImage,
    downloadTreemapCSV,
  }
}
