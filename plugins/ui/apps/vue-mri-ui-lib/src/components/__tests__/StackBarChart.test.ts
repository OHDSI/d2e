import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createStore } from 'vuex'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StackBarChart from '../StackBarChart.vue'
import Plotly from '../../lib/CustomPlotly'

vi.mock('../../lib/CustomPlotly', () => ({
  default: {
    newPlot: vi.fn(),
    react: vi.fn(),
    relayout: vi.fn(),
    update: vi.fn(),
    purge: vi.fn(),
    Plots: {
      resize: vi.fn(),
    },
  },
}))

const selectionAction = vi.fn()
const actions = {
  setAxisValue: vi.fn(),
  setChartPropertyValue: vi.fn(),
  fireQuery: vi.fn(),
  disableAllAxesandProperties: vi.fn(),
  setChartSelection: selectionAction,
  setPdfChartReady: vi.fn(),
  downloadCSV: vi.fn(),
  setCurrentPatientCount: vi.fn(),
  setFireRequest: vi.fn(),
  completeDownloadCSV: vi.fn(),
  setAlertMessage: vi.fn(),
  setPlotlyElement: vi.fn(),
}

const getters = {
  dataToTraces:
    () =>
    (chartData, selection = []) => ({
      ...chartData,
      traces: (chartData.traces || []).map((trace, index) => ({
        ...trace,
        selectedpoints: selection && index in selection ? selection[index] : [],
      })),
    }),
  getMriFrontendConfig: () => ({
    _internalConfig: {
      chartOptions: {
        stacked: {
          overlappingHistogramEnabled: true,
          overlappingBarChartEnabled: true,
          kernelDensityPlotEnabled: true,
        },
      },
    },
  }),
  getChartSize: () => ({}),
  getCsvFireDownload: () => false,
  getText: () => (key: string) => key,
  getFireRequest: () => false,
  isFireRequestHeld: () => false,
  getHasAssignedConfig: () => false,
  getBookmarksData: () => ({}),
  getChartableFilterCardByInstanceId: () => () => ({ name: 'Card' }),
  sortProperty: () => ({ props: { value: null } }),
  processResponse: () => chartData => chartData,
  getChartProperty: () => () => ({ props: { active: true } }),
  getAllAxes: () => [],
  getBarChartType: () => 'stack',
  getShowDistributionOverlay: () => false,
}

const getLastSelectionPayload = () => selectionAction.mock.calls.at(-1)?.[1]

describe('StackBarChart selection handling', () => {
  const mountComponent = (barDisplayMode = 'stack', showDistributionOverlay = false) => {
    const customGetters = {
      ...getters,
      getBarChartType: () => barDisplayMode,
      getShowDistributionOverlay: () => showDistributionOverlay,
    }
    const store = createStore({ actions, getters: customGetters })
    const pinia = createPinia()

    return shallowMount(StackBarChart as any, {
      global: { plugins: [store, pinia] },
      props: { busyEv: false, shouldRerenderChart: false },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  })

  it('uses shared clearSelectionState from reset button', async () => {
    const wrapper = mountComponent()

    const clearSelectionSpy = vi.spyOn(wrapper.vm as any, 'clearSelectionState')
    const fakePlotElement = { id: 'plot' }
    ;(wrapper.vm as any).config.modeBarButtons[0][0].click(fakePlotElement)

    expect(clearSelectionSpy).toHaveBeenCalledWith({ plotElement: fakePlotElement, resetAxes: true })
  })

  it('captures selection after deselect and clears drilldown state', async () => {
    const wrapper = mountComponent()

    const handlers: Record<string, (...args: any[]) => void> = {}
    const fakePlotElement = {
      clientWidth: 800,
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[event] = cb
      }),
    }

    Object.defineProperty((wrapper.vm as any).$el, 'querySelector', {
      value: vi.fn(() => fakePlotElement),
    })
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [
        {
          name: 'Group One',
          meta: { fullName: 'Group One' },
          selectedpoints: [0],
          x: ['Alpha', 'Beta'],
          customdata: [
            { x: [{ id: 'cat.id' }], y: [{ id: 'grp.id' }], values: ['Alpha'] },
            { x: [{ id: 'cat.id' }], y: [{ id: 'grp.id' }], values: ['Beta'] },
          ],
        },
      ],
      tickvals: ['Alpha', 'Beta'],
      ticktext: ['Alpha', 'Beta'],
      ticktextFull: ['Alpha', 'Beta'],
    }
    ;(wrapper.vm as any).setupPlotly()

    // selectionUpdate now reads from the eventData payload, not from
    // trace.selectedpoints on the canonical traces.
    handlers.plotly_selected({ points: [{ curveNumber: 0, pointIndex: 0, data: { type: 'bar' } }] })
    const firstSelection = getLastSelectionPayload()
    expect(firstSelection.selection).toEqual([
      { id: 'cat.id', value: 'Alpha' },
      { id: 'grp.id', value: 'Group One' },
    ])

    handlers.plotly_deselect()
    const afterDeselect = getLastSelectionPayload()
    expect(afterDeselect.selection).toEqual([])
    // Plotly.react is called by clearSelectionState (deselect), not by the selection handler.
    expect(Plotly.react).toHaveBeenCalled()

    handlers.plotly_selected({ points: [{ curveNumber: 0, pointIndex: 1, data: { type: 'bar' } }] })
    const secondSelection = getLastSelectionPayload()
    expect(secondSelection.selection).toEqual([
      { id: 'cat.id', value: 'Beta' },
      { id: 'grp.id', value: 'Group One' },
    ])
  })

  it('resets to default state when plotly_selected has no selected points', async () => {
    const wrapper = mountComponent()

    const handlers: Record<string, (...args: any[]) => void> = {}
    const fakePlotElement = {
      clientWidth: 800,
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[event] = cb
      }),
    }

    Object.defineProperty((wrapper.vm as any).$el, 'querySelector', {
      value: vi.fn(() => fakePlotElement),
    })
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [
        {
          name: 'Group One',
          meta: { fullName: 'Group One' },
          selectedpoints: [],
          x: ['Alpha'],
          customdata: [{ x: [{ id: 'cat.id' }], y: [{ id: 'grp.id' }], values: ['Alpha'] }],
        },
      ],
      tickvals: ['Alpha'],
      ticktext: ['Alpha'],
      ticktextFull: ['Alpha'],
    }
    ;(wrapper.vm as any).setupPlotly()

    handlers.plotly_selected()

    const afterEmptySelection = getLastSelectionPayload()
    expect(afterEmptySelection.selection).toEqual([])
    expect(Plotly.react).toHaveBeenCalled()
    const reactTraces = (Plotly.react as any).mock.calls.at(-1)?.[1]
    expect(reactTraces[0].selectedpoints).toBeNull()
  })

  it('uses relayout only on reset when no active selection exists', async () => {
    const wrapper = mountComponent()

    const fakePlotElement = { id: 'plot' }
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [{}],
      tickvals: ['A'],
      ticktext: ['A'],
      ticktextFull: ['A'],
    }
    ;(wrapper.vm as any).clearSelectionState({ plotElement: fakePlotElement, resetAxes: true })

    expect(Plotly.relayout).toHaveBeenCalledWith(fakePlotElement, {
      'xaxis.autorange': true,
      'yaxis.autorange': true,
    })
    expect(Plotly.react).not.toHaveBeenCalled()
  })

  it('clears visual selection state with null selectedpoints on reset', async () => {
    const wrapper = mountComponent()

    const fakePlotElement = { id: 'plot' }
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [
        {
          selectedpoints: [0],
          x: ['A'],
          customdata: [{ x: [{ id: 'cat.id' }], y: [] }],
        },
      ],
      tickvals: ['A'],
      ticktext: ['A'],
      ticktextFull: ['A'],
    }
    ;(wrapper.vm as any).config.modeBarButtons[0][0].click(fakePlotElement)

    expect(Plotly.react).toHaveBeenCalled()
    const reactTraces = (Plotly.react as any).mock.calls.at(-1)?.[1]
    expect(reactTraces[0].selectedpoints).toBeNull()
  })

  it('uses label aliases for truncation without forcing manual ticks', async () => {
    const wrapper = mountComponent()

    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [],
      tickvals: ['Very Long Label A', 'Very Long Label B'],
      ticktext: ['Very Long...', 'Very Long...'],
      ticktextFull: ['Very Long Label A', 'Very Long Label B'],
    }

    const layout = (wrapper.vm as any).buildPlotlyLayout()

    expect(layout.xaxis.tickvals).toBeUndefined()
    expect(layout.xaxis.ticktext).toBeUndefined()
    expect(layout.xaxis.labelalias).toEqual({
      'Very Long Label A': 'Very Long...',
      'Very Long Label B': 'Very Long...',
    })
  })

  const wireSelectionHandlers = (wrapper: ReturnType<typeof shallowMount>) => {
    const handlers: Record<string, (...args: any[]) => void> = {}
    const fakePlotElement = {
      clientWidth: 800,
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[event] = cb
      }),
    }
    Object.defineProperty((wrapper.vm as any).$el, 'querySelector', {
      value: vi.fn(() => fakePlotElement),
    })
    return { handlers, fakePlotElement }
  }

  const lastReactArgs = () => (Plotly.react as any).mock.calls.at(-1)

  it('preserves overlay barmode and trace opacity through selection', async () => {
    const wrapper = mountComponent('overlay')
    const { handlers } = wireSelectionHandlers(wrapper)
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [
        {
          name: 'A',
          meta: { fullName: 'A' },
          selectedpoints: [0],
          x: ['Alpha'],
          customdata: [{ x: [{ id: 'cat.id' }], y: [], values: ['Alpha'] }],
        },
      ],
    }
    ;(wrapper.vm as any).setupPlotly()

    handlers.plotly_selected({ points: [{ curveNumber: 0, pointIndex: 0, data: { type: 'bar' } }] })
    handlers.plotly_deselect()

    const [, traces, layout] = lastReactArgs()
    expect(layout.barmode).toBe('overlay')
    expect(layout.bargap).toBe(0)
    expect(traces[0].marker.opacity).toBe(0.3)
  })

  it('preserves partialOverlaySolid mode through selection with multiple traces', async () => {
    const wrapper = mountComponent('partialOverlaySolid')
    const { handlers } = wireSelectionHandlers(wrapper)
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [
        {
          name: 'A',
          meta: { fullName: 'A' },
          selectedpoints: [0],
          x: ['Alpha'],
          customdata: [{ x: [{ id: 'cat.id' }], y: [], values: ['Alpha'] }],
        },
        {
          name: 'B',
          meta: { fullName: 'B' },
          selectedpoints: [],
          x: ['Alpha'],
          customdata: [{ x: [{ id: 'cat.id' }], y: [], values: ['Alpha'] }],
        },
      ],
    }
    ;(wrapper.vm as any).setupPlotly()

    handlers.plotly_selected({ points: [{ curveNumber: 0, pointIndex: 0, data: { type: 'bar' } }] })
    handlers.plotly_deselect()

    const [, traces, layout] = lastReactArgs()
    expect(layout.barmode).toBe('overlay')
    expect(traces[0].width).toBeGreaterThan(0)
    expect(typeof traces[0].offset).toBe('number')
    expect(traces[1].width).toBeGreaterThan(0)
    expect(typeof traces[1].offset).toBe('number')
    expect(traces[0].offset).not.toBe(traces[1].offset)
  })

  it('preserves overlay barmode through clearSelectionState with active selection', async () => {
    const wrapper = mountComponent('overlay')
    const fakePlotElement = { id: 'plot' }
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [
        {
          selectedpoints: [0],
          x: ['A'],
          customdata: [{ x: [{ id: 'cat.id' }], y: [] }],
        },
      ],
    }
    ;(wrapper.vm as any).clearSelectionState({ plotElement: fakePlotElement, resetAxes: true })

    const [, traces, layout] = lastReactArgs()
    expect(layout.barmode).toBe('overlay')
    expect(traces[0].marker.opacity).toBe(0.3)
  })

  it('sets y-axis title to selected measure name in non-KDP modes', async () => {
    const wrapper = mountComponent('stack')
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [],
      measures: [{ id: 'patient.attributes.pcount', name: 'Patient Count' }],
    }

    expect((wrapper.vm as any).yAxisTitle).toBe('Patient Count')
    const layout = (wrapper.vm as any).buildPlotlyLayout()
    expect(layout.yaxis.title).toEqual({ text: 'Patient Count' })
  })

  it('sets y-axis title to the density translation key when bar display mode is KDP', async () => {
    const wrapper = mountComponent('distribution')
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [],
      measures: [{ id: 'patient.attributes.pcount', name: 'Patient Count' }],
    }

    expect((wrapper.vm as any).yAxisTitle).toBe('MRI_PA_CHART_YAXIS_DENSITY')
    const layout = (wrapper.vm as any).buildPlotlyLayout()
    expect(layout.yaxis.title).toEqual({ text: 'MRI_PA_CHART_YAXIS_DENSITY' })
  })

  it('falls back to measure name in KDP mode when there is only one bin', async () => {
    const wrapper = mountComponent('distribution')
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [{ x: ['A'], y: [5] }],
      measures: [{ id: 'patient.attributes.pcount', name: 'Patient Count' }],
    }

    expect((wrapper.vm as any).yAxisTitle).toBe('Patient Count')
    const layout = (wrapper.vm as any).buildPlotlyLayout()
    expect(layout.yaxis.title).toEqual({ text: 'Patient Count' })
  })

  it('falls back to empty y-axis title when no measure is available', async () => {
    const wrapper = mountComponent('stack')
    ;(wrapper.vm as any).chartData = {
      axisType: 'category',
      traces: [],
    }

    expect((wrapper.vm as any).yAxisTitle).toBe('')
    const layout = (wrapper.vm as any).buildPlotlyLayout()
    expect(layout.yaxis.title).toEqual({ text: '' })
  })
})


describe('StackBarChart busy-state lifecycle', () => {
  const createDeferred = () => {
    let resolve: (value: any) => void = () => {}
    let reject: (error: any) => void = () => {}
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  })

  it('emits busy true then false on successful request', async () => {
    const { promise, resolve } = createDeferred()
    const fireQuery = vi.fn().mockReturnValue(promise)
    const store = createStore({
      state: { fireRequest: false },
      actions: { ...actions, fireQuery },
      getters: { ...getters, getBookmarksData: () => ({ datasetId: '1', test: true }), getFireRequest: (state: any) => state.fireRequest },
    })
    const wrapper = shallowMount(StackBarChart as any, {
      global: { plugins: [store, createPinia()] },
      props: { busyEv: false, shouldRerenderChart: false },
    })

    store.state.fireRequest = !store.state.fireRequest
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('busyEv')).toEqual([[true]])

    resolve({ data: [], measures: [], categories: [], totalPatientCount: 0 })
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('busyEv')).toEqual([[true], [false]])
  })

  it('cancels previous request when a new request starts', async () => {
    const deferred1 = createDeferred()
    const deferred2 = createDeferred()
    let callIndex = 0
    const fireQuery = vi.fn().mockImplementation(() => {
      callIndex += 1
      return callIndex === 1 ? deferred1.promise : deferred2.promise
    })
    const store = createStore({
      state: { fireRequest: false },
      actions: { ...actions, fireQuery },
      getters: { ...getters, getBookmarksData: () => ({ datasetId: '1', test: true }), getFireRequest: (state: any) => state.fireRequest },
    })
    const wrapper = shallowMount(StackBarChart as any, {
      global: { plugins: [store, createPinia()] },
      props: { busyEv: false, shouldRerenderChart: false },
    })

    store.state.fireRequest = !store.state.fireRequest
    await wrapper.vm.$nextTick()

    expect(fireQuery).toHaveBeenCalledTimes(1)

    // second request cancels the first and eventually resolves
    store.state.fireRequest = !store.state.fireRequest
    await wrapper.vm.$nextTick()

    expect(fireQuery).toHaveBeenCalledTimes(2)

    deferred2.resolve({ data: [], measures: [], categories: [], totalPatientCount: 0 })
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('busyEv')).toContainEqual([false])
  })

  it('emits busy false on unmount', async () => {
    const { promise } = createDeferred()
    const fireQuery = vi.fn().mockReturnValue(promise)
    const store = createStore({
      state: { fireRequest: false },
      actions: { ...actions, fireQuery },
      getters: { ...getters, getBookmarksData: () => ({ datasetId: '1', test: true }), getFireRequest: (state: any) => state.fireRequest },
    })
    const wrapper = shallowMount(StackBarChart as any, {
      global: { plugins: [store, createPinia()] },
      props: { busyEv: false, shouldRerenderChart: false },
    })

    store.state.fireRequest = !store.state.fireRequest
    await wrapper.vm.$nextTick()

    wrapper.unmount()

    expect(wrapper.emitted('busyEv')).toContainEqual([false])
  })
})

describe('StackBarChart default color axis counts', () => {
  const createDeferred = () => {
    let resolve: (value: any) => void = () => {}
    const promise = new Promise(res => {
      resolve = res
    })
    return { promise, resolve }
  }

  const fireAndResolve = async (response: any, allAxes: any[]) => {
    const { promise, resolve } = createDeferred()
    const fireQuery = vi.fn().mockReturnValue(promise)
    const store = createStore({
      state: { fireRequest: false },
      actions: { ...actions, fireQuery },
      getters: {
        ...getters,
        getAllAxes: () => allAxes,
        getBookmarksData: () => ({ datasetId: '1', test: true }),
        getFireRequest: (state: any) => state.fireRequest,
      },
    })
    const wrapper = shallowMount(StackBarChart as any, {
      global: { plugins: [store, createPinia()] },
      props: { busyEv: false, shouldRerenderChart: false },
    })

    // setupPlotly attaches Plotly event handlers to the container element; a plain DOM node
    // has no .on(), which would abort the success callback before it reaches the emit.
    const container = (wrapper.vm as any).$el.querySelector('.stackbar-container')
    container.on = vi.fn()

    store.state.fireRequest = !store.state.fireRequest
    await wrapper.vm.$nextTick()

    resolve(response)
    await new Promise(r => setTimeout(r, 0))

    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  })

  it('ignores the synthetic dummy_category when no x axis is selected', async () => {
    const wrapper = await fireAndResolve(
      {
        data: [{ dummy_category: 'Current Cohort', 'patient.attributes.pcount': 42 }],
        measures: [{ id: 'patient.attributes.pcount', name: 'Patient Count' }],
        categories: [{ id: 'dummy_category', axis: 1 }],
        totalPatientCount: 42,
      },
      [{ props: {} }, { props: {} }]
    )

    expect(wrapper.emitted('chartDataReady')).toEqual([[[]]])
  })

  it('reports the distinct value count against the axis slot holding the attribute', async () => {
    const wrapper = await fireAndResolve(
      {
        data: [
          { 'patient.attributes.gender': 'Female', 'patient.attributes.pcount': 3 },
          { 'patient.attributes.gender': 'Male', 'patient.attributes.pcount': 4 },
          { 'patient.attributes.gender': 'Male', 'patient.attributes.pcount': 5 },
        ],
        measures: [{ id: 'patient.attributes.pcount', name: 'Patient Count' }],
        categories: [{ id: 'patient.attributes.gender', axis: 1 }],
        totalPatientCount: 12,
      },
      [{ props: {} }, { props: { attributeId: 'patient.attributes.gender' } }]
    )

    expect(wrapper.emitted('chartDataReady')).toEqual([[[{ axisIndex: 1, count: 2 }]]])
  })

  it('drops x categories that no axis slot holds instead of falling back to X1', async () => {
    const wrapper = await fireAndResolve(
      {
        data: [{ 'patient.attributes.gender': 'Female', 'patient.attributes.pcount': 3 }],
        measures: [{ id: 'patient.attributes.pcount', name: 'Patient Count' }],
        categories: [{ id: 'patient.attributes.gender', axis: 1 }],
        totalPatientCount: 3,
      },
      [{ props: { attributeId: '' } }, { props: {} }]
    )

    expect(wrapper.emitted('chartDataReady')).toEqual([[[]]])
  })
})
