import { ref, nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InclusionReportResponse } from '@/query-filter/types/InclusionReportTypes'

const { newPlot, hover, unhover } = vi.hoisted(() => ({
  newPlot: vi.fn(),
  hover: vi.fn(),
  unhover: vi.fn(),
}))
vi.mock('@/lib/CustomPlotly', () => ({ default: { newPlot, Fx: { hover, unhover } } }))

import { useFunnelChart, type AttritionStat } from '../composables/useFunnelChart'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Stands in for plotly's tick rendering, which is what the label hovers have to find: an unclassed
 * <text> inside a `g.ytick`, one <tspan> per wrapped line, and the label plotly was handed kept
 * verbatim in `data-unformatted`.
 */
function drawTicks(graphDiv: HTMLElement, labels: string[]) {
  graphDiv.innerHTML = ''
  const svg = document.createElementNS(SVG_NS, 'svg')
  labels.forEach(label => {
    const group = document.createElementNS(SVG_NS, 'g')
    group.setAttribute('class', 'ytick')
    const tick = document.createElementNS(SVG_NS, 'text')
    tick.setAttribute('data-unformatted', label)
    label.split('<br>').forEach(line => {
      const tspan = document.createElementNS(SVG_NS, 'tspan')
      tspan.textContent = line
      tick.appendChild(tspan)
    })
    group.appendChild(tick)
    svg.appendChild(group)
  })
  graphDiv.appendChild(svg)
  return graphDiv
}

/** The rendered graph div, plus the event emitter API plotly adds to it. */
function makeGraphDiv() {
  const handlers: Record<string, () => void> = {}
  return Object.assign(document.createElement('div'), {
    on: (event: string, handler: () => void) => {
      handlers[event] = handler
    },
    removeAllListeners: (event: string) => {
      delete handlers[event]
    },
    handlers,
  })
}

function makeStat(name: string, id = 0): AttritionStat {
  return { id, name, isExclude: false, countSatisfying: 90, percentSatisfying: '90.00%', pctDiff: '10.00%' }
}

const LONG_NAME = 'Condition occurrence of type 2 diabetes mellitus with documented complications recorded'
  .concat(' and a second clause that pushes the label well past the three line budget')
  .trim()
const SHORT_NAME = 'Rule A'

function renderChart(stats: AttritionStat[]) {
  const response = { summary: { baseCount: 100 } } as unknown as InclusionReportResponse
  const graphDiv = makeGraphDiv()
  newPlot.mockImplementation((div: HTMLElement, traces: { y: string[] }[]) =>
    Promise.resolve(drawTicks(div, traces[0].y))
  )

  const { funnelChartRef } = useFunnelChart(ref(response), ref(stats), (key: string) => key)
  funnelChartRef.value = graphDiv
  return graphDiv
}

const tickAt = (graphDiv: HTMLElement, index: number) =>
  graphDiv.querySelectorAll<SVGTextElement>('g.ytick > text')[index]

describe('useFunnelChart y axis label tooltips', () => {
  beforeEach(() => {
    newPlot.mockReset()
    hover.mockReset()
    unhover.mockReset()
  })

  it('hovering a label the wrapping cut short shows its funnel layer tooltip', async () => {
    const graphDiv = renderChart([makeStat(LONG_NAME)])
    await nextTick()
    await nextTick()

    const tick = tickAt(graphDiv, 1)
    expect(tick.getAttribute('data-unformatted')).toContain('...')
    // `.main-svg` switches pointer events off, so the label needs them back to be hoverable.
    expect(tick.style.pointerEvents).toBe('all')

    tick.onmouseover?.(new MouseEvent('mouseover'))
    expect(hover).toHaveBeenCalledWith(graphDiv, [{ curveNumber: 0, pointNumber: 1 }])

    tick.onmouseout?.(new MouseEvent('mouseout'))
    expect(unhover).toHaveBeenCalledWith(graphDiv)
  })

  it('hovers every label, not only the ones that were cut short', async () => {
    const graphDiv = renderChart([makeStat(SHORT_NAME)])
    await nextTick()
    await nextTick()

    expect(graphDiv.querySelectorAll('g.ytick > text')).toHaveLength(2)

    tickAt(graphDiv, 0).onmouseover?.(new MouseEvent('mouseover')) // Total
    expect(hover).toHaveBeenLastCalledWith(graphDiv, [{ curveNumber: 0, pointNumber: 0 }])

    tickAt(graphDiv, 1).onmouseover?.(new MouseEvent('mouseover'))
    expect(hover).toHaveBeenLastCalledWith(graphDiv, [{ curveNumber: 0, pointNumber: 1 }])
  })

  it('re-attaches the hovers after a redraw drops them', async () => {
    const graphDiv = renderChart([makeStat(LONG_NAME)])
    await nextTick()
    await nextTick()

    const labels = [...graphDiv.querySelectorAll('g.ytick > text')].map(t => t.getAttribute('data-unformatted') ?? '')
    drawTicks(graphDiv, labels) // a responsive resize redraws the ticks without our handlers
    expect(tickAt(graphDiv, 1).onmouseover).toBeNull()

    graphDiv.handlers.plotly_afterplot()
    tickAt(graphDiv, 1).onmouseover?.(new MouseEvent('mouseover'))
    expect(hover).toHaveBeenCalledWith(graphDiv, [{ curveNumber: 0, pointNumber: 1 }])
  })
})
