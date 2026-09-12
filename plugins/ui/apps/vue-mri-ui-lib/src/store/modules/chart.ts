// tslint:disable:no-shadowed-variable
import axios from 'axios'
import Constants from '../../utils/Constants'
import * as types from '../mutation-types'
import QueryString from '../../utils/QueryString'

const CancelToken = axios.CancelToken
const csvEndpoints = {
  stacked: '/analytics-svc/api/services/population/csv/barchart',
  boxplot: '/analytics-svc/api/services/population/csv/boxplot',
  km: '/analytics-svc/api/services/population/csv/kaplanmeier',
  list: '/analytics-svc/api/services/population/csv/patientlist',
}

const zipEndpoints = {
  list: '/analytics-svc/api/services/datastream/patient',
}

// initial state
const state = {
  layout: {
    activeChart: '',
    width: 0,
    height: 0,
  },
  chartSize: {
    width: 0,
    height: 0,
  },
  pdfReady: false,

  // the chart where to trigger csv download
  csvFireDownload: '',
  csvDownloadCompleted: false,
  csvDownloadError: false,

  zipFireDownload: '',
  zipDownloadCompleted: false,
  zipDownloadError: false,
  columnsToInclude: 'SELECTED',

  // fire chart request
  fireRequest: false,
  // hold fire request during batch updates (e.g., applying required filters)
  fireRequestHeld: false,
  // tracks whether the right pane has ever been opened (used to avoid double setFireRequest on bookmark load)
  rightPaneMounted: false,

  // stacked bar chart display mode and overlay toggle
  barDisplayMode: 'stack',
  showDistributionOverlay: false,
  // saved X1 binsize and attributeId prior to entering Kernel Density Plot mode (for restoration)
  previousXAxisBinsize: null,
  previousXAxisAttributeId: null,
  // index into getAllAxes for the axis used to color bars (0 = x1, 1 = x2, null = none)
  colorAxisIndex: null as number | null,
  // true when colorAxisIndex was set by automatic default-selection (not by the
  // user or a restored bookmark). Used to avoid false-positive unsaved-changes.
  isColorAxisAutoDefaulted: false,
}

// Cancel tokens
let cancel
let cancelZIP

// Split columns Based on entities
const splitEntitiesByColumns = (columns: Array<{ configPath: string; order: string; seq: number }>) => {
  const entityColumns = {}
  columns.forEach((el: { configPath: string }) => {
    const configPathTokens = el.configPath.split('.')
    let entityKey
    if (configPathTokens[1] === 'attributes') {
      // If patient attributes
      entityKey = configPathTokens[0]
    } else if (configPathTokens[1] === 'interactions') {
      // If Interaction's attributes
      entityKey = configPathTokens[2]
    } else {
      throw new Error(`Invalid config path ${el.configPath}`)
    }

    entityColumns[entityKey] ? entityColumns[entityKey].push(el) : (entityColumns[entityKey] = [el])
  })
  return entityColumns
}

// getters
const getters = {
  getCSVDownloadCompleted: modulestate => modulestate.csvDownloadCompleted,
  getCSVDownloadError: modulestate => modulestate.csvDownloadError,
  getZIPDownloadCompleted: modulestate => modulestate.zipDownloadCompleted,
  getZIPDownloadError: modulestate => modulestate.zipDownloadError,
  getSplitterWidth: modulestate => modulestate.layout.width,
  getChartSize: modulestate => modulestate.chartSize,
  getPdfChartReady: modulestate => modulestate.pdfReady,
  getActiveChart: modulestate => modulestate.layout.activeChart,
  getAllChartConfigs: (state, getters, rootState, rootGetters) => {
    if (rootGetters.getMriFrontendConfig) {
      return {
        ...rootGetters.getMriFrontendConfig._internalConfig.chartOptions,
      }
    }
    return {}
  },
  getChartConfigFor: (state, getters, rootState, rootGetters) => chartId =>
    rootGetters.getChartConfigService.getChartConfigFor(chartId),
  getCsvFireDownload: modulestate => modulestate.csvFireDownload,
  getZipFireDownload: modulestate => modulestate.zipFireDownload,
  getFireRequest: modulestate => modulestate.fireRequest,
  isFireRequestHeld: modulestate => modulestate.fireRequestHeld,
  isRightPaneMounted: modulestate => modulestate.rightPaneMounted,
  getBarChartType: modulestate => modulestate.barDisplayMode,
  getShowDistributionOverlay: modulestate => modulestate.showDistributionOverlay,
  getColorAxisIndex: modulestate => modulestate.colorAxisIndex,
  getIsColorAxisAutoDefaulted: modulestate => modulestate.isColorAxisAutoDefaulted,
}

// actions
const actions = {
  triggerSplitterSize({ state, commit }) {
    const { width, height } = state.layout
    commit(types.SPLITTER_RESIZE, { height, width: width + 1 })
  },
  setSplitterSize({ commit }, dimension) {
    commit(types.SPLITTER_RESIZE, dimension)
  },
  setChartSize({ commit }, dimension) {
    commit(types.CHART_RESIZE, dimension)
  },
  setPdfChartReady({ commit }, pdfReady) {
    commit(types.PDF_READY, pdfReady)
  },
  setActiveChart({ commit, dispatch }, chartName) {
    dispatch('clearResponse')
    dispatch('clearCohortDefinitionResponse')
    commit(types.SWITCH_CHART, chartName)
  },
  cancelDownloadCSV({ dispatch }) {
    if (cancel) {
      dispatch('completeDownloadCSV')
      cancel('cancel')
    }
  },
  cancelDownloadZIP({ dispatch }) {
    if (cancelZIP) {
      dispatch('completeDownloadZIP')
      cancelZIP.abort()
    }
  },
  completeDownloadCSV({ commit }) {
    commit(types.CSV_DOWNLOAD_COMPLETED, { csvDownloadCompleted: true })
  },
  completeDownloadZIP({ commit }) {
    commit(types.ZIP_DOWNLOAD_COMPLETED, { downloadCompleted: true })
  },
  downloadCSV({ state, commit, dispatch, rootGetters }, additionalParameter) {
    if (!additionalParameter) {
      return Promise.reject(`mriquery is required ${state.layout.activeChart}`)
    }

    if (!(state.layout.activeChart in csvEndpoints)) {
      return Promise.reject(`No endpoint specified for the current chart ${state.layout.activeChart}`)
    }

    if (cancel) {
      cancel()
    }
    const cancelToken = new CancelToken(c => {
      cancel = c
    })
    const url = csvEndpoints[state.layout.activeChart]

    const hasReleaseDate = !!rootGetters.getSelectedDatasetVersion?.releaseDate

    const urlWithQuerystring = QueryString({
      url,
      queryString: {
        mriquery: JSON.stringify(additionalParameter),
        dataFormat: 'csv',
        ...(hasReleaseDate && { releaseDate: rootGetters.getSelectedDatasetVersion.releaseDate }),
        datasetId: rootGetters.getSelectedDataset.id,
      },
      compress: ['mriquery'],
    })

    return dispatch('ajaxAuth', {
      method: 'get',
      cancelToken,
      url: urlWithQuerystring,
    }).catch(err => {
      if (axios.isCancel(err)) {
        throw err
      }
      commit(types.CSV_DOWNLOAD_ERROR, { csvDownloadError: true })
      throw err
    })
  },
  downloadZIP({ state, dispatch, rootGetters }, additionalParameter) {
    const getAllColumns = () => {
      const updatedParameters = JSON.parse(JSON.stringify(additionalParameter))
      const interactionPaths = rootGetters.getColumnSelectionMenu.map(menu => menu.path).filter(path => path)
      const allInteractionAttributePaths = []
      interactionPaths.forEach((path: string) => {
        allInteractionAttributePaths.push(
          rootGetters.getColumnSelectionMenuByPath(path)?.subMenu.forEach(sm => {
            if (sm.data.oInternalConfigAttribute.type !== 'conceptSet') {
              allInteractionAttributePaths.push(sm.path)
            }
          })
        )
      })

      const allBasicAttributePaths = rootGetters.getMriFrontendConfig
        .getPatientListConfig()
        .getBasicDataCols()
        .attributes.map(attr => attr.sConfigPath)
      allInteractionAttributePaths.concat(allBasicAttributePaths)
      const allColumnPaths = allBasicAttributePaths.concat(allInteractionAttributePaths).filter(path => {
        if (!path) {
          return false
        }
        return true
      })
      updatedParameters.cohortDefinition.columns = allColumnPaths
        .map(path => {
          return {
            configPath: path,
            order: '',
            seq: 0,
          }
        })
        .filter(columnObj => columnObj.configPath)
      return updatedParameters
    }
    if (state.layout.activeChart in zipEndpoints) {
      // const fileStream = streamSaver.createWriteStream('archive.txt')

      if (cancelZIP) {
        cancelZIP.abort()
      }

      const cancelToken = (() => {
        cancelZIP = new AbortController()
        return cancelZIP
      })()

      let params
      let entityColumns

      if (state.layout.activeChart === 'list') {
        additionalParameter = state.columnsToInclude === 'SELECTED' ? additionalParameter : getAllColumns()
        params = rootGetters.getMriFrontendConfig.reverseTranslate({
          ...rootGetters.getRequest,
          ...additionalParameter,
        })
      } else {
        params = rootGetters.getBookmarksData
      }
      const url = zipEndpoints[state.layout.activeChart]
      try {
        entityColumns = splitEntitiesByColumns(params.cohortDefinition.columns)
      } catch (e) {
        return Promise.reject(e)
      }

      // Prepare Streaming request for each entity individually
      const requests = Object.keys(entityColumns).map(el => {
        const entityParams = JSON.parse(JSON.stringify(params))
        entityParams.cohortDefinition.columns = entityColumns[el]
        const hasReleaseDate = !!rootGetters.getSelectedDatasetVersion?.releaseDate

        return dispatch('ajaxFetchAuth', {
          options: {
            method: 'get',
            signal: cancelToken.signal,
          },
          url: QueryString({
            url,
            queryString: {
              mriquery: JSON.stringify(entityParams),
              dataFormat: 'csv',
              ...(hasReleaseDate && { releaseDate: rootGetters.getSelectedDatasetVersion.releaseDate }),
              datasetId: rootGetters.getSelectedDataset.id,
            },
            compress: ['mriquery'],
          }),
        })
          .then(response => {
            if (!response.ok) {
              throw { response: { status: response.status, data: {} } }
            }
            return { filename: `${el}.csv`, response }
          })
          .catch(err => {
            if (err?.response) {
              throw err.response
            }
            throw err
          })
      })

      return Promise.all(requests) // Will fire parallel requests for each entity
    }

    return Promise.reject(`No endpoint specified for the current chart ${state.layout.activeChart}`)
  },
  setFireDownloadCSV({ commit }) {
    commit(types.CSV_DOWNLOAD_COMPLETED, { csvDownloadCompleted: false })
    commit(types.CSV_DOWNLOAD_ERROR, { csvDownloadError: false })
    commit(types.CHART_CSV_DOWNLOAD, Math.random())
  },
  setFireDownloadZIP({ commit }, { columnsToInclude }) {
    commit(types.ZIP_DOWNLOAD_COMPLETED, { downloadCompleted: false })
    commit(types.ZIP_DOWNLOAD_ERROR, { zipDownloadError: false })
    commit(types.CHART_ZIP_DOWNLOAD, Math.random())
    commit(types.CHART_COLUMNS_TO_INCLUDE, columnsToInclude)
  },
  setZIPDownloadError({ commit }, zipDownloadError) {
    commit(types.ZIP_DOWNLOAD_ERROR, { zipDownloadError })
  },
  setInitialAxisSelection({ getters, dispatch, rootGetters }) {
    const mriFrontendConfig = rootGetters.getMriFrontendConfig
    const initialAxis = mriFrontendConfig.getInitialAxisSelection()
    for (let i = 0; i < Constants.MRIChartDimensions.Count; i += 1) {
      let filterCardId = ''
      let key = ''
      if (initialAxis && initialAxis[i] && initialAxis[i] !== 'hc.mri.pa.ui.lib.Selection.Invalid') {
        const axisValue = initialAxis[i].split('.')
        key = axisValue.pop()
        axisValue.pop()
        filterCardId = axisValue.join('.')
        const defaultBinSize = mriFrontendConfig.getAttributeByPath(initialAxis[i])?.getDefaultBinSize?.()

        dispatch('setAxisValue', {
          id: i,
          props: {
            key,
            filterCardId,
            attributeId: initialAxis[i],
            binsize: defaultBinSize ?? '',
          },
        })
      } else {
        dispatch('setAxisValue', {
          id: i,
          props: { key: '', filterCardId: '', attributeId: '', binsize: '' },
        })
      }
    }
  },
  setupChartDefaults({ dispatch, getters }) {
    // this should only be called once the filtercards are setup (and pa config is loaded as well)
    dispatch('setActiveChart', getters.getAllChartConfigs.initialChart)
    dispatch('setInitialAxisSelection')
  },
  setFireRequest({ commit, state }) {
    // Only trigger if fire is not being held (prevents intermediate requests during batch updates)
    if (!state.fireRequestHeld) {
      commit(types.CHART_SET_FIRE_REQUEST)
    }
  },
  setRightPaneMounted({ commit }, value: boolean) {
    commit(types.SET_RIGHT_PANE_MOUNTED, value)
  },
  setColorAxisIndex({ commit }, index: number | null) {
    commit(types.SET_COLOR_AXIS_INDEX, index)
    commit(types.SET_COLOR_AXIS_AUTO_DEFAULTED, false)
  },
  setDefaultColorAxisIndex({ commit }, index: number | null) {
    commit(types.SET_COLOR_AXIS_INDEX, index)
    commit(types.SET_COLOR_AXIS_AUTO_DEFAULTED, true)
  },
  holdFireRequest({ commit }) {
    commit(types.CHART_HOLD_FIRE_REQUEST)
  },
  releaseFireRequest({ commit }) {
    commit(types.CHART_RELEASE_FIRE_REQUEST)
  },
  async resetChart({ dispatch, getters }) {
    await dispatch('holdFireRequest')
    try {
      await dispatch('queryReset')
      await dispatch('resetChartProperties')
      const initialIFR = getters.getMriFrontendConfig.getInitialIFR()
      await dispatch('setIFRState', { ifr: initialIFR })
      await dispatch('setupChartDefaults')
    } finally {
      await dispatch('releaseFireRequest')
    }
    await dispatch('setFireRequest')
  },
  setBarChartType({ commit, dispatch, state, rootGetters }, modeId: string) {
    const previousMode = state.barDisplayMode
    const X1 = Constants.MRIChartDimensions.X1
    const X2 = Constants.MRIChartDimensions.X2
    let binsizeChanged = false
    let xAxisCleared = false

    // Resolve the active KDP x-axis slot: the non-disabled one when a slot is already
    // disabled, otherwise predict it by mirroring the disable logic below.
    const allAxesInit = rootGetters.getAllAxes
    const x1Init = allAxesInit?.[X1]
    const x2Init = allAxesInit?.[X2]
    const x1DisabledInit = !!x1Init?.props?.disabled
    const x2DisabledInit = !!x2Init?.props?.disabled
    let activeXSlot: number
    if (x1DisabledInit !== x2DisabledInit) {
      activeXSlot = x1DisabledInit ? X2 : X1
    } else {
      const x1HasSelection = !!(x1Init?.props?.filterCardId && x1Init?.props?.key)
      const x2HasSelection = !!(x2Init?.props?.filterCardId && x2Init?.props?.key)
      if (x1HasSelection && x2HasSelection) {
        const mriFrontendConfig = rootGetters.getMriFrontendConfig
        const x1Binnable = !!mriFrontendConfig?.getAttributeByPath(x1Init.props.attributeId)?.isBinnable?.()
        const x2Binnable = !!mriFrontendConfig?.getAttributeByPath(x2Init.props.attributeId)?.isBinnable?.()
        activeXSlot = x1Binnable && !x2Binnable ? X1 : X2
      } else if (x2HasSelection && !x1HasSelection) {
        activeXSlot = X2
      } else {
        activeXSlot = X1
      }
    }

    if (modeId === 'distribution' && previousMode !== 'distribution') {
      const xAxis = rootGetters.getAxis ? rootGetters.getAxis(activeXSlot) : null
      const currentBinsize = xAxis?.props?.binsize ?? null
      commit(types.SET_PREVIOUS_X_AXIS_BINSIZE, currentBinsize)
      commit(types.SET_PREVIOUS_X_AXIS_ATTRIBUTE_ID, xAxis?.props?.attributeId ?? null)
      if (currentBinsize !== 0) {
        dispatch('setAxisValue', { id: activeXSlot, props: { binsize: 0 } })
        binsizeChanged = true
      }
    } else if (previousMode === 'distribution' && modeId !== 'distribution') {
      const xAxis = rootGetters.getAxis ? rootGetters.getAxis(activeXSlot) : null
      const currentBinsize = xAxis?.props?.binsize ?? null
      const attributeId = xAxis?.props?.attributeId
      // Restore the saved binsize only if the attribute on the active slot is unchanged.
      const attributeMatches = attributeId && attributeId === state.previousXAxisAttributeId
      let restoreBinsize = attributeMatches ? state.previousXAxisBinsize : null
      if (restoreBinsize === null || restoreBinsize === undefined) {
        const mriFrontendConfig = rootGetters.getMriFrontendConfig
        if (attributeId && mriFrontendConfig) {
          const attrCfg = mriFrontendConfig.getAttributeByPath(attributeId)
          const defaultBin = attrCfg && attrCfg.getDefaultBinSize ? attrCfg.getDefaultBinSize() : undefined
          restoreBinsize = defaultBin === undefined || defaultBin === null ? '' : defaultBin
        } else {
          restoreBinsize = ''
        }
      }
      if (restoreBinsize !== currentBinsize) {
        dispatch('setAxisValue', { id: activeXSlot, props: { binsize: restoreBinsize } })
        binsizeChanged = true
      }
      commit(types.SET_PREVIOUS_X_AXIS_BINSIZE, null)
      commit(types.SET_PREVIOUS_X_AXIS_ATTRIBUTE_ID, null)
    }

    if (previousMode === 'stack' && modeId !== 'stack') {
      const allAxes = rootGetters.getAllAxes
      const x1Axis = allAxes?.[X1]
      const x2Axis = allAxes?.[X2]
      const x1HasSelection = !!(x1Axis?.props?.filterCardId && x1Axis?.props?.key)
      const x2HasSelection = !!(x2Axis?.props?.filterCardId && x2Axis?.props?.key)

      let targetId: number | null = null
      let needsClear = false

      if (x1HasSelection && x2HasSelection) {
        const mriFrontendConfig = rootGetters.getMriFrontendConfig
        const x1Binnable = !!mriFrontendConfig?.getAttributeByPath(x1Axis.props.attributeId)?.isBinnable?.()
        const x2Binnable = !!mriFrontendConfig?.getAttributeByPath(x2Axis.props.attributeId)?.isBinnable?.()
        if (!x1Binnable && x2Binnable) {
          targetId = X1
        } else if (x1Binnable && !x2Binnable) {
          targetId = X2
        } else {
          targetId = X1
        }
        needsClear = true
      } else if (x1HasSelection && !x2HasSelection) {
        targetId = X2
      } else if (!x1HasSelection && x2HasSelection) {
        targetId = X1
      } else {
        // When both X1 and X2 are empty, disable X2 by default
        targetId = X2
      }

      if (targetId !== null) {
        if (needsClear) {
          dispatch('clearAxisValue', targetId)
          xAxisCleared = true
        }
        dispatch('setAxisValue', { id: targetId, props: { disabled: true } })
      }
    } else if (previousMode !== 'stack' && modeId === 'stack') {
      dispatch('setAxisValue', { id: X1, props: { disabled: false } })
      dispatch('setAxisValue', { id: X2, props: { disabled: false } })
    }

    commit(types.SET_BAR_DISPLAY_MODE, modeId)

    if (binsizeChanged || xAxisCleared) {
      dispatch('setFireRequest')
    }
  },
  setShowDistributionOverlay({ commit }, value: boolean) {
    commit(types.SET_SHOW_DISTRIBUTION_OVERLAY, value)
  },
}

// mutations
const mutations = {
  [types.SPLITTER_RESIZE](modulestate, { width, height }) {
    modulestate.layout.width = width
    modulestate.layout.height = height
  },
  [types.CSV_DOWNLOAD_COMPLETED](modulestate, { csvDownloadCompleted }) {
    modulestate.csvDownloadCompleted = csvDownloadCompleted
  },
  [types.CSV_DOWNLOAD_ERROR](modulestate, { csvDownloadError }) {
    modulestate.csvDownloadError = csvDownloadError
  },
  [types.ZIP_DOWNLOAD_COMPLETED](modulestate, { downloadCompleted }) {
    modulestate.zipDownloadCompleted = downloadCompleted
  },
  [types.ZIP_DOWNLOAD_ERROR](modulestate, { zipDownloadError }) {
    modulestate.zipDownloadError = zipDownloadError
  },
  [types.PDF_READY](modulestate, pdfReady) {
    modulestate.pdfReady = pdfReady
  },
  [types.CHART_RESIZE](modulestate, dimension) {
    const newSizeObj = {
      width: dimension.width,
      height: dimension.height,
    }
    modulestate.chartSize = newSizeObj
  },
  [types.SWITCH_CHART](modulestate, chartName) {
    modulestate.layout.activeChart = chartName
  },
  [types.CHART_CSV_DOWNLOAD](modulestate, fireDownload) {
    modulestate.csvFireDownload = fireDownload
  },
  [types.CHART_ZIP_DOWNLOAD](modulestate, fireDownload) {
    modulestate.zipFireDownload = fireDownload
  },
  [types.CHART_SET_FIRE_REQUEST](modulestate) {
    modulestate.fireRequest = !modulestate.fireRequest
  },
  [types.CHART_HOLD_FIRE_REQUEST](modulestate) {
    modulestate.fireRequestHeld = true
  },
  [types.CHART_RELEASE_FIRE_REQUEST](modulestate) {
    modulestate.fireRequestHeld = false
  },
  [types.CHART_COLUMNS_TO_INCLUDE](modulestate, columnsToInclude) {
    modulestate.columnsToInclude = columnsToInclude
  },
  [types.SET_RIGHT_PANE_MOUNTED](modulestate, value: boolean) {
    modulestate.rightPaneMounted = value
  },
  [types.SET_BAR_DISPLAY_MODE](modulestate, modeId: string) {
    modulestate.barDisplayMode = modeId
  },
  [types.SET_SHOW_DISTRIBUTION_OVERLAY](modulestate, value: boolean) {
    modulestate.showDistributionOverlay = value
  },
  [types.SET_PREVIOUS_X_AXIS_BINSIZE](modulestate, value) {
    modulestate.previousXAxisBinsize = value
  },
  [types.SET_PREVIOUS_X_AXIS_ATTRIBUTE_ID](modulestate, value) {
    modulestate.previousXAxisAttributeId = value
  },
  [types.SET_COLOR_AXIS_INDEX](modulestate, index: number | null) {
    modulestate.colorAxisIndex = index
  },
  [types.SET_COLOR_AXIS_AUTO_DEFAULTED](modulestate, value: boolean) {
    modulestate.isColorAxisAutoDefaulted = value
  },
}

export default {
  state,
  getters,
  actions,
  mutations,
}
