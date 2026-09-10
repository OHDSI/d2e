import * as types from '../mutation-types'
import StringToBinary from '@/utils/StringToBinary'
import QueryString from '@/utils/QueryString'
import { useNotificationStore } from '../../stores/notifications'


const state = {
  response: {},
}

const getters = {
  getCohortDefinitionResponse: modulestate => () => modulestate.response,
}

const actions = {
  clearCohortDefinitionResponse({ commit }) {
    commit(types.COHORT_DEFINITION_RESPONSE_SET, { response: {} })
  },
  cancelCohortDefinitionQuery() {
    // Callers are responsible for cancelling their own requests via cancelToken.
  },
  fireD2EToAtlasCohortDefinitionQuery({ commit, dispatch, getters, rootGetters }, { cancelToken } = {}) {

    const params = {
      datasetId: rootGetters.getSelectedDataset.id,
      mriquery: StringToBinary(JSON.stringify(rootGetters.getPLRequest({ bmkId: this.bookmarkId }))),
    }
    return dispatch('ajaxAuth', {
      url: '/analytics-svc/api/services/generate-cohort-definition',
      params,
      cancelToken,
    })
      .then(response => {
        if (response.data.noDataReason) {
          response.data.noDataReason = getters.getText(response.data.noDataReason)
        }
        commit(types.COHORT_DEFINITION_RESPONSE_SET, { response: { data: response.data } })
        return response.data
      })
      .catch(error => {
        commit(types.COHORT_DEFINITION_RESPONSE_SET, {
          response: {
            data: 'An error occurred',
          },
        })
        throw error
      })
  },
  fireCreateAtlasCohortDefinitionQuery({ commit, dispatch, getters, rootGetters }, { cancelToken,  content }) {

    const params = JSON.stringify(content)

    return dispatch('ajaxAuth', {
      url: '/d2e-webapi/cohortdefinition',
      params,
      cancelToken,
      datasetId: rootGetters.getSelectedDataset.id,
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(response => {
        if (response.data.noDataReason) {
          response.data.noDataReason = getters.getText(response.data.noDataReason)
        }
        commit(types.COHORT_DEFINITION_RESPONSE_SET, { response: { data: response.data } })
        useNotificationStore().setToastMessage({
          text: rootGetters.getText('MRI_PA_CREATE_ATLAS_COHORT_DEFINITION_SUCCESS'),
        })
        return response.data
      })
      .catch(error => {
        commit(types.COHORT_DEFINITION_RESPONSE_SET, {
          response: {
            data: 'An error occurred',
          },
        })
        useNotificationStore().setAlertMessage({
          message: rootGetters.getText('MRI_PA_CREATE_ATLAS_COHORT_DEFINITION_ERROR'),
        })
        throw error
      })
  },
  fireRenameMaterializedCohortQuery({ commit, dispatch, getters, rootGetters }, { cancelToken,  cohortDefinitionId, newName }) {

    const params = {
      datasetId: rootGetters.getSelectedDataset.id,
      cohortDefinitionId: cohortDefinitionId,
      name: newName,
    }

    return dispatch('ajaxAuth', {
      url: '/analytics-svc/api/services/cohort-definition',
      method: 'put',
      params,
      cancelToken,
    })
      .then(({ data }) => {
        useNotificationStore().setToastMessage({
          text: rootGetters.getText('MRI_PA_RENAME_BMK_SUCCESS'),
        })
        return data
      })
      .catch(error => {
        useNotificationStore().setAlertMessage({
          message: rootGetters.getText('MRI_PA_RENAME_BMK_ERROR'),
        })
      })
  },
  fireDeleteMaterializedCohortQuery({ commit, dispatch, getters, rootGetters }, cohortDefinitionId) {

    const datasetId = rootGetters.getSelectedDataset.id

    let url = QueryString({
      url: '/analytics-svc/api/services/cohort',
      queryString: {
        datasetId,
        cohortId: cohortDefinitionId,
      },
      compress: [],
    })

    return dispatch('ajaxAuth', {
      url,
      method: 'DELETE',
    })
      .then(({ data }) => {
        useNotificationStore().setToastMessage({
          text: rootGetters.getText('MRI_PA_DELETE_BMK_SUCCESS'),
        })
      })
      .catch(error => {
        useNotificationStore().setAlertMessage({
          message: rootGetters.getText('MRI_PA_DELETE_BMK_ERROR'),
        })
        throw error
      })
  },
  fireDeleteAtlasCohortDefinitionQuery({ commit, dispatch, getters, rootGetters }, atlasCohortDefinitionId) {

    const datasetId = rootGetters.getSelectedDataset.id

    const url = `/d2e-webapi/cohortdefinition/${atlasCohortDefinitionId}`

    return dispatch('ajaxAuth', {
      url,
      method: 'DELETE',
      datasetId,
    })
      .then(({ data }) => {
        useNotificationStore().setToastMessage({
          text: rootGetters.getText('MRI_PA_DELETE_BMK_SUCCESS'),
        })
      })
      .catch(error => {
        useNotificationStore().setAlertMessage({
          message: rootGetters.getText('MRI_PA_DELETE_BMK_ERROR'),
        })
        throw error
      })
  },
  fireUpdateAtlasCohortDefinitionQuery({ commit, dispatch, getters, rootGetters }, { cancelToken,  content }) {

    const params = JSON.stringify(content)
    return dispatch('ajaxAuth', {
      url: `/d2e-webapi/cohortdefinition/${content.id}`,
      method: 'PUT',
      params,
      cancelToken,
      datasetId: rootGetters.getSelectedDataset.id,
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(response => {
        if (response.data.noDataReason) {
          response.data.noDataReason = getters.getText(response.data.noDataReason)
        }
        commit(types.COHORT_DEFINITION_RESPONSE_SET, { response: { data: response.data } })
        useNotificationStore().setToastMessage({
          text: rootGetters.getText('MRI_PA_UPDATE_ATLAS_COHORT_DEFINITION_SUCCESS'),
        })
        return response.data
      })
      .catch(error => {
        commit(types.COHORT_DEFINITION_RESPONSE_SET, {
          response: {
            data: 'An error occurred',
          },
        })
        useNotificationStore().setAlertMessage({
          message: rootGetters.getText('MRI_PA_UPDATE_ATLAS_COHORT_DEFINITION_ERROR'),
        })
        throw error
      })
  },
  fireGetAtlasCohortDefinitionQuery({ commit, dispatch, getters, rootGetters }, { cohortDefinitionId, cancelToken }) {

    return dispatch('ajaxAuth', {
      url: `/d2e-webapi/cohortdefinition/${cohortDefinitionId}`,
      method: 'GET',
      cancelToken,
      datasetId: rootGetters.getSelectedDataset.id,
    })
      .then(response => {
        commit(types.COHORT_DEFINITION_RESPONSE_SET, { response: { data: response.data } })
        return response.data
      })
      .catch(error => {
        commit(types.COHORT_DEFINITION_RESPONSE_SET, {
          response: {
            data: 'An error occurred while fetching cohort definition',
          },
        })
        throw error
      })
  },
  fireCreateAtlasMaterializedCohortQuery({ state, commit, dispatch, rootGetters }, { url, cancelToken }) {
    return dispatch('ajaxAuth', {
      url,
      cancelToken,
      datasetId: rootGetters.getSelectedDataset.id,
      method: 'get',
    })
      .then(response => {
        useNotificationStore().setToastMessage({
          text: rootGetters.getText('MRI_PA_COLL_SUCCESS_ADD_PATIENT'),
        })
      })
      .catch(error => {
        throw {
          code: 'ADD_PATIENT_FAILED',
          message: rootGetters.getText('MRI_PA_COLL_FAILURE_ADD_PATIENT'),
        }
      })
  },
}

const mutations = {
  [types.COHORT_DEFINITION_RESPONSE_SET](modulestate, { response }) {
    modulestate.response = { ...modulestate.response, ...response }
  },
}

export default {
  state,
  getters,
  actions,
  mutations,
}
