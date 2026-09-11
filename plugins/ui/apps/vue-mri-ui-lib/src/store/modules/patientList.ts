// tslint:disable:no-shadowed-variable
import QueryString from '../../utils/QueryString'
import * as types from '../mutation-types'

interface IResultDefinition {
  selected_attributes: any
  sorted_attributes: string
  sorting_directions: string
}

interface ICohortDefinition {
  cards: any
  axes: any[]
  configData: {
    configId: string
    configVersion: string
  }
  guarded: boolean
  limit: number
  offset: number
  columns?: Array<{
    configPath: string
    order: string
    seq: string
  }>
}

interface IPatientListState {
  request: {
    cohortDefinition: ICohortDefinition
  }
  totalPatientListCount: number
  dataModel: {
    resultDefinition: IResultDefinition
    pageSize: number
    currentPage: number
    noDataReason: string
  }
  columnSelectionMenu: any[]
  columnWidths: any
  patientListTotalRequested: boolean
}

const resultDefinition: IResultDefinition = {
  // dictionary. KEY is configPath, VALUE is the
  // order in which the column appears (l-r) in patient list
  selected_attributes: {},

  // configPath to sort
  sorted_attributes: '',

  // sorting direction 'A' or 'D',
  sorting_directions: '',
}

const cohortDefinition: ICohortDefinition = {
  cards: {},
  configData: {
    configId: null,
    configVersion: null,
  },
  axes: [],
  guarded: true,
  limit: null,
  offset: null,
}

const state: IPatientListState = {
  request: {
    cohortDefinition: JSON.parse(JSON.stringify(cohortDefinition)),
  },
  totalPatientListCount: 0,
  dataModel: {
    resultDefinition: { ...resultDefinition },
    pageSize: 20,
    currentPage: 1,
    noDataReason: '',
  },
  columnSelectionMenu: [],
  columnWidths: {},
  patientListTotalRequested: false,
}

const getters = {
  getTotalPatientListCount: modulestate => modulestate.totalPatientListCount,
  getPatientListTotalRequested: modulestate => modulestate.patientListTotalRequested,
  getPLRequest:
    (state: IPatientListState, getters, rootState, rootGetters) =>
    ({ useLimit, bmkId }: { useLimit: boolean; bmkId: string } = { useLimit: false, bmkId: '' }) => {
      const { cards, configMetadata } = bmkId ? rootGetters.getBookmarkById(bmkId).filter : getters.getBookmarkFromIFR

      if (typeof configMetadata === 'undefined') {
        return {}
      }
      const request = { ...state.request }
      request.cohortDefinition = {
        ...request.cohortDefinition,
        cards,
        configData: {
          configId: configMetadata.id,
          configVersion: configMetadata.version,
        },
        limit: state.dataModel.pageSize,
        offset: getters.getOffset,
        columns: getters.getPLRequestColumns,
      }
      if (!useLimit) {
        delete request.cohortDefinition.limit
        delete request.cohortDefinition.offset
      }
      return {
        ...request,
        datasetId: getters.getSelectedDataset.id,
      }
    },
  getPLRequestZIP: (state, getters) => {
    const plZipRequest = getters.getPLRequest()
    if (!plZipRequest.hasOwnProperty('cohortDefinition')) {
      return {}
    }
    delete plZipRequest.cohortDefinition[`limit`]
    delete plZipRequest.cohortDefinition[`offset`]
    return plZipRequest
  },
  getOffset: (state: IPatientListState) => (state.dataModel.currentPage - 1) * state.dataModel.pageSize,
  getPLRequestCSV: (state: IPatientListState) => {
    const request = { ...state.request }
    request.cohortDefinition.limit = 0
    request.cohortDefinition.offset = 0
    return request
  },
  getPLModel: (state: IPatientListState) => state.dataModel,
  getColumnSelectionMenu: (state: IPatientListState, rootGetters) => {
    if (Object.keys(state.columnSelectionMenu).length === 0) {
      return []
    }

    let index = -1
    const menu = []
    const selectedAttributes = new Set(Object.keys(state.dataModel.resultDefinition.selected_attributes))

    Object.keys(state.columnSelectionMenu).forEach(key => {
      const interaction = state.columnSelectionMenu[key]
      const isBasicData = interaction.isBasicData === true
      const selected = isBasicData || interaction.subMenu.some(attribute => selectedAttributes.has(attribute.path))

      menu.push({
        ...interaction,
        idx: (index += 1),
        hasSubMenu: false,
        subMenu: [],
        toggle: true,
        selected,
        disabled: isBasicData,
        data: isBasicData
          ? undefined
          : {
              path: key,
              selected: !selected,
            },
      })
    })

    menu.push({ idx: (index += 1), hasSubMenu: false, isSeperator: true })

    menu.push({
      idx: (index += 1),
      hasSubMenu: false,
      isTitle: false,
      text: rootGetters.getText('MRI_PA_PATIENT_LIST_RESTORE_DEFAULT'),
      startsSection: true,
      data: 'RESET',
    })

    return menu
  },
  getColumnSelectionMenuByPath: (state: IPatientListState) => path => state.columnSelectionMenu[path],
  getSelectedAttributes: (state: IPatientListState) => state.dataModel.resultDefinition.selected_attributes,
  getPLRequestColumns: (state: IPatientListState) => {
    const columns = []

    // only get the last item
    const sortedColumn = state.dataModel.resultDefinition.sorted_attributes
    const sortOrder = state.dataModel.resultDefinition.sorting_directions

    Object.keys(state.dataModel.resultDefinition.selected_attributes).forEach(configPath => {
      let order = ''

      if (sortedColumn === configPath) {
        order = sortOrder
      }

      columns.push({
        configPath,
        order,
        seq: state.dataModel.resultDefinition.selected_attributes[configPath],
      })
    })
    return columns
  },
  getColumnWidths: (state: IPatientListState) => state.columnWidths,
}

const getPidSortConfigPath = (patientListConfig, selectedAttributes: Record<string, number | string>) => {
  const selectedAttributePaths = new Set(Object.keys(selectedAttributes))
  const basicDataCols = patientListConfig.getBasicDataCols()
  const basicAttributes = basicDataCols && Array.isArray(basicDataCols.attributes) ? basicDataCols.attributes : []
  const personIdAttribute = basicAttributes.find(attribute => {
    const configPath = attribute.getConfigPath()
    const attributeKey = typeof configPath === 'string' ? configPath.split('.').pop() : ''
    return attributeKey === 'pid' && selectedAttributePaths.has(configPath)
  })
  return personIdAttribute ? personIdAttribute.getConfigPath() : ''
}

const getInitialPatientListSortConfigPath = (
  patientListConfig,
  selectedAttributes: Record<string, number | string>
) => {
  const selectedAttributePaths = Object.keys(selectedAttributes)
  const allAttributes = patientListConfig.getAllAttributes()
  const initialPatientListAttributePaths = new Set(
    Array.isArray(allAttributes)
      ? allAttributes
          .filter(attribute => attribute.isInitialInPatientList && attribute.isInitialInPatientList() === true)
          .map(attribute => attribute.getConfigPath())
      : []
  )
  // Returns first matching entry
  return selectedAttributePaths.find(configPath => initialPatientListAttributePaths.has(configPath)) || ''
}

const applyDefaultSort = (patientListConfig, currentResultDefinition: IResultDefinition) => {
  // Return early if there already is a sorted_attributes
  if (currentResultDefinition.sorted_attributes) {
    return currentResultDefinition
  }

  const personIdSortConfigPath = getPidSortConfigPath(patientListConfig, currentResultDefinition.selected_attributes)
  const fallbackSortConfigPath = getInitialPatientListSortConfigPath(
    patientListConfig,
    currentResultDefinition.selected_attributes
  )
  const defaultSortConfigPath = personIdSortConfigPath || fallbackSortConfigPath

  if (!defaultSortConfigPath) {
    return currentResultDefinition
  }

  return {
    ...currentResultDefinition,
    sorted_attributes: defaultSortConfigPath,
    sorting_directions: 'A',
  }
}

const actions = {
  sortAttribute({ commit, state, dispatch }, { configPath, sortOrder }) {
    commit(types.PL_UPDATE_SORT_ATTRIBUTE, {
      sortedAttributes: configPath,
      sortingDirections: sortOrder,
    })
  },
  addSelectedAttribute({ commit, state, dispatch }, { configPath }) {
    // if true, then user is adding an interaction
    if (Object.prototype.hasOwnProperty.call(state.columnSelectionMenu, configPath)) {
      // check if there is an initial attribute for selected interaction.
      const interactionHasInitialAttribute = state.columnSelectionMenu[configPath].subMenu.some(
        attribute => attribute.data.oInternalConfigAttribute.patientlist.initial
      )

      state.columnSelectionMenu[configPath].subMenu.forEach(attribute => {
        if (interactionHasInitialAttribute && attribute.data.oInternalConfigAttribute.patientlist.initial) {
          commit(types.PL_ADD_SELECTED_ATTRIBUTE, {
            [attribute.path]: Object.keys(state.dataModel.resultDefinition.selected_attributes).length,
          })
        } else if (!interactionHasInitialAttribute) {
          // short circuit
          // interactionHasInitialAttribute = true;
          commit(types.PL_ADD_SELECTED_ATTRIBUTE, {
            [attribute.path]: Object.keys(state.dataModel.resultDefinition.selected_attributes).length,
          })
        }
      })
    } else {
      commit(types.PL_ADD_SELECTED_ATTRIBUTE, {
        [configPath]: Object.keys(state.dataModel.resultDefinition.selected_attributes).length,
      })
    }
  },
  setInteractionSelected({ commit, state, rootGetters }, { configPath, selected }) {
    const interaction = state.columnSelectionMenu[configPath]
    if (!interaction || interaction.isBasicData) {
      return
    }

    const interactionAttributes = interaction.subMenu
    const selectedAttributes = {
      ...state.dataModel.resultDefinition.selected_attributes,
    }
    const hasInitialAttribute = interactionAttributes.some(
      attribute => attribute.data?.oInternalConfigAttribute?.patientlist?.initial === true
    )

    if (selected) {
      const selectedSequences = Object.values(selectedAttributes)
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
      let nextSequence = selectedSequences.length > 0 ? Math.max(...selectedSequences) + 1 : 0

      interactionAttributes.forEach(attribute => {
        const isInitial = attribute.data?.oInternalConfigAttribute?.patientlist?.initial === true
        if ((!hasInitialAttribute || isInitial) && !(attribute.path in selectedAttributes)) {
          selectedAttributes[attribute.path] = nextSequence
          nextSequence += 1
        }
      })
    } else {
      interactionAttributes.forEach(attribute => {
        delete selectedAttributes[attribute.path]
      })
    }

    let nextResultDefinition = {
      ...state.dataModel.resultDefinition,
      selected_attributes: selectedAttributes,
    }
    const sortedAttributeRemoved =
      !selected && interactionAttributes.some(attribute => attribute.path === nextResultDefinition.sorted_attributes)

    if (sortedAttributeRemoved) {
      nextResultDefinition = applyDefaultSort(rootGetters.getMriFrontendConfig.getPatientListConfig(), {
        ...nextResultDefinition,
        sorted_attributes: '',
        sorting_directions: '',
      })
    }

    commit(types.PL_INIT_DATAMODEL, {
      resultDefinition: nextResultDefinition,
    })
  },
  removeSelectedAttribute({ commit, state, dispatch }, { configPath }) {
    if (state.dataModel.resultDefinition.sorted_attributes === configPath) {
      commit(types.PL_UPDATE_SORT_ATTRIBUTE, {
        sortedAttributes: '',
        sortingDirections: '',
      })
    }
    commit(types.PL_REMOVE_SELECTED_ATTRIBUTE, configPath)
  },
  populateColumnMenu({ commit, state, rootGetters }) {
    const frontendConfig = rootGetters.getMriFrontendConfig
    const patientListConfig = frontendConfig.getPatientListConfig()
    const basicDataCols = patientListConfig.getBasicDataCols()
    const allOtherColumns = patientListConfig.getAllNonBasicDataColumnsByInteractions()
    let index = 0

    function addColsToMenu(interaction, submenu) {
      interaction.attributes.forEach((attribute, idx) => {
        const path = attribute.getConfigPath()
        if (
          !attribute.oInternalConfigAttribute.aggregated &&
          attribute.oInternalConfigAttribute.type !== 'conceptSet'
        ) {
          submenu.push({
            idx,
            path,
            subMenuStyle: {},
            text: attribute.getName(),
            hasSubMenu: false,
            isSeperator: false,
            subMenu: [],
            disabled: path in state.dataModel.resultDefinition.selected_attributes,
            visible: !attribute.oInternalConfigAttribute.aggregated,
            data: {
              path: attribute.sConfigPath,
              ...attribute,
            },
          })
        }
      })
    }

    const generalSubmenu = []
    addColsToMenu(basicDataCols, generalSubmenu)
    const menu: any = {
      [basicDataCols.path]: {
        path: basicDataCols.path,
        isBasicData: true,
        idx: (index += 1),
        text: rootGetters.getText('MRI_PA_MENUITEM_INTERACTIONS_GENERAL'),
        hasSubMenu: true,
        isSeperator: false,
        subMenu: generalSubmenu,
        disabled: false,
      },
    }

    allOtherColumns.forEach((obj, idx) => {
      const subMenu = []

      addColsToMenu(obj, subMenu)
      menu[obj.path] = {
        idx,
        subMenu,
        path: obj.path,
        text: obj.name,
        hasSubMenu: true,
      }
    })

    // const menu = [
    //   {
    //     path: basicDataCols.path,
    //     idx: index += 1,
    //     hasSubMenu: true,
    //     text: rootGetters.getText('MRI_PA_MENUITEM_INTERACTIONS_GENERAL'),
    //     subMenu: generalSubmenu,
    //   },
    //   {
    //     idx: index += 1,
    //     hasSubMenu: true,
    //     text: rootGetters.getText('MRI_PA_MENUITEM_MORE'),
    //     subMenu: moreSubmenu,
    //     startsSection: true,
    //   },
    //   {
    //     idx: index += 1,
    //     hasSubMenu: false,
    //     isTitle: true,
    //     text: rootGetters.getText('MRI_PA_PATIENT_LIST_RESTORE_DEFAULT'),
    //     select() {
    //       // that.initDataModel();
    //       // that.reloadChart();
    //     },
    //     startsSection: true,
    //   },
    // ];

    commit(types.PL_SET_COLUMN_SELECTION_MENU, menu)
  },
  changePage({ commit }, page) {
    commit(types.PL_SET_PAGE, page)
  },
  setPLRequest({ commit }) {
    commit(types.PL_SET_REQUEST, {
      cohortDefinition: JSON.parse(JSON.stringify(cohortDefinition)),
    })
  },
  setPatientListTotalRequested({ commit }, patientListTotalRequested) {
    commit(types.PL_SET_PATIENT_LIST_TOTAL_REQUESTED, patientListTotalRequested)
  },
  setTotalPatientListCount({ commit }, { totalPatientListCount }) {
    commit(types.SET_TOTAL_PATIENT_LIST_COUNT, { totalPatientListCount })
  },
  getPatientCount({ dispatch, rootGetters }, { params }) {
    const hasReleaseDate = !!rootGetters.getSelectedDatasetVersion?.releaseDate

    return dispatch('ajaxAuth', {
      method: 'get',
      url: QueryString({
        url: '/analytics-svc/api/services/population/json/patientcount',
        queryString: {
          mriquery: JSON.stringify(params),
          ...(hasReleaseDate && { releaseDate: rootGetters.getSelectedDatasetVersion.releaseDate }),
          datasetId: rootGetters.getSelectedDataset.id,
        },
        compress: ['mriquery'],
      }),
    })
  },
  firePatientListCountQuery({ commit, dispatch }, { params, type }) {
    dispatch('getPatientCount', { params }).then(response => {
      if (type === 'total') {
        commit(types.SET_TOTAL_PATIENT_LIST_COUNT, {
          totalPatientListCount: response.data.data[0]['patient.attributes.pcount'],
        })
      } else {
        commit(types.SET_CURRENT_PATIENT_COUNT, {
          currentPatientCount: response.data.data[0]['patient.attributes.pcount'],
        })
      }
    })
  },
  initPLModel({ commit, state, rootGetters }, { loadDefault }) {
    const patientListConfig = rootGetters.getMriFrontendConfig.getPatientListConfig()
    let defaultResultDefinition = JSON.parse(JSON.stringify(resultDefinition))
    const pageSize = patientListConfig.getDefaultPageSize()
    const request = {
      cohortDefinition: JSON.parse(JSON.stringify(cohortDefinition)),
    }

    // selected attributes in patient list are only setup once. This is called during reset
    if (loadDefault) {
      let attributesToAdd = patientListConfig.getInitialTableColumns()
      if (attributesToAdd.length === 0) {
        attributesToAdd = patientListConfig.getBasicDataCols().attributes.map(attribute => attribute.getConfigPath())
      }
      attributesToAdd.forEach((attribute, index) => {
        defaultResultDefinition.selected_attributes[attribute] = index
      })

      commit(types.PL_SET_COLUMNWIDTHS, {})
    } else {
      defaultResultDefinition = { ...state.dataModel.resultDefinition }
    }

    defaultResultDefinition = applyDefaultSort(patientListConfig, defaultResultDefinition)

    commit(types.PL_INIT_DATAMODEL, {
      pageSize,
      currentPage: 1,
      noDataReason: '',
      initialSetupDone: true,
      resultDefinition: {
        ...defaultResultDefinition,
      },
    })

    commit(types.PL_SET_REQUEST, request)
  },
  initPLModelBookmark(
    { commit, rootGetters },
    { selected_attributes, sorting_directions, sorted_attributes }: IResultDefinition
  ) {
    const patientListConfig = rootGetters.getMriFrontendConfig.getPatientListConfig()
    let defaultResultDefinition = JSON.parse(JSON.stringify(resultDefinition))
    defaultResultDefinition = {
      ...defaultResultDefinition,
      selected_attributes,
      sorting_directions,
      sorted_attributes,
    }
    defaultResultDefinition = applyDefaultSort(patientListConfig, defaultResultDefinition)

    const pageSize = patientListConfig.getDefaultPageSize()
    const request = {
      cohortDefinition: JSON.parse(JSON.stringify(cohortDefinition)),
    }

    commit(types.PL_INIT_DATAMODEL, {
      pageSize,
      currentPage: 1,
      noDataReason: '',
      resultDefinition: {
        ...defaultResultDefinition,
      },
    })

    commit(types.PL_SET_REQUEST, request)
  },
  setColumnWidths({ commit, state }, newColumnWidths) {
    commit(types.PL_SET_COLUMNWIDTHS, {
      ...state.columnWidths,
      ...newColumnWidths,
    })
  },
}

const mutations = {
  [types.PL_SET_PATIENT_LIST_TOTAL_REQUESTED](modulestate: IPatientListState, patientListTotalRequested) {
    modulestate.patientListTotalRequested = patientListTotalRequested
  },
  [types.SET_TOTAL_PATIENT_LIST_COUNT](
    modulestate: IPatientListState,
    { totalPatientListCount }: { totalPatientListCount: number }
  ) {
    modulestate.totalPatientListCount = totalPatientListCount
  },
  [types.PL_SET_REQUEST](modulestate: IPatientListState, request) {
    modulestate.request = { ...modulestate.request, ...request }
  },
  [types.PL_INIT_DATAMODEL](modulestate: IPatientListState, dataModel) {
    modulestate.dataModel = { ...modulestate.dataModel, ...dataModel }
  },
  [types.PL_ADD_SELECTED_ATTRIBUTE](modulestate: IPatientListState, attributeToAdd) {
    modulestate.dataModel.resultDefinition.selected_attributes = {
      ...modulestate.dataModel.resultDefinition.selected_attributes,
      ...attributeToAdd,
    }
  },
  [types.PL_REMOVE_SELECTED_ATTRIBUTE](modulestate: IPatientListState, attributeToRemove) {
    delete modulestate.dataModel.resultDefinition.selected_attributes[attributeToRemove]
  },
  [types.PL_SET_PAGE](modulestate: IPatientListState, page) {
    modulestate.dataModel.currentPage = page
  },
  [types.PL_SET_COLUMN_SELECTION_MENU](modulestate: IPatientListState, columnSelectionMenu) {
    modulestate.columnSelectionMenu = columnSelectionMenu
  },
  [types.PL_UPDATE_SORT_ATTRIBUTE](
    modulestate: IPatientListState,
    { sortedAttributes, sortingDirections }: { sortedAttributes: string; sortingDirections: string }
  ) {
    modulestate.dataModel.resultDefinition.sorted_attributes = sortedAttributes
    modulestate.dataModel.resultDefinition.sorting_directions = sortingDirections
  },
  [types.PL_SET_COLUMNWIDTHS](modulestate: IPatientListState, newColumnWidths) {
    modulestate.columnWidths = {
      ...newColumnWidths,
    }
  },
}

export default {
  state,
  getters,
  actions,
  mutations,
}
