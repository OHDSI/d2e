// tslint:disable:no-shadowed-variable
import axios from 'axios'
import BMv2Parser from '../../lib/bookmarks/BMv2Parser'
import Constants from '../../utils/Constants'
import * as types from '../mutation-types'
import isEqual from 'lodash/isEqual'
import { useNotificationStore } from '../../stores/notifications'
import {
  formatBookmark,
  formatCohortDefinition,
  formatAtlasCohortDefinition,
  processBookmarksData,
} from '@/utils/BookmarkUtils'
import { getEffectiveBarChartMode, modeOrder } from '@/components/StackBarModes/modes'

const CancelToken = axios.CancelToken
// initial state
const state = {
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
  activeBookmarkBaseline: null as any,
}

const bookmarkURL = '/analytics-svc/api/services/bookmark'
const webApiCohortDefinitionURL = '/d2e-webapi/cohortdefinition'

// getters
const getters = {
  getBookmarksLoading: modulestate => modulestate.loading,
  getBookmarksLoadError: modulestate => modulestate.loadError,
  getBookmarks: modulestate => modulestate.bookmarks,
  getCanDatasetMaterializeCohorts: modulestate => modulestate.canDatasetMaterializeCohorts,
  getIsRestoringBookmark: modulestate => modulestate.isRestoringBookmark,
  getActiveBookmarkBaseline: modulestate => modulestate.activeBookmarkBaseline,
  getFilterSummaryVisibility: modulestate => modulestate.filterSummaryVisible,
  getSchemaName: modulestate => modulestate.schemaName,
  getAddNewCohort: modulestate => modulestate.addNewCohort,
  getBookmarksData: (modulestate, moduleGetters, rootState, rootGetters) => {
    let filter = JSON.parse(JSON.stringify(rootGetters.getBookmarkFromIFR))

    if (Object.keys(filter).length === 0) {
      return {}
    }
    const chartType = rootGetters.getActiveChart

    if (chartType === 'list') {
      const resultDefinition = rootGetters.getPLModel.resultDefinition
      if (resultDefinition) {
        filter = {
          ...filter,
          ...resultDefinition,
        }
      }
    }

    if (chartType === 'stacked') {
      const sortProperty = rootGetters.getChartProperty(Constants.MRIChartProperties.Sort)
      if (sortProperty && sortProperty.props && sortProperty.props.value) {
        filter.sort = sortProperty.props.value
      }
    }

    if (chartType === 'km') {
      const kmStartEvent = rootGetters.getChartProperty(Constants.MRIChartProperties.KMStartEvent)
      if (kmStartEvent && kmStartEvent.props && kmStartEvent.props.value) {
        filter.selected_event = {
          key: kmStartEvent.props.value.kmEventIdentifier,
        }
        filter.selected_start_event_occ = {
          key: kmStartEvent.props.value.kmStartEventOccurence,
        }
      }

      const kmEndEvent = rootGetters.getChartProperty(Constants.MRIChartProperties.KMEndEvent)
      if (kmEndEvent && kmEndEvent.props && kmEndEvent.props.value) {
        filter.selected_end_event = {
          key: kmEndEvent.props.value.kmEndEventIdentifier,
        }
        filter.selected_end_event_occ = {
          key: kmEndEvent.props.value.kmEndEventOccurence,
        }
      }

      const displayInfo = rootGetters.getKMDisplayInfo

      filter.errorlines = displayInfo.errorlines
      filter.censoring = displayInfo.censoring
    }

    const allAxes = rootGetters.getAllAxes
    const axisSelection = []
    const axisId = ['x1', 'x2', 'x3', 'x4', 'y1']
    for (let i = 0; i < allAxes.length; i += 1) {
      const axisInfo = {
        attributeId: 'n/a',
        binsize: 'n/a',
        categoryId: axisId[i],
      }
      if (allAxes[i].props.filterCardId && allAxes[i].props.key) {
        axisInfo.attributeId = allAxes[i].props.attributeId

        axisInfo.binsize =
          allAxes[i].props.binsize === ''
            ? (rootGetters.getMriFrontendConfig.getAttributeByPath(axisInfo.attributeId).getDefaultBinSize() ?? 'n/a')
            : allAxes[i].props.binsize
      }
      axisSelection.push(axisInfo)
    }

    const metadata = { version: 3 }

    const data: any = {
      filter,
      chartType,
      axisSelection,
      metadata,
      datasetId: rootGetters.getSelectedDataset.id,
    }
    // Add stacked-bar-only fields (barChartType, colorAxis) only when relevant.
    if (chartType === 'stacked') {
      data.barChartType = {
        mode: rootGetters.getBarChartType,
        showDistributionOverlay: rootGetters.getShowDistributionOverlay,
      }
      const colorAxisStoreIndex = rootGetters.getColorAxisIndex
      data.colorAxis =
        colorAxisStoreIndex !== null && allAxes[colorAxisStoreIndex]?.props?.attributeId
          ? allAxes[colorAxisStoreIndex].props.attributeId
          : null
    }
    return data
  },
  getBookmarkById: modulestate => bmkId =>
    JSON.parse(modulestate.bookmarks.find(b => b.bmkId === bmkId).bookmark || '{}'),
  getActiveBookmark: modulestate => modulestate.activeBookmark,
  getActiveCohortMaterializedId: modulestate => {
    // Get materializedCohortId from active bookmark's cohortDefinitionId
    if (!modulestate.activeBookmark?.cohortDefinitionId) {
      return null
    }
    const materializedCohort = modulestate.materializedCohorts.find(
      mc => mc.id === modulestate.activeBookmark.cohortDefinitionId
    )
    return materializedCohort?.id || null
  },
  getMaterializedCohorts: modulestate => modulestate.materializedCohorts,
  getBookmark: modulestate => bmkId => modulestate.bookmarks.find(b => b.bmkId === bmkId),
  getBookmarkByNameAndUsername: modulestate => (name, username) => {
    return modulestate.bookmarks.find(b => b.bookmarkname === name && b.user_id === username)
  },
  // rootState and rootGetters are used by the overlapping-histogram-2 branch for barChartType comparison
  getCurrentBookmarkHasChanges: (modulestate, moduleGetters, rootState, rootGetters) => {
    if (modulestate.activeBookmark == null) {
      return false
    }
    // While restoring a bookmark, suppress change detection until the restore is complete.
    if (modulestate.isRestoringBookmark) {
      return false
    }
    // A colorAxis that was set by automatic default-selection (not by the user
    // or a restored bookmark) must not count as a change: opening a bookmark
    // saved with colorAxis = null auto-picks a color axis after the chart loads.
    //
    // The auto value can leak into EITHER side of the comparison depending on
    // timing: if onChartDataReady fires after the baseline snapshot the baseline
    // holds null, but if it fires before (e.g. cached data on re-open) the
    // baseline holds the auto value. Normalize BOTH sides so the comparison is
    // invariant to that timing. A user-chosen colorAxis keeps
    // isColorAxisAutoDefaulted false and is still compared.
    const colorAxisAutoDefaulted = Boolean(rootGetters.getIsColorAxisAutoDefaulted)
    const normalizeColorAxis = (data: any) =>
      colorAxisAutoDefaulted && data && typeof data === 'object' && 'colorAxis' in data
        ? { ...data, colorAxis: null }
        : data
    const currentData = moduleGetters.getBookmarksData
    const normalizedCurrentData = normalizeColorAxis(currentData)

    // For bookmarks without saved data (new/deep-link/Atlas), compare against the captured baseline.
    // For saved bookmarks we also capture a baseline after restore so that auto-defaulted
    // fields (e.g. colorAxis) do not cause false-positive dirty state.
    const baseline = modulestate.activeBookmarkBaseline
    if (baseline != null) {
      return !isEqual(normalizedCurrentData, normalizeColorAxis(baseline))
    }
    if (!modulestate.activeBookmark.bookmark) {
      // No saved JSON and no baseline: this bookmark came from an external
      // source (deep link / Atlas import) and has never been saved as a PA
      // bookmark. Treat it as always dirty so navigation prompts until saved.
      // Contrast with addNewCohort, which captures a baseline immediately so
      // an unmodified new cohort correctly reports clean.
      return true
    }
    const bookmark = JSON.parse(modulestate.activeBookmark.bookmark)
    const newBookmarksFilter = moduleGetters.getBookmarksData.filter
    const currentBookmarksFilter = bookmark?.filter
    const newBookmarksAxisSelection = moduleGetters.getBookmarksData.axisSelection
    const currentBookmarksAxisSelection = bookmark?.axisSelection
    // Only compare barChartType for stacked-bar bookmarks.
    // Normalize both sides consistently:
    //   - Disabled modes fall back to 'stack' (handled above).
    //   - showDistributionOverlay is forced to false when the effective mode
    //     does not support distribution overlays, matching the behaviour in
    //     _loadParsedBookmarkToState. This prevents false-positive dirty state
    //     when a saved overlay-capable mode is disabled by the current config.
    let barChartTypeChanged = false
    if (bookmark?.chartType === 'stacked') {
      const mriFrontendConfig = rootGetters.getMriFrontendConfig
      const defaultBarChartType = { mode: 'stack', showDistributionOverlay: false }
      const newRaw = moduleGetters.getBookmarksData.barChartType ?? defaultBarChartType
      const curRaw = bookmark?.barChartType ?? defaultBarChartType

      const newEffectiveMode = getEffectiveBarChartMode(newRaw.mode, mriFrontendConfig)
      const curEffectiveMode = getEffectiveBarChartMode(curRaw.mode, mriFrontendConfig)
      const newEffectiveModeMeta = modeOrder.find(m => m.id === newEffectiveMode)
      const curEffectiveModeMeta = modeOrder.find(m => m.id === curEffectiveMode)

      barChartTypeChanged = !isEqual(
        {
          mode: newEffectiveMode,
          showDistributionOverlay: newEffectiveModeMeta?.hasDistributionOverlay && !!newRaw.showDistributionOverlay,
        },
        {
          mode: curEffectiveMode,
          showDistributionOverlay: curEffectiveModeMeta?.hasDistributionOverlay && !!curRaw.showDistributionOverlay,
        }
      )
    }
    const newColorAxis = colorAxisAutoDefaulted ? null : moduleGetters.getBookmarksData.colorAxis ?? null
    const currentColorAxis = bookmark?.colorAxis ?? null
    return (
      !isEqual(newBookmarksFilter, currentBookmarksFilter) ||
      !isEqual(newBookmarksAxisSelection, currentBookmarksAxisSelection) ||
      barChartTypeChanged ||
      newColorAxis !== currentColorAxis
    )
  },
  getDisplayBookmarks: modulestate => (showSharedBookmarks, username) => {
    try {
      const bookmarks: FormattedBookmark[] = modulestate.bookmarks
      const materializedCohorts: FormattedMaterializedCohort[] = modulestate.materializedCohorts
      const atlasCohortDefinitions: FormattedAtlasCohortDefinition[] = modulestate.atlasCohortDefinitions

      let displayBookmarks = []

      // cohort definitions without bookmark
      // cohort definitions with bookmark
      materializedCohorts.forEach(cohortDefinition => {
        // displayBookmarkDateFormat expects ISO String
        cohortDefinition.createdOn = new Date(cohortDefinition.createdOn).toISOString()
        // check bookmark exists, if yes, should use the bookmark name
        const bookmark = bookmarks.find(
          bookmark =>
            bookmark?.cohortDefinitionId === cohortDefinition.id &&
            bookmark.bookmarkname === cohortDefinition?.cohortDefinitionName
        )
        const atlasCohortDefinition = atlasCohortDefinitions.find(cd => cd.cohortDefinitionId === cohortDefinition.id)
        if (!bookmark && !atlasCohortDefinition) {
          return displayBookmarks.push({
            displayName: cohortDefinition.cohortDefinitionName,
            bookmark: null,
            cohortDefinition: formatCohortDefinition(cohortDefinition),
          })
        }

        if (bookmark) {
          if (showSharedBookmarks && (username === bookmark.user_id || bookmark.shared)) {
            return displayBookmarks.push({
              displayName: bookmark.bookmarkname,
              bookmark: { ...formatBookmark(bookmark), disableUpdate: username !== bookmark.user_id },
              cohortDefinition: formatCohortDefinition(cohortDefinition),
            })
          } else if (!showSharedBookmarks && username === bookmark.user_id) {
            return displayBookmarks.push({
              displayName: bookmark.bookmarkname,
              bookmark: { ...formatBookmark(bookmark), disableUpdate: username !== bookmark.user_id },
              cohortDefinition: formatCohortDefinition(cohortDefinition),
            })
          }
        }
        if (atlasCohortDefinition) {
          displayBookmarks.push({
            displayName: atlasCohortDefinition.name,
            cohortDefinition: formatCohortDefinition(cohortDefinition),
            atlasCohortDefinition: formatAtlasCohortDefinition(atlasCohortDefinition),
          })
        }
      })

      // Atlas Cohort Definitions without a materialized cohort
      atlasCohortDefinitions
        .filter(cd => !materializedCohorts.find(mc => mc.id === cd.cohortDefinitionId))
        .forEach(cd => {
          displayBookmarks.push({
            displayName: cd.name,
            cohortDefinition: null,
            atlasCohortDefinition: formatAtlasCohortDefinition(cd),
          })
        })

      // bookmarks without a materialized cohort
      bookmarks.forEach(bookmark => {
        const materializedCohort = materializedCohorts.find(
          cohort => bookmark.bookmarkname === cohort?.cohortDefinitionName && cohort.id === bookmark?.cohortDefinitionId
        )

        if (materializedCohort) {
          return
        }

        if (showSharedBookmarks && (username === bookmark.user_id || bookmark.shared)) {
          return displayBookmarks.push({
            displayName: bookmark.bookmarkname,
            bookmark: { ...formatBookmark(bookmark), disableUpdate: username !== bookmark.user_id },
            cohortDefinition: null,
          })
        } else if (!showSharedBookmarks && username === bookmark.user_id) {
          return displayBookmarks.push({
            displayName: bookmark.bookmarkname,
            bookmark: { ...formatBookmark(bookmark), disableUpdate: username !== bookmark.user_id },
            cohortDefinition: null,
          })
        }
      })

      return displayBookmarks
    } catch (e) {
      console.error(e)
    }
  },
}

const actions = {
  setAddNewCohort({ commit }, { addNewCohort }) {
    commit(types.SET_ADD_NEW_COHORT, { addNewCohort })
  },
  fireBookmarkQuery({ state, commit, dispatch, rootGetters }, { method = 'post', params, bookmarkId, cancelToken, suppressToast }) {
    commit(types.SET_BOOKMARKS_LOADING, { loading: true })
    const isLoadAll = params.cmd === 'loadAll'
    const requestDatasetId = isLoadAll ? rootGetters.getSelectedDataset.id : ''
    if (isLoadAll && requestDatasetId !== state.bookmarksDatasetId) {
      commit(types.RESET_ALL_BOOKMARKS)
    }
    let url = ''
    if (isLoadAll) {
      url = `${webApiCohortDefinitionURL}?source=pa`
    } else {
      url = `${bookmarkURL}/${bookmarkId || ''}`
      params.paConfigId = rootGetters.getMriFrontendConfig.getPaConfigId()
      params.cdmConfigId = rootGetters.getMriFrontendConfig.getDatamodelConfigId()
      params.cdmConfigVersion = rootGetters.getMriFrontendConfig.getVersion()
      params.datasetId = rootGetters.getSelectedDataset.id
    }

    const dispatchOptions: {
      url: string
      method: string
      params: any
      cancelToken: typeof cancelToken
      datasetId?: string
    } = { url, method, params, cancelToken }
    if (isLoadAll) {
      dispatchOptions.datasetId = requestDatasetId
    }
    return dispatch('ajaxAuth', dispatchOptions)
      .then(({ data }) => {
        let toastMessage = ''
        if (isLoadAll) {
          if (rootGetters.getSelectedDataset.id !== requestDatasetId) {
            return data
          }
          commit(types.SET_BOOKMARKS_LOAD_ERROR, { loadError: false })
          commit(types.RESET_ALL_BOOKMARKS)
          const { bookmarks, materializedCohorts, atlasCohortDefinitions } = processBookmarksData(
            data,
            rootGetters.getMriFrontendConfig.getPaConfigId()
          )
          const isAtlasEnabled = rootGetters.getMriFrontendConfig._internalConfig.panelOptions.atlasCohortDefinition
          commit(types.SET_BOOKMARKS, bookmarks)
          commit(types.SET_MATERIALIZED_COHORTS, materializedCohorts)
          if (isAtlasEnabled) {
            commit(types.SET_ATLAS_COHORT_DEFINITIONS, atlasCohortDefinitions)
          }
          commit(types.SET_BOOKMARKS_DATASET_ID, { datasetId: requestDatasetId })
        }
        if (params.cmd === 'delete') {
          toastMessage = rootGetters.getText('MRI_PA_DELETE_BMK_SUCCESS')
        } else if (params.cmd === 'update') {
          toastMessage = rootGetters.getText('MRI_PA_UPDATE_BMK_SUCCESS')
        } else if (params.cmd === 'rename') {
          toastMessage = rootGetters.getText('MRI_PA_RENAME_BMK_SUCCESS')
        } else if (params.cmd === 'insert') {
          toastMessage = rootGetters.getText('MRI_PA_SAVE_BMK_SUCCESS')
        }
        if (toastMessage && !suppressToast) {
          useNotificationStore().setToastMessage({
            text: toastMessage,
          })
        }
        return data
      })
      .catch(error => {
        if (isLoadAll && rootGetters.getSelectedDataset.id === requestDatasetId) {
          // Cohort list load failures surface as an in-list error state (see Bookmarks.vue).
          // Keep rethrowing so awaiting callers retain their current control flow.
          commit(types.SET_BOOKMARKS_LOAD_ERROR, { loadError: true })
        }
        let errorMessage = ''
        if (params.cmd === 'delete') {
          errorMessage = rootGetters.getText('MRI_PA_DELETE_BMK_ERROR')
        } else if (params.cmd === 'update') {
          errorMessage = rootGetters.getText('MRI_PA_UPDATE_BMK_ERROR')
        } else if (params.cmd === 'rename') {
          errorMessage = rootGetters.getText('MRI_PA_RENAME_BMK_ERROR')
        } else if (params.cmd === 'insert') {
          errorMessage = rootGetters.getText('MRI_PA_SAVE_BMK_ERROR')
        }
        if (errorMessage) {
          useNotificationStore().setAlertMessage({
            message: errorMessage,
          })
        }
        if (params.cmd === 'delete' || !errorMessage) {
          throw error
        }
      })
      .finally(() => {
        commit(types.SET_BOOKMARKS_LOADING, { loading: false })
      })
  },
  async refreshBookmarksForDatasetSwitch({ dispatch, rootGetters }) {
    // Non-blocking: buttons stay disabled until the check resolves and commits.
    dispatch('fireCheckIfDatasetCanMaterializeCohorts')
    await dispatch('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })

    const chartConfig = rootGetters.getAllChartConfigs
    if (chartConfig?.shared?.enabled) {
      await dispatch('loadSharedBookmarkList')
    }
  },
  setFilterSummaryVisibility({ commit }, { filterSummaryVisibility }) {
    commit(types.SET_FILTERSUMMARY, { filterSummaryVisibility })
  },
  /**
   * Load bookmark data directly to state (used by deep links)
   * Unlike loadbookmarkToState, this takes the parsed bookmark object directly
   */
  loadBookmarkDataToState({ commit, dispatch, getters, rootGetters }, { bookmark, chartType }) {
    commit(types.SET_IS_RESTORING_BOOKMARK, true)
    // Set a virtual active bookmark so the UI shows the cohort tab
    commit(types.SET_ACTIVE_BOOKMARK, {
      bookmarkname: 'Linked Cohort',
      bmkId: 'deep-link',
      isNew: true,
    })

    // Check if the chart type is changing - if so, the new chart will call setFireRequest on mount
    const currentActiveChart = rootGetters.getActiveChart
    const chartIsChanging = chartType && chartType !== currentActiveChart
    console.debug(
      '[Bookmark] loadBookmarkDataToState - currentChart:',
      currentActiveChart,
      'newChart:',
      chartType,
      'changing:',
      chartIsChanging
    )
    return dispatch('_loadParsedBookmarkToState', {
      parsedBookmark: bookmark,
      chartType,
      skipFireRequest: chartIsChanging,
    })
      .then(result => {
        // Do NOT capture a baseline for deep-link bookmarks. A deep link is
        // unsaved external work that has never been persisted as a PA bookmark,
        // so getCurrentBookmarkHasChanges should always report dirty (no baseline +
        // no .bookmark JSON → true). The user must explicitly save to clear dirty.
        return result
      })
      .finally(() => {
        commit(types.SET_IS_RESTORING_BOOKMARK, false)
      })
  },
  loadbookmarkToState({ commit, dispatch, getters, rootGetters }, { bmkId, chartType }) {
    commit(types.SET_IS_RESTORING_BOOKMARK, true)
    const parsedBookmark = getters.getBookmarkById(bmkId)
    const currentActiveChart = rootGetters.getActiveChart
    const chartIsChanging = chartType && chartType !== currentActiveChart
    const isRightPaneMounted = rootGetters.isRightPaneMounted

    commit(types.SET_ACTIVE_BOOKMARK, getters.getBookmark(bmkId))
    return dispatch('_loadParsedBookmarkToState', {
      parsedBookmark,
      chartType,
      skipFireRequest: chartIsChanging || !isRightPaneMounted,
    })
      .then(result => {
        // Capture the post-restore live state as the comparison baseline.
        // Saved bookmarks may omit keys that the app auto-defaults after load
        // (e.g. colorAxis), so comparing against the raw saved JSON produces
        // false-positive dirty state. The baseline reflects the normalized
        // state the user actually sees.
        commit(types.SET_ACTIVE_BOOKMARK_BASELINE, getters.getBookmarksData)
        return result
      })
      .finally(() => {
        commit(types.SET_IS_RESTORING_BOOKMARK, false)
      })
  },
  /**
   * Internal action to load a parsed bookmark to state
   * @param skipFireRequest - if true, don't call setFireRequest (chart will do it on mount)
   */
  _loadParsedBookmarkToState(
    { commit, dispatch, getters, rootGetters },
    { parsedBookmark, chartType, skipFireRequest = false }
  ) {
    // TODO: send API request to check Filter is compatible
    // if error "Show toast Message"
    console.debug('[Bookmark] Loading parsed bookmark to state:', parsedBookmark)
    let ifr
    try {
      ifr = BMv2Parser.convertBM2IFR(parsedBookmark.filter)
      console.debug('[Bookmark] BMv2Parser.convertBM2IFR result:', ifr)
    } catch (error) {
      console.error('[Bookmark] BMv2Parser.convertBM2IFR failed:', error)
      return Promise.reject(error)
    }
    return new Promise((resolve, reject) => {
      // When the right pane is already mounted, hold fire requests during the load to
      // suppress the intermediate setFireRequest call from the getBookmarkFromIFR watcher
      // (which reacts to setIFRState). We release the hold and fire once explicitly.
      //
      // When the right pane is NOT yet mounted (skipFireRequest = true), we must NOT hold:
      // StackBarChart.created() will fire setFireRequest on mount, and holding would block it
      // since the DOM update queued by SET_ACTIVE_BOOKMARK runs before .then() resolves.
      if (!skipFireRequest) {
        dispatch('holdFireRequest')
      }
      dispatch('setIFRState', { ifr })
        .then(() => {
          // Restore bar chart mode BEFORE axis restoration so that setNewAxisValue's KDP guard
          // (which forces X1 binsize=0 when getBarChartType === 'distribution') sees the
          // bookmark's mode, not the stale pre-load mode. Otherwise loading a stacked bookmark
          // over a KDP session would clobber the saved X1 binsize with 0, then leave it there
          // because the direct SET_BAR_DISPLAY_MODE commit below bypasses setBarChartType's
          // binsize-restoration path. If the saved mode is disabled by the current config,
          // fall back to 'stack'.
          const barChartType = parsedBookmark.barChartType ?? { mode: 'stack', showDistributionOverlay: false }
          const effectiveMode = getEffectiveBarChartMode(barChartType.mode, rootGetters.getMriFrontendConfig)
          commit(types.SET_BAR_DISPLAY_MODE, effectiveMode)
          // Clear the overlay flag when the effective mode does not support distribution overlays.
          // This prevents the Chart type menu showing a checked, disabled Distribution Curve option
          // when a saved overlay-capable mode is disabled by the current config and falls back to stack.
          const effectiveModeMeta = modeOrder.find(m => m.id === effectiveMode)
          const overlayAllowed = !!effectiveModeMeta?.hasDistributionOverlay
          commit(types.SET_SHOW_DISTRIBUTION_OVERLAY, overlayAllowed && !!barChartType.showDistributionOverlay)

          if (parsedBookmark.axisSelection) {
            for (let i = 0; i < 5; i += 1) {
              if (parsedBookmark.axisSelection[i].attributeId !== 'n/a') {
                const path = parsedBookmark.axisSelection[i].attributeId.split('.')
                const key = path.pop()
                path.pop()
                const filterCardId = path.join('.')
                dispatch('setNewAxisValue', {
                  id: i,
                  props: {
                    ...parsedBookmark.axisSelection[i],
                    key,
                    filterCardId,
                  },
                })
              } else {
                dispatch('clearAxisValue', i)
              }
            }
            // Chart Properties
            if (parsedBookmark.filter.sort) {
              dispatch('setChartPropertyValue', {
                id: Constants.MRIChartProperties.Sort,
                props: { value: parsedBookmark.filter.sort },
              })
            }
            if (parsedBookmark.filter.selected_event || parsedBookmark.filter.selected_start_event_occ) {
              const value = {
                kmEventIdentifier: parsedBookmark.filter.selected_event.key,
                kmStartEventOccurence: parsedBookmark.filter.selected_start_event_occ.key,
              }
              dispatch('setChartPropertyValue', {
                id: Constants.MRIChartProperties.KMStartEvent,
                props: { value },
              })
            }
            if (parsedBookmark.filter.selected_end_event || parsedBookmark.filter.selected_end_event_occ) {
              const value = {
                kmEndEventIdentifier: parsedBookmark.filter.selected_end_event.key,
                kmEndEventOccurence: parsedBookmark.filter.selected_end_event_occ.key,
              }
              dispatch('setChartPropertyValue', {
                id: Constants.MRIChartProperties.KMEndEvent,
                props: { value },
              })
            }
            dispatch('setKMFirstLoad', {
              firstLoad: {
                errorlines: parsedBookmark.filter.errorlines === true,
                censoring: parsedBookmark.filter.censoring === true,
              },
            })
            dispatch('setKMDisplayInfo', {
              displayInfo: {
                errorlines: parsedBookmark.filter.errorlines === true,
                censoring: parsedBookmark.filter.censoring === true,
              },
            })
          }
          if (parsedBookmark.filter.selected_attributes) {
            dispatch('initPLModelBookmark', {
              selected_attributes: parsedBookmark.filter.selected_attributes,
              sorting_directions: parsedBookmark.filter.sorting_directions,
              sorted_attributes: parsedBookmark.filter.sorted_attributes,
            })
          }
          // Reconcile X1/X2 'disabled' state with the restored mode: in non-stack modes
          // exactly one of X1/X2 is selectable, the empty one must be disabled. The axis
          // set/clear dispatches above don't manage 'disabled', and stale state may persist
          // across bookmark loads.
          const X1 = Constants.MRIChartDimensions.X1
          const X2 = Constants.MRIChartDimensions.X2
          const axisSel = parsedBookmark.axisSelection
          const x1HasSelection = !!(axisSel?.[X1]?.attributeId && axisSel[X1].attributeId !== 'n/a')
          const x2HasSelection = !!(axisSel?.[X2]?.attributeId && axisSel[X2].attributeId !== 'n/a')
          if (effectiveMode !== 'stack' && x1HasSelection && !x2HasSelection) {
            dispatch('setAxisValue', { id: X1, props: { disabled: false } })
            dispatch('setAxisValue', { id: X2, props: { disabled: true } })
          } else if (effectiveMode !== 'stack' && !x1HasSelection && x2HasSelection) {
            dispatch('setAxisValue', { id: X1, props: { disabled: true } })
            dispatch('setAxisValue', { id: X2, props: { disabled: false } })
          } else {
            dispatch('setAxisValue', { id: X1, props: { disabled: false } })
            dispatch('setAxisValue', { id: X2, props: { disabled: false } })
          }
          // Restore per-bar color axis from bookmark
          if ('colorAxis' in parsedBookmark) {
            if (parsedBookmark.colorAxis) {
              const restoredAxes = rootGetters.getAllAxes
              const colorAxisIndex = restoredAxes.findIndex(
                (axis: any) => axis?.props?.attributeId === parsedBookmark.colorAxis
              )
              dispatch('setColorAxisIndex', colorAxisIndex >= 0 ? colorAxisIndex : null)
            } else {
              dispatch('setColorAxisIndex', null)
            }
          }
          if (chartType) {
            // Guard: if the bookmark's saved chartType is not visible in the current config
            // (e.g. bar chart disabled, or bookmark from a different config), fall back to
            // a visible config-defined chart rather than opening a disabled chart.
            const frontendConfig = rootGetters.getMriFrontendConfig
            const isVisible = chart => !!chart && frontendConfig?.isChartVisible(chart)
            const initialChart = frontendConfig?.getInitialChart?.() ?? rootGetters.getAllChartConfigs.initialChart
            let effectiveChart
            if (isVisible(chartType)) {
              effectiveChart = chartType
            } else if (isVisible(initialChart)) {
              effectiveChart = initialChart
            }

            if (effectiveChart) {
              dispatch('setActiveChart', effectiveChart)
            }
          }
          if (!skipFireRequest) {
            // Release hold and fire — intermediate calls from getBookmarkFromIFR watcher
            // were suppressed while held; this is the single explicit fire.
            dispatch('releaseFireRequest')
            dispatch('setFireRequest')
          } else {
            // Even when skipFireRequest=true (e.g. right pane not mounted yet),
            // trigger one fire after IFR + axis selection restoration so the first
            // chart render uses restored axis selection rather than stale defaults.
            dispatch('setFireRequest')
          }
          resolve(null)
        })
        .catch(e => {
          console.log(e)
          if (!skipFireRequest) {
            dispatch('releaseFireRequest')
          }
          reject()
        })
    })
  },
  fireCheckIfDatasetCanMaterializeCohorts({ state, commit, dispatch, rootGetters }) {
    const currentDatasetId = rootGetters.getSelectedDataset.id
    // Skip if already loaded for this dataset
    if (state.canMaterializeCohortDatasetId === currentDatasetId && currentDatasetId) {
      return Promise.resolve()
    }
    return dispatch('ajaxAuth', {
      url: `/analytics-svc/api/services/cohort/can-materialize-cohort?datasetId=${currentDatasetId}`,
      method: 'GET',
    })
      .then(response => {
        // Ignore stale responses: the user may have switched datasets while this
        // non-blocking request was in flight.
        if (rootGetters.getSelectedDataset.id !== currentDatasetId) {
          return
        }
        commit(types.SET_CAN_DATASET_MATERIALIZE_COHORTS, {
          canDatasetMaterializeCohorts: response.data,
          datasetId: currentDatasetId,
        })
      })
      .catch(error => {
        console.error(error)
        useNotificationStore().setAlertMessage({
          message: rootGetters.getText('MRI_PA_CHECK_MATERIALIZE_COHORT_ERROR'),
        })
        // Upon error on api request, disable materialize cohort for dataset
        commit(types.SET_CAN_DATASET_MATERIALIZE_COHORTS, {
          canDatasetMaterializeCohorts: false,
          datasetId: '',
        })
      })
  },
}

// mutations
const mutations = {
  [types.SET_BOOKMARKS](modulestate, bookmarks) {
    modulestate.bookmarks = bookmarks
  },
  [types.SET_BOOKMARKS_LOADING](modulestate, { loading }) {
    modulestate.loading = loading
  },
  [types.SET_BOOKMARKS_LOAD_ERROR](modulestate, { loadError }) {
    modulestate.loadError = loadError
  },
  [types.SET_BOOKMARKS_DATASET_ID](modulestate, { datasetId }) {
    modulestate.bookmarksDatasetId = datasetId ?? ''
  },
  [types.SET_CAN_DATASET_MATERIALIZE_COHORTS](modulestate, { canDatasetMaterializeCohorts, datasetId }) {
    modulestate.canDatasetMaterializeCohorts = canDatasetMaterializeCohorts
    modulestate.canMaterializeCohortDatasetId = datasetId ?? ''
  },
  [types.SET_MATERIALIZED_COHORTS](modulestate, materializedCohorts) {
    modulestate.materializedCohorts = materializedCohorts ?? []
  },
  [types.SET_ATLAS_COHORT_DEFINITIONS](modulestate, atlasCohortDefinitions) {
    modulestate.atlasCohortDefinitions = atlasCohortDefinitions ?? []
  },
  [types.SET_FILTERSUMMARY](modulestate, { filterSummaryVisibility }) {
    modulestate.filterSummaryVisible = filterSummaryVisibility
  },
  [types.SET_SCHEMANAME](modulestate, { schemaName }) {
    modulestate.schemaName = schemaName
  },
  [types.SET_ACTIVE_BOOKMARK](modulestate, bookmark) {
    modulestate.activeBookmark = bookmark ? { ...bookmark, isNew: Boolean(bookmark.isNew) } : null
    modulestate.activeBookmarkBaseline = null
  },
  [types.SET_ACTIVE_BOOKMARK_BASELINE](modulestate, baseline) {
    modulestate.activeBookmarkBaseline = baseline
  },
  [types.SET_IS_RESTORING_BOOKMARK](modulestate, isRestoring) {
    modulestate.isRestoringBookmark = isRestoring
  },
  [types.SET_ADD_NEW_COHORT](modulestate, { addNewCohort }) {
    modulestate.addNewCohort = addNewCohort
  },
  [types.RESET_ALL_BOOKMARKS](modulestate) {
    modulestate.bookmarks = []
    modulestate.materializedCohorts = []
    modulestate.atlasCohortDefinitions = []
    modulestate.bookmarksDatasetId = ''
  },
  [types.RESET_DATASET_CACHE](modulestate) {
    modulestate.canDatasetMaterializeCohorts = false
    modulestate.canMaterializeCohortDatasetId = ''
  },
}

export default {
  state,
  getters,
  actions,
  mutations,
}
