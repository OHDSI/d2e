// tslint:disable:no-shadowed-variable
import ChartConfigService from '../../lib/ChartConfigService'
import MriFrontEndConfig from '../../lib/MriFrontEndConfig'
import * as types from '../mutation-types'
import { usePortalContext } from '@/composables/usePortalContext'
import { useNotificationStore } from '../../stores/notifications'

let chartConfigServiceInstance
// let mriFrontendConfigInstance;
let configRequestPromise: Promise<any> | null = null
const analyticsEndpoint = '/analytics-svc/pa/services/analytics.xsjs'

// initial state
const state = {
  mriFrontendConfigInstance: null,
  chartConfigServiceInstance: null,
  mriconfig: {
    meta: {
      configId: '',
      configName: '',
    },
  },
  assignments: [],
  configSelection: {
    show: false,
  },
  hasAssignedConfig: false,
  selectedDatasetId: {},
  selectedDatasetVersion: '',
  // The data sources this user can read, from /d2e-webapi/source/sources. Held
  // only to turn a dataset id into a name for display: `setDataset` commits
  // `{ id }` and nothing else, so the id is all the app otherwise knows.
  dataSources: [],
}

// default release version
const defaultRelease = {
  id: 0,
  name: 'Select Release',
  releaseDate: '',
}

// getters
const getters = {
  getMriConfig: state => state.mriconfig,
  getConfigSelectionDialogState: state => state.configSelection,
  getMriFrontendConfig: state => state.mriFrontendConfigInstance,
  getChartConfigService: state => state.chartConfigServiceInstance,
  getConfigs: state => state.assignments,
  getHasAssignedConfig: state => state.hasAssignedConfig,
  getSelectedPAConfigId: state => state.mriconfig.meta.configId,
  getSelectedDataset: state => state.selectedDataset,
  getSelectedDatasetVersion: state => state.selectedDatasetVersion,
  getDataSources: state => state.dataSources,
  /**
   * The active data source's display name, or its id when the name is not
   * known yet.
   *
   * The id is a UUID, so it is not something to show a user. It stays as the
   * fallback rather than an empty string, because the source list is fetched
   * asynchronously and can legitimately fail — an id reads badly but still
   * tells the user which source they are on.
   */
  getSelectedDatasetName: state => {
    const id = state.selectedDataset?.id
    if (!id) return ''
    const match = state.dataSources.find(source => source.sourceKey === id)
    return match?.sourceName || id
  },
}

// actions
const actions = {
  requestMriConfig({ dispatch, commit, rootGetters }) {
    if (configRequestPromise) {
      return configRequestPromise
    }
    // Skip fetch while no dataset is selected yet — the backend endpoint
    // requires datasetId/tokenDatasetCode and returns 400 otherwise. The
    // dataset change watcher re-fires this action once a real id arrives.
    if (!rootGetters.getSelectedDataset?.id) {
      console.debug('[config] requestMriConfig skipped: no datasetId yet')
      return Promise.resolve(null)
    }
    const processData = aData => {
      if (aData.length === 0) {
        // there is no config assigned
        // show error message in ui
        useNotificationStore().setFatalMessage({
          message: rootGetters.getText('MRI_PA_NO_CONFIG_ASSIGNED'),
        })
        commit(types.CONFIG_SET_HAS_ASSIGNED, false)
      } else if (aData.length > 1) {
        commit(types.CONFIG_SET_LIST, aData)
        commit(types.CONFIG_SET_CONFIG_SELECTION, { show: true })
        commit(types.CONFIG_SET_HAS_ASSIGNED, false)
      } else if (aData.length === 1) {
        aData[0].selected = true
        dispatch('setupFrontendConfig', aData[0])
        dispatch('resetChartProperties')
        commit(types.CONFIG_SET, aData[0])
        commit(types.CONFIG_SET_HAS_ASSIGNED, true)
      }
    }
    commit(types.CONFIG_SET_HAS_ASSIGNED, false)
    configRequestPromise = dispatch('ajaxAuth', {
      method: 'get',
      url: `${analyticsEndpoint}?action=getMyConfig${
        rootGetters.getSelectedDataset.id ? `&datasetId=${rootGetters.getSelectedDataset.id}` : ''
      }`,
    })
      .then(response => {
        const aData = response.data
        processData(aData)
        return aData[0]
      })
      .finally(() => {
        configRequestPromise = null
      })
    return configRequestPromise
  },
  setupFrontendConfig({ dispatch, commit }, config) {
    MriFrontEndConfig.createFrontendConfig(config)
    const mriFrontendConfigInstance = MriFrontEndConfig.getFrontendConfig()
    chartConfigServiceInstance = new ChartConfigService(MriFrontEndConfig.getFrontendConfig())
    commit(types.CONFIG_SET_ALL, {
      mriFrontendConfigInstance,
      chartConfigServiceInstance,
    })
  },
  requestConfigList({ dispatch, commit }, datasetId) {
    return dispatch('ajaxAuth', {
      method: 'get',
      url: `${analyticsEndpoint}?action=getMyConfigList${datasetId ? `&datasetId=${datasetId}` : ''}`,
    }).then(response => {
      commit(types.CONFIG_SET_LIST, response.data)
    })
  },
  requestFrontendConfig({ dispatch, commit }, { configId, configVersion }) {
    commit(types.CONFIG_SET_HAS_ASSIGNED, false)
    return dispatch('ajaxAuth', {
      url: analyticsEndpoint,
      params: {
        configId,
        configVersion,
        action: 'getFrontendConfig',
      },
    }).then(response => {
      dispatch('queryReset')
      dispatch('setupFrontendConfig', response.data)
      dispatch('resetChartProperties')
      commit(types.CONFIG_SET, response.data)
      commit(types.CONFIG_SET_HAS_ASSIGNED, true)
    })
  },
  toggleConfigSelectionDialog({ state, commit }) {
    commit(types.CONFIG_SET_CONFIG_SELECTION, {
      show: !state.configSelection.show,
    })
  },
  clearDefault({ dispatch }) {
    return dispatch('ajaxAuth', {
      url: analyticsEndpoint,
      params: {
        action: 'clearDefault',
      },
    })
  },
  setDefault({ dispatch, commit }, { configId, configVersion }) {
    return dispatch('ajaxAuth', {
      url: analyticsEndpoint,
      params: {
        configId,
        configVersion,
        action: 'setDefault',
      },
    })
  },
  setDataset({ commit }, dataset) {
    const datasetId = usePortalContext().datasetId
    commit(types.SET_SELECTED_DATASET, { id: datasetId })
  },
  setDatasetReleaseId({ commit }) {
    const releaseId = usePortalContext().releaseId
    commit(types.SET_SELECTED_DATASET_RELEASE_ID, releaseId)
  },
  /**
   * Fetch the data sources, so a dataset id can be shown as its name.
   *
   * `/d2e-webapi` rather than `/WebAPI`. Both return the same
   * `sourceKey` to `sourceName` mapping, and `sourceKey` is the dataset id
   * this app already holds, but `/d2e-webapi` is the base every live call in
   * this application already uses, so its auth is proven in both the portal
   * and the Atlas mount. `/WebAPI` is called nowhere outside deprecated code,
   * and it answers an unauthorised request with `200 []` rather than a 401 —
   * a silent empty list is a worse failure for a name lookup than a loud one.
   *
   * Failure is not surfaced to the user. The name is decoration; the getter
   * falls back to the id, and nothing else depends on this list.
   */
  async fireGetDataSources({ commit, dispatch }) {
    try {
      const response = await dispatch('ajaxAuth', {
        method: 'get',
        url: '/d2e-webapi/source/sources',
      })
      commit(types.SET_DATA_SOURCES, Array.isArray(response?.data) ? response.data : [])
    } catch (error) {
      console.error('[config] Could not load the data sources; names fall back to ids', error)
    }
  },
}

// mutations
const mutations = {
  [types.CONFIG_SET](moduleState, mriconfig) {
    moduleState.mriconfig = mriconfig
  },
  [types.CONFIG_SET_CONFIG_SELECTION](moduleState, configSelection) {
    moduleState.configSelection = {
      ...moduleState.configSelection,
      ...configSelection,
    }
  },
  [types.CONFIG_SET_LIST](moduleState, list) {
    moduleState.assignments = list
  },
  [types.CONFIG_SET_HAS_ASSIGNED](moduleState, hasAssignedConfig) {
    moduleState.hasAssignedConfig = hasAssignedConfig
  },
  [types.SET_SELECTED_DATASET](moduleState, dataset) {
    moduleState.selectedDataset = dataset
  },
  [types.SET_DATA_SOURCES](moduleState, dataSources) {
    moduleState.dataSources = dataSources
  },
  [types.SET_SELECTED_DATASET_RELEASE_ID](moduleState, selectedDatasetReleaseId) {
    moduleState.selectedDatasetReleaseId = selectedDatasetReleaseId
  },
  [types.CONFIG_SET_ALL](moduleState, { mriFrontendConfigInstance, chartConfigServiceInstance }) {
    moduleState.mriFrontendConfigInstance = mriFrontendConfigInstance
    moduleState.chartConfigServiceInstance = chartConfigServiceInstance
  },
}

export default {
  state,
  getters,
  actions,
  mutations,
}
