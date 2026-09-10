// tslint:disable:no-shadowed-variable
import axios from 'axios'
import StringToBinary from '@/utils/StringToBinary'
import * as types from '../mutation-types'
import { useNotificationStore } from '../../stores/notifications'

const CancelToken = axios.CancelToken

const state = {
  cohort: 'subset',
  collection: 'newCollection',
  subsetCount: 'MRI_PA_COLL_CALCULATING',
  totalCount: 'MRI_PA_COLL_CALCULATING',
  hasExistingCollections: false,
  oldCollection: [],
  cohortList: [],
  cohortListCount: 0,
  cohortListPage: 1,
  metadata: {
    version: 'VERSION',
    dependencies: {
      libs: ['sap.m', 'sap.ui.core'],
      ui5version: '1.52.17',
    },
    config: {
      resourceBundle: 'i18n/text.properties',
      serviceUrl: '//hc/hph/collections/odata/Collections.xsodata',
      patientCountUrl: '/analytics-svc/api/services/population/json/patientcount',
    },
  },
}

let cancel

const getters = {
  getSelectedCohort: state => state.cohort,
  getSelectedCollection: state => state.collection,
  getSubsetCount: state => state.subsetCount,
  getTotalCount: state => state.totalCount,
  getHasExistingCollections: state => state.getHasExistingCollections,
  getCohortList: state => state.cohortList,
  getCohortListPage: state => state.cohortListPage,
  getCohortListCount: state => state.cohortListCount,
  getServiceURL: state => state.metadata.config.serviceUrl,
  getOldCollection: state => state.oldCollection,
}

const actions = {
  requestCohortDetails({ state, commit, dispatch }, ifr) {
    ifr.disableCensoring = true
    ifr.guarded = false

    if (cancel) {
      cancel()
    }

    const cancelToken = new CancelToken(c => {
      cancel = c
    })

    dispatch('ajaxAuth', {
      cancelToken,
      url: state.metadata.config.patientCountUrl,
      params: ifr,
    }).then(response => {
      commit(types.COLLECTIONS_SET_TOTALCOUNT, response.data.data[0]['patient.attributes.pcount'])
    })

    const oIFR = JSON.parse(JSON.stringify(ifr))
    oIFR.guarded = true

    dispatch('ajaxAuth', {
      cancelToken,
      url: state.metadata.config.patientCountUrl,
      params: oIFR,
    }).then(response => {
      commit(types.COLLECTIONS_SET_SUBSETCOUNT, response.data.data[0]['patient.attributes.pcount'])
    })
  },
  onAddCohortOkButtonPress({ state, commit, dispatch, rootGetters }, { params, url, suppressToast }) {
    if (cancel) {
      cancel()
    }
    const newRequest =
      params &&
      params.addItemsToCollectionParams &&
      params.addItemsToCollectionParams.collection &&
      params.addItemsToCollectionParams.collection.title
    const cancelToken = new CancelToken(c => {
      cancel = c
    })
    return dispatch('ajaxAuth', {
      url,
      params: { ...params, mriquery: StringToBinary(params.mriquery), datasetId: rootGetters.getSelectedDataset.id },
      cancelToken,
    })
      .then(response => {
        if (newRequest) {
          const title = params.addItemsToCollectionParams.collection.title
          if (response && response.data) {
            const oldColl = state.oldCollection
            oldColl.push({
              value: response.data.Id,
              text: response.data.Title,
            })
            commit(types.COLLECTIONS_SET_OLDCOLLECTION, oldColl)
            if (!suppressToast) {
              useNotificationStore().setToastMessage({
                text: rootGetters.getText('MRI_PA_COLL_SUCCESS_CREATE_AND_ADD', title),
              })
            }
          }
        } else {
          if (!suppressToast) {
            useNotificationStore().setToastMessage({
              text: rootGetters.getText('MRI_PA_COLL_SUCCESS_ADD_PATIENT'),
            })
          }
        }
        return response?.data
      })
      .catch(error => {
        if (newRequest) {
          throw {
            code: 'EXISTING_COLLECTION',
            message: rootGetters.getText(
              'MRI_PA_COLL_EXISTING_COLLECTION',
              params.addItemsToCollectionParams.collection.title
            ),
          }
        }
        throw {
          code: 'ADD_PATIENT_FAILED',
          message: rootGetters.getText('MRI_PA_COLL_FAILURE_ADD_PATIENT'),
        }
      })
  },
  loadOldCollections({ state, commit, dispatch, rootGetters }) {
    if (cancel) {
      cancel()
    }
    const cancelToken = new CancelToken(c => {
      cancel = c
    })
    dispatch('ajaxAuth', {
      method: 'get',
      url: '/analytics-svc/api/services/collections',
      cancelToken,
    })
      .then(response => {
        const result = []
        if (response.data && response.data.length > 0) {
          response.data.forEach(el => {
            result.push({
              value: el.Id,
              text: el.Title,
            })
          })
          commit(types.COLLECTIONS_SET_OLDCOLLECTION, result)
        }

        return result
      })
      .catch(err => {
        throw err
      })
  },
  loadCohortList({ state, commit, dispatch, rootGetters }, { bookmarkId }) {
    if (cancel) {
      cancel()
    }
    const cancelToken = new CancelToken(c => {
      cancel = c
    })

    const syntax = JSON.stringify({
      datasetId: rootGetters.getSelectedDataset.id,
      bookmarkId: bookmarkId,
    })

    return dispatch('ajaxAuth', {
      method: 'get',
      url: '/analytics-svc/api/services/cohort/SYNTAX/' + syntax + '?datasetId=' + rootGetters.getSelectedDataset.id,
      cancelToken,
    })
      .then(response => {
        if (response.data && response.data.data.length > 0) {
          commit(types.COLLECTIONS_COHORT_LIST, response.data.data)
          commit(types.COLLECTIONS_COHORT_LIST_COUNT, response.data.cohortDefinitionCount)
        }
        useNotificationStore().setToastMessage({
          text: 'retrieved cohorts',
        })
      })
      .catch(err => {
        throw err
      })
  },
  clearCohortList({ commit }) {
    commit(types.COLLECTIONS_COHORT_LIST, [])
  },
  setCohortListPage({ commit }, pageNum) {
    commit(types.COLLECTIONS_COHORT_LIST_PAGE, pageNum)
  },
  setCohortListCount({ commit }, count) {
    commit(types.COLLECTIONS_COHORT_LIST_COUNT, count)
  },
}

const mutations = {
  [types.SET_COHORT_TYPE](moduleState, cohort) {
    moduleState.cohort = cohort
  },
  [types.SET_COLLECTION_TYPE](moduleState, collection) {
    moduleState.collection = collection
  },
  [types.COLLECTIONS_SET_SUBSETCOUNT](moduleState, subsetCount) {
    moduleState.subsetCount = subsetCount
  },
  [types.COLLECTIONS_SET_TOTALCOUNT](moduleState, totalCount) {
    moduleState.totalCount = totalCount
  },
  [types.COLLECTIONS_SET_HASEXISTINGCOLLECTION](moduleState, hasExistingCollections) {
    moduleState.hasExistingCollections = hasExistingCollections
  },
  [types.COLLECTIONS_SET_OLDCOLLECTION](moduleState, oldCollection) {
    moduleState.oldCollection = oldCollection
  },
  [types.COLLECTIONS_COHORT_LIST](moduleState, showCohortListState) {
    moduleState.cohortList = showCohortListState
  },
  [types.COLLECTIONS_COHORT_LIST_PAGE](moduleState, pageNum) {
    moduleState.cohortListPage = pageNum
  },
  [types.COLLECTIONS_COHORT_LIST_COUNT](moduleState, count) {
    moduleState.cohortListCount = count
  },
}

export default {
  state,
  getters,
  actions,
  mutations,
}
