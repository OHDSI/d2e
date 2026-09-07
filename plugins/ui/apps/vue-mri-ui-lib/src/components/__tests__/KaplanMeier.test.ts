import { vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createStore } from 'vuex'
import km from '../KaplanMeier.vue'
import mouseScroll from '@/directives/mouseScroll'

describe('KaplanMeier.vue', () => {
  let store
  let actions
  let getters

  beforeEach(() => {
    actions = {
      disableAllAxesandProperties: vi.fn(),
      setAxisValue: vi.fn(),
      setFireRequest: vi.fn(),
      setChartPropertyValue: vi.fn(),
    }
    getters = {
      getKMDisplayInfo: () => () => {
        return { censoring: true, errorlines: 1 }
      },
      getText: (modulestate, modulegetters) => (key, param) => {
        return key
      },
      getSplitterWidth: () => {
        return {}
      },
      getChartSize: () => {
        return {}
      },
      getCsvFireDownload: () => {
        return {}
      },
      getFireRequest: () => {
        return {}
      },
    }
    store = createStore({
      actions,
      getters,
    })
  })

  it('sets the correct default data', () => {
    const wrapper = shallowMount(km as any, {
      global: {
        plugins: [store],
        directives: { 'mouse-scroll': mouseScroll },
      },
    })
    const defaultData = wrapper.vm.$data
    expect(defaultData).toMatchSnapshot()
  })
})

// Every other chart runs its analytics query through startRequest, which cancels the
// previous one and drops any response that comes back after a newer request went out.
// KaplanMeier defines the same helper but fired the query straight from the watcher,
// so two edits in quick succession left both requests alive and whichever finished
// last wrote the count — including the older one, for the cohort no longer on screen.
// That also lowers the store's staleness flag, which is what pa_get_cohort_result
// waits on: it stops waiting and reports the previous cohort's number as the answer.
describe('KaplanMeier.vue overlapping analytics queries', () => {
  // The dispatch wrapper adopts the action's promise, so the callback lands a few
  // microtasks after the response is resolved.
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  const deferred = () => {
    let resolve: (value: any) => void
    const promise = new Promise(r => {
      resolve = r
    })
    return { promise, resolve: resolve! }
  }

  // The shape KM builds for itself on a backend error, so processResponse handles it.
  // noDataReason keeps the callback off the rendering path; the count is written
  // either way, and the count is what is being tested.
  const response = (totalPatientCount: number) => ({
    data: [],
    measures: [],
    categories: [],
    totalPatientCount,
    noDataReason: 'MRI_PA_CHART_NO_DATA_DEFAULT_MESSAGE',
  })

  const mountChart = () => {
    const fireQuery = vi.fn()
    const setCurrentPatientCount = vi.fn()
    const store = createStore({
      state: { fireCount: 0 },
      mutations: {
        fire(state: any) {
          state.fireCount += 1
        },
      },
      getters: {
        getFireRequest: (state: any) => state.fireCount,
        isFireRequestHeld: () => false,
        getBookmarksData: () => ({ cards: ['c1'] }),
        getText: () => (key: string) => key,
        getKMDisplayInfo: () => () => ({ censoring: true, errorlines: 1 }),
        getSplitterWidth: () => ({}),
        getChartSize: () => ({}),
        getCsvFireDownload: () => false,
        getActiveChart: () => 'km',
        getActiveBookmark: () => ({ bookmarkname: 'cohort' }),
        getChartProperty: () => () => ({ props: { value: null } }),
        getKMFirstLoad: () => false,
        getMriFrontendConfig: () => ({}),
        translate: () => (key: string) => key,
      },
      actions: {
        fireQuery,
        setCurrentPatientCount,
        setAxisValue: vi.fn(),
        disableAllAxesandProperties: vi.fn(),
        setPdfChartReady: vi.fn(),
        setTicks: vi.fn(),
        setTicksData: vi.fn(),
        downloadCSV: vi.fn(),
        setFireRequest: vi.fn(),
        setKMLegends: vi.fn(),
        setKMFirstLoad: vi.fn(),
        completeDownloadCSV: vi.fn(),
        setChartPropertyValue: vi.fn(),
      },
    })

    const wrapper = shallowMount(km as any, {
      global: { plugins: [store], directives: { 'mouse-scroll': mouseScroll } },
    })

    const counts = () => setCurrentPatientCount.mock.calls.map(call => call[1].currentPatientCount)

    return { wrapper, store, fireQuery, counts }
  }

  it('ignores a response that arrives after a newer query was fired', async () => {
    const { wrapper, store, fireQuery, counts } = mountChart()
    const first = deferred()
    const second = deferred()
    fireQuery.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    store.commit('fire')
    await wrapper.vm.$nextTick()
    store.commit('fire')
    await wrapper.vm.$nextTick()

    second.resolve(response(1275))
    await flush()
    first.resolve(response(4102))
    await flush()

    expect(counts()).not.toContain(4102)
    expect(counts()).toContain(1275)
  })

  it('cancels the in-flight query when a newer one is fired', async () => {
    const { wrapper, store, fireQuery } = mountChart()
    fireQuery.mockReturnValue(deferred().promise)

    store.commit('fire')
    await wrapper.vm.$nextTick()
    store.commit('fire')
    await wrapper.vm.$nextTick()

    // Both requests carry a cancel token, and firing the second cancels the first —
    // otherwise the dropped response is still paid for on the server.
    const tokens = fireQuery.mock.calls.map(call => call[1].cancelToken)
    expect(tokens.filter(Boolean)).toHaveLength(2)
    expect(tokens[0].reason?.message).toBe('cancel')
  })
})
