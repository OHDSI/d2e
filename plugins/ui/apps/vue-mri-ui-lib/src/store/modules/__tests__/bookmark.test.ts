import { vi, describe, expect, it } from 'vitest'

vi.mock('axios')
vi.mock('@/stores/notifications', () => ({
  useNotificationStore: () => ({
    setToastMessage: vi.fn(),
    setAlertMessage: vi.fn(),
  }),
}))
vi.mock('@/store', () => ({
  default: {
    getters: {},
    dispatch: vi.fn(),
    commit: vi.fn(),
  },
}))
vi.mock('@/utils/BookmarkUtils', () => ({
  formatBookmark: vi.fn(bookmark => bookmark),
  formatCohortDefinition: vi.fn(cohortDefinition => cohortDefinition),
  formatAtlasCohortDefinition: vi.fn(atlasCohortDefinition => atlasCohortDefinition),
  processBookmarksData: vi.fn(() => ({ bookmarks: [], materializedCohorts: [], atlasCohortDefinitions: [] })),
}))

import bookmarkModule from '../bookmark'
import * as types from '../../mutation-types'

describe('store - bookmark', () => {
  describe('mutations', () => {
    let state: {
      bookmarks: any[]
      materializedCohorts: any[]
      atlasCohortDefinitions: any[]
      filterSummaryVisible: boolean
      schemaName: string
      activeBookmark: any
      addNewCohort: boolean
      loading: boolean
      loadError: boolean
      canDatasetMaterializeCohorts: boolean
      canMaterializeCohortDatasetId: string
      bookmarksDatasetId: string
      isRestoringBookmark: boolean
      activeBookmarkBaseline: any
    }

    beforeEach(() => {
      state = {
        bookmarks: [],
        materializedCohorts: [],
        atlasCohortDefinitions: [],
        filterSummaryVisible: false,
        schemaName: '',
        activeBookmark: null,
        addNewCohort: false,
        loading: false,
        loadError: false,
        canDatasetMaterializeCohorts: false,
        canMaterializeCohortDatasetId: '',
        bookmarksDatasetId: '',
        isRestoringBookmark: false,
        activeBookmarkBaseline: null,
      }
    })

    it('SET_ACTIVE_BOOKMARK sets new bookmark and resets baseline', () => {
      const bookmark = { bmkId: '123', bookmarkname: 'Test' }
      state.activeBookmarkBaseline = { filter: {} }
      bookmarkModule.mutations[types.SET_ACTIVE_BOOKMARK](state, bookmark)
      expect(state.activeBookmark).toEqual({ ...bookmark, isNew: false })
      expect(state.activeBookmarkBaseline).toBeNull()
    })

    it('SET_ACTIVE_BOOKMARK preserves properties when updating bookmarkname', () => {
      state.activeBookmark = {
        bmkId: '123',
        bookmarkname: 'Old Name',
        cohortDefinitionId: '456',
        bookmark: '{"filter":{}}',
      }

      bookmarkModule.mutations[types.SET_ACTIVE_BOOKMARK](state, {
        ...state.activeBookmark,
        bookmarkname: 'New Name',
      })

      expect(state.activeBookmark.bmkId).toBe('123')
      expect(state.activeBookmark.bookmarkname).toBe('New Name')
      expect(state.activeBookmark.cohortDefinitionId).toBe('456')
      expect(state.activeBookmark.bookmark).toBe('{"filter":{}}')
    })

    it('SET_ACTIVE_BOOKMARK clears baseline when null', () => {
      state.activeBookmarkBaseline = { filter: {} }
      state.activeBookmark = { bmkId: '123', bookmarkname: 'Test' }
      bookmarkModule.mutations[types.SET_ACTIVE_BOOKMARK](state, null)
      expect(state.activeBookmark).toBeNull()
      expect(state.activeBookmarkBaseline).toBeNull()
    })

    it('SET_ACTIVE_BOOKMARK_BASELINE stores the baseline data', () => {
      const baseline = { filter: { foo: 'bar' }, chartType: 'stacked' }
      bookmarkModule.mutations[types.SET_ACTIVE_BOOKMARK_BASELINE](state, baseline)
      expect(state.activeBookmarkBaseline).toEqual(baseline)
    })

    it('SET_BOOKMARKS_DATASET_ID records the dataset the cached list belongs to', () => {
      bookmarkModule.mutations[types.SET_BOOKMARKS_DATASET_ID](state, { datasetId: 'dataset-2' })
      expect(state.bookmarksDatasetId).toBe('dataset-2')
    })

    it('RESET_ALL_BOOKMARKS forgets which dataset the cached list belonged to', () => {
      state.bookmarks = [{ bmkId: '1' }]
      state.bookmarksDatasetId = 'dataset-1'
      bookmarkModule.mutations[types.RESET_ALL_BOOKMARKS](state)
      expect(state.bookmarks).toEqual([])
      expect(state.bookmarksDatasetId).toBe('')
    })

    it('SET_BOOKMARKS_LOAD_ERROR toggles the load error flag', () => {
      bookmarkModule.mutations[types.SET_BOOKMARKS_LOAD_ERROR](state, { loadError: true })
      expect(state.loadError).toBe(true)
      bookmarkModule.mutations[types.SET_BOOKMARKS_LOAD_ERROR](state, { loadError: false })
      expect(state.loadError).toBe(false)
    })
  })

  describe('getters', () => {
    describe('getCurrentBookmarkHasChanges', () => {
      const createConfig = (overrides = {}) => ({
        _internalConfig: {
          chartOptions: {
            stacked: {
              overlappingHistogramEnabled: true,
              kernelDensityPlotEnabled: true,
              partialOverlaySolidEnabled: true,
              ...overrides,
            },
          },
        },
      })

      const createState = () => ({
        bookmarks: [],
        materializedCohorts: [],
        atlasCohortDefinitions: [],
        filterSummaryVisible: false,
        schemaName: '',
        activeBookmark: null,
        addNewCohort: false,
        loading: false,
        canDatasetMaterializeCohorts: false,
        canMaterializeCohortDatasetId: '',
        isRestoringBookmark: false,
        activeBookmarkBaseline: null,
      })

      const callGetter = (state, moduleGetters, rootGetters) =>
        bookmarkModule.getters.getCurrentBookmarkHasChanges(state, moduleGetters, {}, rootGetters)

      it('returns false when baseline matches even if raw saved JSON differs (auto-defaulted colorAxis)', () => {
        const savedBookmark = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'stack', showDistributionOverlay: false },
          colorAxis: null,
        }
        const liveData = {
          ...savedBookmark,
          colorAxis: 'some.auto.defaulted.axis',
        }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(savedBookmark) }
        state.activeBookmarkBaseline = liveData
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig() }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(false)
      })

      it('returns true when baseline differs from live state for a saved bookmark', () => {
        const savedBookmark = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'stack', showDistributionOverlay: false },
          colorAxis: null,
        }
        const liveData = {
          ...savedBookmark,
          filter: { changed: true },
        }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(savedBookmark) }
        state.activeBookmarkBaseline = savedBookmark
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig() }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(true)
      })

      it('falls back to saved JSON comparison when no baseline exists', () => {
        const bookmarkData = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'stack', showDistributionOverlay: false },
          colorAxis: null,
        }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(bookmarkData) }
        const moduleGetters = { getBookmarksData: bookmarkData }
        const rootGetters = { getMriFrontendConfig: createConfig() }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(false)
      })

      it('returns false when a saved overlay mode is disabled by the current config', () => {
        const savedBookmark = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'overlay', showDistributionOverlay: true },
          colorAxis: null,
        }
        const liveData = {
          ...savedBookmark,
          barChartType: { mode: 'stack', showDistributionOverlay: false },
        }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(savedBookmark) }
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig({ overlappingHistogramEnabled: false }) }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(false)
      })

      it('returns true when overlay flag differs and the mode is enabled', () => {
        const savedBookmark = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'overlay', showDistributionOverlay: true },
          colorAxis: null,
        }
        const liveData = {
          ...savedBookmark,
          barChartType: { mode: 'overlay', showDistributionOverlay: false },
        }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(savedBookmark) }
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig() }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(true)
      })

      it('returns false when colorAxis was auto-defaulted over a null baseline', () => {
        const baseline = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'stack', showDistributionOverlay: false },
          colorAxis: null,
        }
        // The chart auto-picked a color axis after the baseline was captured.
        const liveData = { ...baseline, colorAxis: 'some.auto.defaulted.axis' }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(baseline) }
        state.activeBookmarkBaseline = baseline
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig(), getIsColorAxisAutoDefaulted: true }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(false)
      })

      it('returns true when colorAxis was chosen by the user over a null baseline', () => {
        const baseline = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'stack', showDistributionOverlay: false },
          colorAxis: null,
        }
        const liveData = { ...baseline, colorAxis: 'user.chosen.axis' }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(baseline) }
        state.activeBookmarkBaseline = baseline
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig(), getIsColorAxisAutoDefaulted: false }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(true)
      })

      it('returns false when the auto-defaulted colorAxis leaked into the baseline (re-open/cached race)', () => {
        // Re-open / navigate-back: onChartDataReady fired BEFORE the baseline was
        // captured, so the baseline holds the auto-selected colorAxis, not null.
        const baseline = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'stack', showDistributionOverlay: false },
          colorAxis: 'some.auto.defaulted.axis',
        }
        const liveData = { ...baseline }
        const state = createState()
        state.activeBookmark = {
          bmkId: '1',
          bookmarkname: 'Test',
          bookmark: JSON.stringify({ ...baseline, colorAxis: null }),
        }
        state.activeBookmarkBaseline = baseline
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig(), getIsColorAxisAutoDefaulted: true }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(false)
      })

      it('ignores auto-defaulted colorAxis in the saved-JSON fallback comparison', () => {
        const savedBookmark = {
          filter: {},
          chartType: 'stacked',
          axisSelection: [],
          datasetId: 'ds1',
          barChartType: { mode: 'stack', showDistributionOverlay: false },
          colorAxis: null,
        }
        const liveData = { ...savedBookmark, colorAxis: 'some.auto.defaulted.axis' }
        const state = createState()
        state.activeBookmark = { bmkId: '1', bookmarkname: 'Test', bookmark: JSON.stringify(savedBookmark) }
        // No baseline -> exercises the raw-JSON branch.
        const moduleGetters = { getBookmarksData: liveData }
        const rootGetters = { getMriFrontendConfig: createConfig(), getIsColorAxisAutoDefaulted: true }
        expect(callGetter(state, moduleGetters, rootGetters)).toBe(false)
      })
    })
  })

  describe('actions', () => {
    describe('fireBookmarkQuery', () => {
      const rootGetters = {
        getMriFrontendConfig: {
          getPaConfigId: () => 'pa-config-id',
          _internalConfig: { panelOptions: { atlasCohortDefinition: false } },
        },
        getSelectedDataset: { id: 'dataset-1' },
      }

      it("clears the load error when 'loadAll' succeeds", async () => {
        const commit = vi.fn()
        const dispatch = vi.fn().mockResolvedValue({ data: {} })
        await bookmarkModule.actions.fireBookmarkQuery(
          { state: { bookmarksDatasetId: 'dataset-1' }, commit, dispatch, rootGetters },
          { method: 'get', params: { cmd: 'loadAll' } }
        )
        expect(commit).toHaveBeenCalledWith(types.SET_BOOKMARKS_LOAD_ERROR, { loadError: false })
        expect(commit).toHaveBeenCalledWith(types.SET_BOOKMARKS_LOADING, { loading: true })
        expect(commit).toHaveBeenCalledWith(types.SET_BOOKMARKS_LOADING, { loading: false })
      })

      it("sets the load error and rethrows when 'loadAll' fails", async () => {
        const commit = vi.fn()
        const dispatch = vi.fn().mockRejectedValue(new Error('Network Error'))
        await expect(
          bookmarkModule.actions.fireBookmarkQuery(
            { state: { bookmarksDatasetId: 'dataset-1' }, commit, dispatch, rootGetters },
            { method: 'get', params: { cmd: 'loadAll' } }
          )
        ).rejects.toThrow('Network Error')
        expect(commit).toHaveBeenCalledWith(types.SET_BOOKMARKS_LOAD_ERROR, { loadError: true })
        expect(commit).toHaveBeenCalledWith(types.SET_BOOKMARKS_LOADING, { loading: false })
      })
    })

    describe('fireDuplicateBookmarkQuery', () => {
      const rootGetters = {
        getMriFrontendConfig: {
          getPaConfigId: () => 'pa-config-id',
          getDatamodelConfigId: () => 'cdm-config-id',
          getVersion: () => 'cdm-version',
        },
        getSelectedDataset: { id: 'dataset-1' },
      }

      it('posts to the duplicate sub-path with the new name and the config fields', async () => {
        const dispatch = vi.fn().mockResolvedValue({ data: {} })

        await bookmarkModule.actions.fireDuplicateBookmarkQuery(
          { dispatch, rootGetters },
          { bookmarkId: 'bmk-1', newName: 'SNRI Users (Copy)' }
        )

        expect(dispatch).toHaveBeenCalledWith('ajaxAuth', {
          url: '/analytics-svc/api/services/bookmark/bmk-1/duplicate',
          method: 'POST',
          params: {
            newName: 'SNRI Users (Copy)',
            paConfigId: 'pa-config-id',
            cdmConfigId: 'cdm-config-id',
            cdmConfigVersion: 'cdm-version',
            datasetId: 'dataset-1',
          },
        })
      })

      it('reloads the list after the copy is created', async () => {
        const dispatch = vi.fn().mockResolvedValue({ data: {} })

        await bookmarkModule.actions.fireDuplicateBookmarkQuery(
          { dispatch, rootGetters },
          { bookmarkId: 'bmk-1', newName: 'a copy' }
        )

        expect(dispatch).toHaveBeenNthCalledWith(2, 'fireBookmarkQuery', {
          method: 'get',
          params: { cmd: 'loadAll' },
        })
      })

      it('does not reload when the copy fails, and rethrows', async () => {
        // A reload after a failed duplicate would tell the user nothing changed
        // while hiding the reason, and the page's own error path never fires.
        const dispatch = vi.fn().mockRejectedValueOnce(new Error('Bookmark name cannot be empty'))

        await expect(
          bookmarkModule.actions.fireDuplicateBookmarkQuery(
            { dispatch, rootGetters },
            { bookmarkId: 'bmk-1', newName: '' }
          )
        ).rejects.toThrow('Bookmark name cannot be empty')

        expect(dispatch).toHaveBeenCalledTimes(1)
        expect(dispatch).not.toHaveBeenCalledWith('fireBookmarkQuery', expect.anything())
      })
    })

    const createDeferred = () => {
      let resolve!: (value?: any) => void
      let reject!: (reason?: any) => void
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }

    const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0))

    describe('fireBookmarkQuery - dataset switch', () => {
      const buildRootGetters = (datasetId: string) => ({
        getMriFrontendConfig: {
          getPaConfigId: () => 'pa-config-id',
          getDatamodelConfigId: () => 'cdm-config-id',
          getVersion: () => 'v1',
          _internalConfig: { panelOptions: { atlasCohortDefinition: false } },
        },
        getSelectedDataset: { id: datasetId },
        getText: (key: string) => key,
      })

      it("drops the cached list before the request when 'loadAll' targets a different dataset", async () => {
        const commit = vi.fn()
        const request = createDeferred()
        const dispatch = vi.fn(() => request.promise)

        const run = bookmarkModule.actions.fireBookmarkQuery(
          {
            state: { bookmarksDatasetId: 'dataset-1' },
            commit,
            dispatch,
            rootGetters: buildRootGetters('dataset-2'),
          },
          { method: 'get', params: { cmd: 'loadAll' } }
        )

        expect(commit).toHaveBeenCalledWith(types.RESET_ALL_BOOKMARKS)

        request.resolve({ data: {} })
        await run
      })

      it("keeps the cached list in place while 'loadAll' refreshes the same dataset", async () => {
        const commit = vi.fn()
        const request = createDeferred()
        const dispatch = vi.fn(() => request.promise)

        const run = bookmarkModule.actions.fireBookmarkQuery(
          {
            state: { bookmarksDatasetId: 'dataset-1' },
            commit,
            dispatch,
            rootGetters: buildRootGetters('dataset-1'),
          },
          { method: 'get', params: { cmd: 'loadAll' } }
        )

        expect(commit).not.toHaveBeenCalledWith(types.RESET_ALL_BOOKMARKS)

        request.resolve({ data: {} })
        await run
      })

      it('does not drop the cached list for non-loadAll commands', async () => {
        const commit = vi.fn()
        const dispatch = vi.fn().mockResolvedValue({ data: {} })

        await bookmarkModule.actions.fireBookmarkQuery(
          {
            state: { bookmarksDatasetId: 'dataset-1' },
            commit,
            dispatch,
            rootGetters: buildRootGetters('dataset-2'),
          },
          { method: 'post', params: { cmd: 'delete' }, bookmarkId: 'bmk-1' }
        )

        expect(commit).not.toHaveBeenCalledWith(types.RESET_ALL_BOOKMARKS)
      })

      it("stamps the dataset id when 'loadAll' succeeds", async () => {
        const commit = vi.fn()
        const dispatch = vi.fn().mockResolvedValue({ data: {} })

        await bookmarkModule.actions.fireBookmarkQuery(
          {
            state: { bookmarksDatasetId: '' },
            commit,
            dispatch,
            rootGetters: buildRootGetters('dataset-2'),
          },
          { method: 'get', params: { cmd: 'loadAll' } }
        )

        expect(commit).toHaveBeenCalledWith(types.SET_BOOKMARKS_DATASET_ID, { datasetId: 'dataset-2' })
      })

      it("ignores a 'loadAll' response when the dataset changed while it was in flight", async () => {
        const commit = vi.fn()
        const request = createDeferred()
        const dispatch = vi.fn(() => request.promise)
        const rootGetters = buildRootGetters('dataset-2')

        const run = bookmarkModule.actions.fireBookmarkQuery(
          { state: { bookmarksDatasetId: 'dataset-1' }, commit, dispatch, rootGetters },
          { method: 'get', params: { cmd: 'loadAll' } }
        )

        rootGetters.getSelectedDataset = { id: 'dataset-3' }
        request.resolve({ data: {} })
        await run

        expect(commit).not.toHaveBeenCalledWith(types.SET_BOOKMARKS, expect.anything())
        expect(commit).not.toHaveBeenCalledWith(types.SET_BOOKMARKS_DATASET_ID, { datasetId: 'dataset-2' })
      })

      it("still clears the loading flag when a 'loadAll' response is discarded as stale", async () => {
        const commit = vi.fn()
        const request = createDeferred()
        const dispatch = vi.fn(() => request.promise)
        const rootGetters = buildRootGetters('dataset-2')

        const run = bookmarkModule.actions.fireBookmarkQuery(
          { state: { bookmarksDatasetId: 'dataset-1' }, commit, dispatch, rootGetters },
          { method: 'get', params: { cmd: 'loadAll' } }
        )

        rootGetters.getSelectedDataset = { id: 'dataset-3' }
        request.resolve({ data: {} })
        await run

        expect(commit).toHaveBeenCalledWith(types.SET_BOOKMARKS_LOADING, { loading: false })
      })
    })

    describe('refreshBookmarksForDatasetSwitch', () => {
      it('does not block the cohort-definition load on the can-materialize-cohort check', async () => {
        const canMaterialize = createDeferred()
        const dispatched: string[] = []
        const dispatch = vi.fn((name: string) => {
          dispatched.push(name)
          if (name === 'fireCheckIfDatasetCanMaterializeCohorts') {
            return canMaterialize.promise
          }
          return Promise.resolve()
        })
        const rootGetters = { getAllChartConfigs: { shared: { enabled: false } } }

        let settled = false
        const run = bookmarkModule.actions
          .refreshBookmarksForDatasetSwitch({ dispatch, rootGetters })
          .then(() => {
            settled = true
          })

        await flushMicrotasks()

        expect(dispatched).toContain('fireCheckIfDatasetCanMaterializeCohorts')
        expect(dispatched).toContain('fireBookmarkQuery')
        expect(settled).toBe(true)

        canMaterialize.resolve()
        await run
      })
    })

    describe('fireCheckIfDatasetCanMaterializeCohorts', () => {
      const createAjaxDispatcher = () => {
        const request = createDeferred()
        const dispatch = vi.fn((name: string) => {
          if (name === 'ajaxAuth') {
            return request.promise
          }
          return Promise.resolve()
        })
        return { dispatch, request }
      }

      it('commits the result when the selected dataset is unchanged', async () => {
        const { dispatch, request } = createAjaxDispatcher()
        const commit = vi.fn()
        const state = { canMaterializeCohortDatasetId: '' }
        const rootGetters = { getSelectedDataset: { id: 'ds-1' }, getText: (key: string) => key }

        const run = bookmarkModule.actions.fireCheckIfDatasetCanMaterializeCohorts({
          state,
          commit,
          dispatch,
          rootGetters,
        })
        request.resolve({ data: true })
        await run

        expect(commit).toHaveBeenCalledWith(types.SET_CAN_DATASET_MATERIALIZE_COHORTS, {
          canDatasetMaterializeCohorts: true,
          datasetId: 'ds-1',
        })
      })

      it('ignores the result when the selected dataset changed before the response resolved', async () => {
        const { dispatch, request } = createAjaxDispatcher()
        const commit = vi.fn()
        const state = { canMaterializeCohortDatasetId: '' }
        const rootGetters = { getSelectedDataset: { id: 'ds-1' }, getText: (key: string) => key }

        const run = bookmarkModule.actions.fireCheckIfDatasetCanMaterializeCohorts({
          state,
          commit,
          dispatch,
          rootGetters,
        })
        rootGetters.getSelectedDataset = { id: 'ds-2' }
        request.resolve({ data: true })
        await run

        expect(commit).not.toHaveBeenCalled()
      })
    })
  })
})
