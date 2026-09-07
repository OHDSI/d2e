// tslint:disable:no-shadowed-variable
import axios from 'axios'
import { useNotificationStore } from '../../stores/notifications'
import { denormalize, normalize, schema } from 'normalizr'
import BMGetChartableCards from '../../lib/ifr/BMGetChartableCards'
import BooleanContainers from '../../lib/ifr/BooleanContainers'
import ControlGenerator from '../../lib/ifr/ControlGenerator'
import InternalFilterRepresentation from '../../lib/ifr/InternalFilterRepresentation'
import IFR2Bookmark from '../../lib/IFR2Bookmark'
import AdvancedTimeFilterModel from '../../lib/models/AdvancedTimeFilterModel'
import AxisModel from '../../lib/models/AxisModel'
import BoolContainerModel from '../../lib/models/BoolContainerModel'
import BoolFilterContainerModel from '../../lib/models/BoolFilterContainerModel'
import ConstraintModel from '../../lib/models/ConstraintModel'
import FilterCardModel from '../../lib/models/FilterCardModel'
import KeyCounter from '../../lib/utils/KeyCounter'
import Constants from '../../utils/Constants'
import DateUtils from '../../utils/DateUtils'
import QueryString from '../../utils/QueryString'
import { VariantValidator } from '../../utils/VariantValidator'
import * as types from '../mutation-types'
import Plotly from '../../lib/CustomPlotly'
import moment from 'moment'

const parseDrilldownDateValue = (value: unknown): Date | null => {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }

  const parsedMoment = moment(value, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', moment.ISO_8601], true)
  if (parsedMoment.isValid()) {
    return parsedMoment.toDate()
  }

  const fallbackDate = new Date(value)
  return isNaN(fallbackDate.getTime()) ? null : fallbackDate
}

const normalizeConstraintDateForDisplay = (value: unknown, constraintType: string): string | Date | unknown => {
  const parsedDate = parseDrilldownDateValue(value)
  if (!parsedDate) {
    return value
  }

  if (constraintType === 'time') {
    return DateUtils.toStartOfDay(parsedDate)
  }

  const localDate = DateUtils.toLocalDate(parsedDate)
  return localDate
}

const omit = (obj, ...keysToOmit) =>
  Object.keys(obj)
    .filter(key => [...keysToOmit].indexOf(key) < 0)
    .reduce((newObj, key) => ({ ...newObj, [key]: obj[key] }), {})

const processStrategy = entity => omit(entity, 'mriFrontendConfig')

const constraintSchema = new schema.Entity(
  'constraints',
  {},
  {
    processStrategy,
  }
)

const filterCardSchema = new schema.Entity(
  'filterCards',
  {
    props: {
      constraints: [constraintSchema],
    },
  },
  { processStrategy }
)

const boolFilterContainerSchema = new schema.Entity(
  'boolFilterContainers',
  {
    props: {
      filterCards: [filterCardSchema],
    },
  },
  { processStrategy }
)

const boolContainerSchema = new schema.Entity(
  'boolContainers',
  {
    props: {
      boolfiltercontainers: [boolFilterContainerSchema],
    },
  },
  { processStrategy }
)

const initialChartProperties = [
  {
    props: { active: false, value: 'MRI_PA_CHART_SORT_DEFAULT' },
  },
  {
    props: { active: false, value: {} },
  },
  {
    props: { active: false, value: {} },
  },
]
let xSequence = 0
let ySequence = 0
const initAxes = []
for (let i = 0; i < Constants.MRIChartDimensions.Count; i += 1) {
  let newAxis
  if (i === Constants.MRIChartDimensions.Y) {
    ySequence += 1
    newAxis = new AxisModel({
      axis: 'Y',
      seq: ySequence,
      key: '',
      filterCardId: '',
    })
  } else {
    xSequence += 1
    newAxis = new AxisModel({
      axis: 'X',
      seq: xSequence,
      key: '',
      filterCardId: '',
    })
  }
  initAxes.push(newAxis)
}

const state = {
  model: {
    entities: {
      boolContainers: {},
      boolFilterContainers: {},
      constraints: {},
    },
    result: '',
  },
  axes: initAxes,
  chartCover: false,
  chartProperties: JSON.parse(JSON.stringify(initialChartProperties)),
  chartSelection: [],
  response: {},
  variantFilterCards: [],
  currentPatientCount: 0,
  // Set the moment a new chart query is triggered, cleared when a count is written
  // back. Nothing renders this flag; it exists so a reader that must not mistake a
  // stale number for a result (the AI assistant's pa_get_cohort_result) can tell an
  // in-flight query from a settled one.
  currentPatientCountStale: false,
  totalPatientCount: 0,
  plotlyElement: null,
}
/*
function backendFormatter(obj) {
  if (obj instanceof Object) {
    const newObj = {};
    if (obj.content) {
      newObj.content = obj.content.map(child => backendFormatter(child));
    }
    Object.keys(obj).forEach((key) => {
      if (key !== 'content') {
        const newKey = `_${key}`;
        if (key === 'advanceTimeFilter') {
          newObj[newKey] = obj[key];
        } else {
          newObj[newKey] = backendFormatter(obj[key]);
        }
      }
    });
    return newObj;
  }
  return obj;
}
*/

// getters
const getters = {
  getBookmarkFromIFR: (state, getters) => {
    if (Object.keys(getters.getIFR).length === 0) {
      return {}
    }

    const bm = IFR2Bookmark(getters.getIFR)
    // commit(types.BOOKMARK_SET_CURRENT, bm);
    return bm
  },
  getIFR: (state, getters, rootState, rootGetters) => {
    const boolContainerId = getters.getBoolContainerRoot()
    if (!boolContainerId || !rootGetters.getHasAssignedConfig) {
      return {}
    }
    const mriFrontendConfig = rootGetters.getMriFrontendConfig
    const boolContainer = getters.getBoolContainer(boolContainerId)
    const id = mriFrontendConfig.getPaConfigId()
    const version = mriFrontendConfig.getPaConfigVersion()
    const aContent = boolContainer.props.boolfiltercontainers.map(boolFilterContainerId => {
      const boolFilterContainer = getters.getBoolFilterContainer(boolFilterContainerId)
      const oIFR = boolFilterContainer.props.filterCards.map(filterCardId => {
        const filterCard: FilterCardModel = getters.getFilterCard(filterCardId)
        const constraints = getters.getFilterCardConstraints(filterCardId)
        const filterCardName =
          !filterCard.props.name && filterCard.props.key === 'patient'
            ? rootGetters.getText('MRI_PA_FILTERCARD_TITLE_BASIC_DATA')
            : filterCard.props.name

        const mFilterCardSettings: any = {
          configPath: mriFrontendConfig.getFilterCardByPath(filterCard.props.key).getConfigPath(),
          instanceNumber: filterCard.props.index || 0,
          instanceID: filterCard.props.instanceId,
          name: filterCardName,
          attributes: new BooleanContainers.And(
            constraints
              .filter(constraint => ['_succ', '_relTime'].indexOf(constraint.props.attrKey) === -1)
              .map(constraint => {
                let content = []
                switch (constraint.props.type) {
                  case 'text':
                    content = constraint.props.value.map(
                      sTagText =>
                        new InternalFilterRepresentation.Expression({
                          operator: '=',
                          value: sTagText.value,
                        })
                    )
                    break
                  case 'time':
                  case 'datetime':
                    const aExpressions = []

                    if (constraint.props.fromDate.value !== '') {
                      aExpressions.push(
                        new InternalFilterRepresentation.Expression({
                          operator: '>=',
                          value: constraint.props.fromDate.value,
                        })
                      )
                    }

                    if (constraint.props.toDate.value !== '') {
                      aExpressions.push(
                        new InternalFilterRepresentation.Expression({
                          operator: '<=',
                          value: constraint.props.toDate.value,
                        })
                      )
                    }

                    content = [new BooleanContainers.And(aExpressions)]

                    break

                  case 'num':
                    content = constraint.props.value.map(mFilterConstraint => {
                      if (mFilterConstraint.and) {
                        return new BooleanContainers.And(
                          mFilterConstraint.and.map(mFilterAndConstraint => {
                            return new InternalFilterRepresentation.Expression({
                              operator: mFilterAndConstraint.op,
                              value: mFilterAndConstraint.value,
                            })
                          })
                        )
                      }
                      return new InternalFilterRepresentation.Expression({
                        operator: mFilterConstraint.op,
                        value: mFilterConstraint.value,
                      })
                    })

                    break

                  case 'conceptSet':
                    content = constraint.props.value.map(
                      sTagText =>
                        new InternalFilterRepresentation.Expression({
                          operator: '=',
                          value: sTagText.value,
                        })
                    )
                    break
                  default:
                    content = []
                }

                return new InternalFilterRepresentation.Attribute({
                  configPath: constraint.props.attributePath,
                  instanceID: constraint.props.instanceId,
                  constraints: new BooleanContainers.Or(content),
                })
              })
          ),
          inactive: filterCard.props.inactive,
          isEntry: filterCard.props.isEntry,
          isExit: filterCard.props.isExit,
        }

        // if (this.getSuccessor()) {
        //   const oConstraint = this.getConstraintForAttribute('_relTime');
        //   mFilterCardSettings.successor =
        //     new InternalFilterRepresentation
        //       .Successor(this.getSuccessor(),
        //       oConstraint.getLower(), oConstraint.getUpper());
        // }

        const parentInteractionConstraint = constraints.find(c => c.props.attrKey === 'parentInteraction')
        if (parentInteractionConstraint && parentInteractionConstraint.props.value) {
          mFilterCardSettings.parentInteraction = parentInteractionConstraint.props.value.value
        }

        const oAtfIFR = AdvancedTimeFilterModel.getIFR(filterCard.props.layout.advancedTimeLayout)

        if (oAtfIFR && oAtfIFR.filters && oAtfIFR.filters.length > 0) {
          mFilterCardSettings.advanceTimeFilter = oAtfIFR
        }

        const oIFRFilterCard = new InternalFilterRepresentation.FilterCard(mFilterCardSettings)

        if (filterCard.props.excludeFilter) {
          return new BooleanContainers.Not([oIFRFilterCard])
        }
        return oIFRFilterCard
      })

      return new BooleanContainers.Or(oIFR) // at the BooleanFilterContainers level
    })

    const ifr = new InternalFilterRepresentation.Filter({
      configMetadata: new InternalFilterRepresentation.ConfigMetadata(version, id),
      cards: aContent.length
        ? new BooleanContainers.And(aContent) // at the BooleanContainers level
        : new BooleanContainers.Empty(),
    })

    return ifr
  },
  getChartCover: modulestate => modulestate.chartCover,
  getCurrentPatientCount: modulestate => modulestate.currentPatientCount,
  isCurrentPatientCountStale: modulestate => modulestate.currentPatientCountStale,
  getIsLargePatientData: (modulestate, moduleGetters) =>
    moduleGetters.getActiveChart === 'list' && modulestate.currentPatientCount >= 10000,
  getTotalPatientCount: modulestate => modulestate.totalPatientCount,
  getVariantFilterCards: modulestate => modulestate.variantFilterCards,
  getEntities: modulestate => modulestate.model.entities,
  getChartSelection: modulestate => () => modulestate.chartSelection,
  getAllChartProperties: modulestate => () => modulestate.chartProperties,
  getChartProperty: modulestate => id => {
    if (id >= 0) {
      return modulestate.chartProperties[id]
    }
    return {
      props: {
        axes: [],
      },
    }
  },
  getResponse: modulestate => () => modulestate.response,
  getAllAxes: modulestate => modulestate.axes,
  getActiveAxes: modulestate => modulestate.axes.filter(axis => axis.props.active),
  getAxis: modulestate => id => {
    if (id >= 0) {
      return modulestate.axes[id]
    }
    return {
      props: {
        axes: [],
      },
    }
  },
  getBoolContainer: modulestate => id => {
    if (id) {
      return modulestate.model.entities.boolContainers[id]
    }
    return {
      props: {
        boolfiltercontainers: [],
      },
    }
  },
  getBoolFilterContainer: modulestate => id => {
    if (id) {
      return modulestate.model.entities.boolFilterContainers[id]
    }
    return {
      props: {
        filterCards: [],
      },
    }
  },
  getBoolFilterContainers: modulestate => () => {
    return {
      ...modulestate.model.entities.boolFilterContainers,
    }
  },
  getBasicFilterCard: modulestate => () => {
    const patient = 'patient'
    return { ...modulestate.model.entities.filterCards[patient] }
  },
  getFilterCard: modulestate => filtercardId => {
    const filterCard = modulestate.model.entities.filterCards[filtercardId]
    return { ...filterCard }
  },
  getFilterCards: modulestate => () => {
    return { ...modulestate.model.entities.filterCards }
  },
  getFilterCardCount:
    (modulestate, moduleGetters) =>
    ({
      matchType,
      excludedOnly,
      excludeBasicCard,
    }: {
      matchType: string // matchType is no longer needed as the count is needed for both AND and OR boolFilterContainers
      excludedOnly: boolean
      excludeBasicCard: boolean
    }) => {
      const boolFilterContainers = modulestate.model.entities.boolFilterContainers
      if (boolFilterContainers) {
        return Object.keys(boolFilterContainers)
          .map(id => boolFilterContainers[id])
          .reduce((filtersCount, boolFilterContainerModel) => {
            if (boolFilterContainerModel) {
              const totalFilterCards = boolFilterContainerModel.props.filterCards.reduce((total, c) => {
                const filterCard = moduleGetters.getFilterCard(c)
                // do not count basic filter card
                if (excludeBasicCard && c === 'patient') {
                  return total
                }
                // do not count inclusion filter card
                if (excludedOnly && !filterCard.props.excludeFilter) {
                  return total
                }
                // do not count exclusion filter card
                if (!excludedOnly && filterCard.props.excludeFilter) {
                  return total
                }

                return total + 1
              }, 0)
              return totalFilterCards + filtersCount
            }
          }, 0)
      }
      return 0
    },
  getFilterCardCounter: (modulestate, moduleGetters) => boolContainerId => {
    const boolContainer = moduleGetters.getBoolContainer(boolContainerId)
    return KeyCounter.createKeyCounter(boolContainer.filterCardInstancesCounter)
  },
  getFilterCardConstraints: modulestate => filtercardId =>
    modulestate.model.entities.filterCards[filtercardId].props.constraints.map(
      constraintId => modulestate.model.entities.constraints[constraintId]
    ),
  getNextFilterCardNumber:
    (modulestate, moduleGetters) =>
    ({ boolContainerId, configPath }) => {
      const boolContainer = moduleGetters.getBoolContainer(boolContainerId)
      const keyCounter = KeyCounter.createKeyCounter(boolContainer.filterCardInstancesCounter)
      return keyCounter.getNextValueFor(configPath)
    },
  getConstraintForAttribute:
    (modulestate, moduleGetters) =>
    ({ filterCardId, key }) =>
      FilterCardModel.getConstraintForAttribute(
        { constraints: moduleGetters.getFilterCardConstraints(filterCardId) },
        key
      ),
  getBoolContainerRoot: modulestate => () => modulestate.model.result,
  getChartableFilterCards: (modulestate, moduleGetters) => {
    const bm = moduleGetters.getBookmarkFromIFR
    return Object.keys(bm).length === 0 ? [] : BMGetChartableCards(bm, moduleGetters.getMriFrontendConfig)
  },
  getChartableFilterCardByInstanceId: (modulestate, moduleGetters) => filterCardInstanceId =>
    moduleGetters.getChartableFilterCards.find(({ instanceId }) => instanceId === filterCardInstanceId),
  getFilterCardsByBoolFilterContainerId:
    (modulestate, moduleGetters) =>
    ({
      boolFilterContainerId,
      dataSource,
    }: {
      boolFilterContainerId: string
      dataSource: 'allowedSuccessors' | 'parents'
    }) => {
      const boolFilterContainer = moduleGetters.getBoolFilterContainer(boolFilterContainerId)
      const allowedSuccessors = []
      const parents: any[] = []

      boolFilterContainer.props.filterCards.forEach(filterCardId => {
        const oFilterCard = moduleGetters.getFilterCard(filterCardId)
        if (oFilterCard.props.key !== 'patient' && !oFilterCard.props.excludeFilter) {
          if (oFilterCard.props.allowSuccessorConstraint || oFilterCard.props.allowAdvancedTimeFilter) {
            // only put this card in the list if it allows successors
            allowedSuccessors.push({
              key: oFilterCard.props.cardId,
              text: oFilterCard.props.name,
            })
          }

          if (oFilterCard.props.allowParentConstraint) {
            parents.push({
              key: oFilterCard.props.cardId,
              text: oFilterCard.props.name,
            })
          }
        }
      })

      if (dataSource === 'allowedSuccessors') {
        return allowedSuccessors
      }

      if (dataSource === 'parents') {
        return parents
      }

      return []
    },
  getConstraint: modulestate => constraintId => {
    const constraint = JSON.parse(JSON.stringify(modulestate.model.entities.constraints[constraintId]))
    if (constraint && constraint.props) {
      const prop = constraint.props
      if (prop.fromDate && prop.fromDate.value) {
        constraint.props.fromDate.value = normalizeConstraintDateForDisplay(prop.fromDate.value, constraint.props.type)
      }
      if (prop.toDate && prop.toDate.value) {
        constraint.props.toDate.value = normalizeConstraintDateForDisplay(prop.toDate.value, constraint.props.type)
      }
    }
    return constraint
  },
  getConstraints: modulestate => modulestate.model.entities.constraints,
  isVariantConstraint: (modulestate, moduleGetters) => constraintId => {
    const genemoicVariantType = 'genomics_variant_location' // hardcoded to check whether the filterCard is a Genetic Variant
    const attr = moduleGetters.getMriFrontendConfig.getAttributeByPath(constraintId)
    if (!attr || !attr.hasOwnProperty('oInternalConfigAttribute')) {
      return false
    }
    const { oInternalConfigAttribute } = attr
    // InternalConfigAttribute has annotations and contains 'genomics_variant_location'
    return (
      oInternalConfigAttribute.annotations && oInternalConfigAttribute.annotations.indexOf(genemoicVariantType) !== -1
    )
  },
  getSelectedEntryExitFilterCard: (modulestate, getters) => key => {
    const filterCards = getters.getFilterCards()

    for (const card in filterCards) {
      if (filterCards[card].props[key]) {
        return filterCards[card].props.name
      }
    }
    return null
  },
  getPlotlyElement: modulestate => modulestate.plotlyElement,
}

// actions
const actions = {
  setIFRState({ commit, rootGetters, dispatch }, { ifr }) {
    return new Promise((resolve, reject) => {
      const boolcontainermodel = new BoolContainerModel(rootGetters.getMriFrontendConfig)
      try {
        ControlGenerator.generate(ifr, boolcontainermodel)
      } catch (e) {
        reject()
        return
      }
      dispatch('setBoolContainerState', boolcontainermodel)
      resolve(null)
    })
  },
  setChartCover({ commit }, { chartCover }) {
    commit(types.SET_CHART_COVER, { chartCover })
  },
  toggleExcludeFilterCard({ commit }, { filterCardId }) {
    commit(types.FILTERCARD_TOGGLE_EXCLUDE, filterCardId)
  },
  setFilterCardInactive({ commit }, { filterCardId, inactive }) {
    commit(types.SET_FILTERCARD_INACTIVE, { filterCardId, inactive })
  },
  addBoolFilterContainer({ commit, state }, boolFilterContainer) {
    boolFilterContainer.descriptionColumnsMaxWidth = state.boolContainerState.descriptionColumnsMaxWidth
    commit(types.BOOLFILTERCONTAINER_ADD, boolFilterContainer)
  },
  queryReset({ commit }) {
    commit(types.QUERY_RESET)
  },
  setBoolContainerState({ commit, getters }, boolContainerModel) {
    commit(types.BOOLCONTAINER_ADD, boolContainerModel)
    const { boolfiltercontainers } = boolContainerModel.props
    const variantFilterCards = []
    boolfiltercontainers.forEach(c => {
      const { filterCards } = c.props
      for (let i = 0; i < filterCards.length; i++) {
        const { constraints } = filterCards[i].props
        if (constraints.findIndex(c => getters.isVariantConstraint(c.id)) >= 0) {
          variantFilterCards.push(filterCards[i].id)
          break
        }
      }
    })
    commit(types.SET_VARIANT_FILTER_CARDS, {
      variantFilterCards,
    })
  },
  disableAllAxesandProperties({ commit, getters }) {
    for (let i = 0; i < getters.getAllAxes.length; i += 1) {
      commit(types.AXIS_SET_VALUE, { id: i, props: { active: false } })
    }
    for (let i = 0; i < getters.getAllChartProperties().length; i += 1) {
      commit(types.CHART_PROPERTY_SET_VALUE, {
        id: i,
        props: { active: false },
      })
    }
  },
  syncAxesAndCurrentBM({ getters, dispatch }) {
    const chartableFilterCards = getters.getChartableFilterCards
    // check if the selected attributes in the axes is still in
    // the chartable filter cards
    getters.getAllAxes.forEach(({ props }, idx) => {
      if (
        chartableFilterCards.some(
          filterCard =>
            filterCard.instanceId === props.filterCardId && filterCard.visibleAttributes.indexOf(props.key) === -1
        )
      ) {
        dispatch('clearAxisValue', idx)
      } else if (chartableFilterCards.every(filterCard => filterCard.instanceId !== props.filterCardId)) {
        dispatch('clearAxisValue', idx)
      }
    })
  },
  setupAxes({ commit }, { axes }) {
    commit(types.AXIS_ADD, { axes })
  },
  setupChartProperties({ commit }, { chartProperties }) {
    commit(types.CHART_PROPERTY_ADD, { chartProperties })
  },
  resetChartProperties({ commit, dispatch }) {
    dispatch('initPLModel', { loadDefault: true })
    dispatch('setKMFirstLoad', { firstLoad: { init: true } })
    dispatch('resetFilters')
    commit(types.CHART_PROPERTY_ADD, {
      chartProperties: JSON.parse(JSON.stringify(initialChartProperties)),
    })
  },
  setAxisValue({ commit }, { id, props }) {
    commit(types.AXIS_SET_VALUE, { id, props })
  },
  setNewAxisValue({ commit, getters, dispatch }, { id, props }) {
    const attributeConfig = getters.getMriFrontendConfig.getAttributeByPath(props.attributeId)
    if (attributeConfig.isCategory() && (props.binsize === undefined || props.binsize === null)) {
      props.binsize = attributeConfig.getDefaultBinSize() === undefined ? 0 : attributeConfig.getDefaultBinSize()
    }

    // KDP: force binsize 0 on whichever of X1/X2 is the active (non-disabled) x-axis.
    const X1 = Constants.MRIChartDimensions.X1
    const X2 = Constants.MRIChartDimensions.X2
    if ((id === X1 || id === X2) && getters.getBarChartType === 'distribution') {
      const x1Disabled = !!getters.getAxis(X1)?.props?.disabled
      const x2Disabled = !!getters.getAxis(X2)?.props?.disabled
      const activeXSlot = x1Disabled ? X2 : x2Disabled ? X1 : X1
      if (id === activeXSlot) {
        props.binsize = 0
        commit(types.SET_PREVIOUS_X_AXIS_BINSIZE, null)
        commit(types.SET_PREVIOUS_X_AXIS_ATTRIBUTE_ID, props.attributeId ?? null)
      }
    }

    dispatch('setAxisValue', {
      id,
      props,
    })
  },
  resetAxes({ getters, dispatch }) {
    const axes = getters.getActiveAxes
    const boolContainer = getters.getBoolContainer(getters.getBoolContainerRoot())
    boolContainer.props.boolfiltercontainers.forEach(boolFilterContainer => {
      const filterCards = getters.getBoolFilterContainer(boolFilterContainer).props.filterCards
      axes.forEach((axis, id) => {
        if (
          axis.props.filterCardId &&
          filterCards.findIndex(f => axis.props.filterCardId === f) > -1 &&
          filterCards.length > 1
        ) {
          dispatch('clearAxisValue', id)
        }
      })
    })
  },
  clearAxisValue({ dispatch }, id) {
    dispatch('setAxisValue', {
      id,
      props: {
        attributeId: '',
        filterCardId: '',
        key: '',
      },
    })
  },
  setChartPropertyValue({ commit }, { id, props }) {
    commit(types.CHART_PROPERTY_SET_VALUE, { id, props })
  },
  addFilterCard({ getters, commit, dispatch }, { boolFilterContainerId, configPath, isExclusion = false }) {
    return new Promise<string>((resolve, reject) => {
      const boolContainer = getters.getBoolContainer(getters.getBoolContainerRoot())
      // to add the new FilterCard either to the given FilterContainerId or
      // to create a new boolFilterContainer in boolContainer when undefined
      const mriFrontendConfig = getters.getMriFrontendConfig
      let boolFilterContainer
      if (boolFilterContainerId) {
        boolFilterContainer = getters.getBoolFilterContainer(boolFilterContainerId)
      } else {
        boolFilterContainer = new BoolFilterContainerModel(mriFrontendConfig, {
          type: 'boolfiltercontainer',
          filterCards: [],
        })

        const boolContainerModel = denormalize(boolContainer, boolContainerSchema, getters.getEntities)
        boolContainerModel.props.boolfiltercontainers.push(boolFilterContainer)
        dispatch('setBoolContainerState', boolContainerModel)
        boolFilterContainerId = boolFilterContainer.id
      }

      const filterCardObj = BoolFilterContainerModel.createFilterCard({
        mriFrontendConfig,
        boolFilterContainerProps: boolFilterContainer.props,
        sConfigPath: configPath,
        iExternalIndex: null,
        sName: null,
        excludeFilter: isExclusion || false,
        allowParentConstraint: !isExclusion || false,
        parentInteraction: '',
      })

      const normalizedData = normalize(filterCardObj, filterCardSchema)

      commit(types.FILTERCARD_ADD, {
        boolFilterContainerId,
        filterCardsToAdd: normalizedData.entities.filterCards,
        constraintsToAdd: normalizedData.entities.constraints,
      })

      for (const c in normalizedData.entities.constraints) {
        if (getters.isVariantConstraint(c)) {
          commit(types.SET_VARIANT_FILTER_CARDS, {
            variantFilterCards: [...getters.getVariantFilterCards, filterCardObj.id],
          })
          break
        }
      }

      // reset all the axes that use any filtercard(s) in the current boolFilterContainer
      dispatch('resetAxes')
      useNotificationStore().setToastMessage({
        text: getters.getText('MRI_PA_NEW_FILTERCARD_NOTIFICATION', getters.getFilterCard(filterCardObj.id).props.name),
      })
      resolve(filterCardObj.id)
    })
  },
  async addGeneticFilterCard({ dispatch, getters }, { geneNames }) {
    const filterCardId = await dispatch('addFilterCard', {
      configPath: 'patient.interactions.ga_mutation',
    })

    for (const text of geneNames) {
      try {
        const mData = await VariantValidator.validate(text)
        if (mData.status === 'Valid') {
          const oFilter = {
            op: '=',
            value: JSON.stringify({
              text,
              ...mData,
            }),
          }
          const constraints = getters.getFilterCardConstraints(filterCardId)
          const locationConstraint = constraints.find(c => getters.isVariantConstraint(c.id))
          locationConstraint.props.value.push(oFilter)
          dispatch('updateConstraintValue', {
            constraintId: locationConstraint.id,
            value: locationConstraint.props.value,
          })
        }
      } catch (error) {
        console.error('Variant validation failed for:', text, error)
      }
    }
  },
  addFilterCardConstraint({ commit, getters }, { filterCardId, key }) {
    const filterCard = getters.getFilterCard(filterCardId)
    const mriFrontendConfig = getters.getMriFrontendConfig
    const filterCardObj = new FilterCardModel(mriFrontendConfig, filterCard.props)
    filterCardObj.props.constraints = getters.getFilterCardConstraints(filterCardId)
    const normalizedData = normalize(filterCardObj.addConstraintForAttribute(key), [constraintSchema])

    const constraintId = filterCardObj.props.constraints.find(constraint => constraint.props.attrKey === key).props
      .instanceId

    commit(types.CONSTRAINTS_ADD, {
      constraintsToAdd: normalizedData.entities.constraints,
    })

    filterCardObj.props.constraints = filterCard.props.constraints.concat(normalizedData.result)

    commit(types.FILTERCARD_SET_PROPS, {
      filterCardId,
      filterCardProps: filterCardObj.props,
    })
    return constraintId
  },
  async addNewFilterCardAndConstraint({ commit, getters, dispatch }, { axisId, configPath, key, attributeConfigPath }) {
    return new Promise(async (resolve, reject) => {
      const filterCardId = await dispatch('addNewFilterCard', {
        configPath,
      })

      const binsize = getters.getMriFrontendConfig.getAttributeByPath(attributeConfigPath).getDefaultBinSize()
      const filterCard = getters.getFilterCard(filterCardId)
      const mriFrontendConfig = getters.getMriFrontendConfig
      const filterCardObj = new FilterCardModel(mriFrontendConfig, filterCard.props)
      filterCardObj.props.constraints = getters.getFilterCardConstraints(filterCardId)
      filterCardObj.addConstraintForAttribute(key)
      const attributeId = filterCardObj.props.constraints.find(constraint => constraint.props.attrKey === key).props
        .instanceId
      const props: any = { key, filterCardId, attributeId }
      if (binsize >= 0) {
        props.binsize = binsize
      }

      dispatch('setAxisValue', { props, id: axisId })
      await dispatch('addFilterCardConstraint', {
        key,
        filterCardId,
      })
      resolve({ ...props })
    })
  },
  deleteFilterCardConstraint({ commit, getters, dispatch }, { filterCardId, constraintId }) {
    const filterCard = getters.getFilterCard(filterCardId)
    const constraints = filterCard.props.constraints.filter(item => item !== constraintId)

    const allAxes = getters.getAllAxes
    allAxes.forEach((axis, index) => {
      if (axis.props && axis.props.active && axis.props.filterCardId === filterCardId) {
        const axisConstraint = getters.getConstraintForAttribute({
          filterCardId,
          key: axis.props.key,
        })
        if (axisConstraint && axisConstraint.id === constraintId) {
          dispatch('setAxisValue', {
            id: index,
            props: { filterCardId: '', key: '' },
          })
        }
      }
    })

    commit(types.FILTERCARD_SET_PROPS, {
      filterCardId,
      filterCardProps: {
        constraints,
      },
    })
    commit(types.CONSTRAINTS_DELETE, { constraintId })
  },
  changeFilterCardName({ commit }, { filterCardId, name }) {
    commit(types.FILTERCARD_SET_PROPS, {
      filterCardId,
      filterCardProps: { name },
    })
  },
  deleteFilterCard({ commit, getters, dispatch }, { filterCardId }) {
    const allAxes = getters.getAllAxes
    allAxes.forEach((axis, index) => {
      if (axis.props && axis.props.active && axis.props.filterCardId === filterCardId) {
        dispatch('setAxisValue', {
          id: index,
          props: { filterCardId: '', key: '' },
        })
      }
    })

    const filterCard = getters.getFilterCard(filterCardId)

    BoolContainerModel.releaseFilterCardNumber(filterCard.props.key, filterCard.props.index)

    // TODO: reset successsor

    // resetting all parentInteraction constraints that have current FilterCardId as their value
    const constraints = getters.getConstraints
    Object.keys(constraints).forEach(constraintId => {
      const c = constraints[constraintId]
      if (c.props.attrKey === 'parentInteraction' && c.props.value.value === filterCardId) {
        commit(types.CONSTRAINTS_SET_VALUE, {
          constraintId,
          value: null,
        })
      }
    })

    for (let c = 0; c < filterCard.props.constraints.length; c++) {
      if (getters.isVariantConstraint(filterCard.props.constraints[c])) {
        const variantFilterCards = [...getters.getVariantFilterCards]
        variantFilterCards.splice(variantFilterCards.indexOf(filterCard.id), 1)
        commit(types.SET_VARIANT_FILTER_CARDS, {
          variantFilterCards,
        })
        break
      }
    }

    // Clear advanced time filters on remaining cards that reference the deleted card
    const boolFilterContainers = getters.getBoolFilterContainers()
    Object.keys(boolFilterContainers).forEach(containerId => {
      const container = boolFilterContainers[containerId]
      container.props.filterCards.forEach(cardId => {
        if (cardId === filterCardId) return // skip the card being deleted
        const card = getters.getFilterCard(cardId)
        const timeFilters = card.props.layout?.advancedTimeLayout?.props?.timeFilterModel?.timeFilters || []
        const hasDependency = timeFilters.some(tf => tf.targetInteraction === filterCardId)
        if (hasDependency) {
          commit(types.ADVANCEDTIME_SET_TIMEFILTER, {
            filterCardId: cardId,
            timeFilters: []
          })
        }
      })
    })

    commit(types.FILTERCARD_DELETE, { filterCardId })
  },
  updateDateConstraintValue(
    { commit, getters, rootGetters },
    { constraintId, fromDateValue, toDateValue, isUTC = true }
  ) {
    const isDateType = rootGetters.getMriFrontendConfig.getAttributeByPath(constraintId).getType() === 'time'

    if (isUTC) {
      if (isDateType) {
        toDateValue = DateUtils.toUTCEndOfDay(toDateValue)
      }
    } else {
      if (isDateType) {
        toDateValue = DateUtils.toEndOfDay(toDateValue)
      }
      fromDateValue = DateUtils.toUTCDate(fromDateValue)
      toDateValue = DateUtils.toUTCDate(toDateValue)
    }

    commit(types.CONSTRAINTS_DATETIME_SET_VALUE, {
      constraintId,
      fromDateValue,
      toDateValue,
    })
  },
  updateConstraintValue({ commit, getters }, { constraintId, value }) {
    commit(types.CONSTRAINTS_SET_VALUE, { constraintId, value })
  },
  updateFilterCardTimeFilter({ commit }, { filterCardId, timeFilters }) {
    commit(types.ADVANCEDTIME_SET_TIMEFILTER, { filterCardId, timeFilters })
  },
  clearAllConstraintsOfFilterCard({ commit, getters }, { filterCardId }) {
    const filterCard: FilterCardModel = getters.getFilterCard(filterCardId)

    // denormalize/deserialize to find all the Constraint objects in
    // query.model.entities.constraints from filterCardProps.constraints
    const filterCardProps = denormalize(
      filterCard.props,
      { constraints: [constraintSchema] },
      { constraints: getters.getConstraints }
    )
    filterCardProps.constraints = filterCardProps.constraints.map(c => {
      // create Constraint objects afresh
      const constraint = ConstraintModel.createConstraint(
        c.props.attrKey,
        {
          name: c.props.name,
          type: c.props.type,
          cardId: filterCardId,
          parents: c.props.parents || [],
        },
        filterCard.props.key
      )
      constraint.parentId = filterCardId
      return constraint
    })

    // noramlize and commit the newly created Constraint objects
    commit(types.CONSTRAINTS_ADD, {
      constraintsToAdd: normalize(filterCardProps.constraints, [constraintSchema]).entities.constraints,
    })
  },
  clearFilterCardTimeFilter({ commit }, { filterCardId }) {
    const timeFilters = []
    commit(types.ADVANCEDTIME_SET_TIMEFILTER, { filterCardId, timeFilters })
  },
  clearResponse({ commit }) {
    commit(types.RESPONSE_SET, { response: {} })
  },
  firePatientCountQuery({ commit, dispatch }, { params, type }) {
    return dispatch('getPatientCount', { params })
      .then(response => {
        if (type === 'total') {
          commit(types.SET_TOTAL_PATIENT_COUNT, {
            totalPatientCount: response.data.data[0]['patient.attributes.pcount'],
          })
        } else {
          commit(types.SET_CURRENT_PATIENT_COUNT, {
            currentPatientCount: response.data.data[0]['patient.attributes.pcount'],
          })
        }
      })
      .catch(() => {
        if (type === 'total') {
          commit(types.SET_TOTAL_PATIENT_COUNT, {
            totalPatientCount: '--',
          })
        } else {
          commit(types.SET_CURRENT_PATIENT_COUNT, {
            currentPatientCount: '--',
          })
        }
      })
  },
  fireQuery({ commit, dispatch, getters, rootGetters }, { params, url, cancelToken }) {
    const hasReleaseDate = !!rootGetters.getSelectedDatasetVersion?.releaseDate

    // Compress all keys except datasetId and ruleOrder
    const compress = Object.keys(params).filter(e => e !== 'datasetId' && e !== 'ruleOrder')
    const urlWithQuerystring = QueryString({
      url,
      queryString: {
        ...params,
        ...(hasReleaseDate && { releaseDate: rootGetters.getSelectedDatasetVersion.releaseDate }),
      },
      compress,
    })

    return dispatch('ajaxAuth', {
      cancelToken,
      url: urlWithQuerystring,
      method: 'get',
    })
      .then(response => {
        if (response.data.noDataReason) {
          response.data.noDataReason = getters.getText(response.data.noDataReason)
        }
        commit(types.SET_CHART_SELECTION, { selection: [] })
        if (rootGetters.getActiveChart === 'list') {
          response.data.sql = response.data.data.map(listItem => listItem.sql).join(';\n')
        }
        commit(types.RESPONSE_SET, { response: { data: response.data } })
        return response.data
      })
      .catch(error => {
        commit(types.SET_CHART_SELECTION, { selection: [] })
        commit(types.RESPONSE_SET, {
          response: {
            data: {
              data: [],
              totalPatientCount: 0,
              // Keep WHY it failed. The chart component renders the reason locally, but the
              // store response loses it — and an empty result with no reason is
              // indistinguishable from "no matching patients" for anything that reads the
              // response back.
              error:
                error?.response?.data?.errorMessage ||
                error?.response?.data?.err ||
                error?.message ||
                'The chart query failed.',
            },
          },
        })
        throw error
      })
  },
  setChartSelection({ commit }, { selection }) {
    commit(types.SET_CHART_SELECTION, { selection })
  },
  setTotalPatientCount({ commit }, { totalPatientCount }) {
    commit(types.SET_TOTAL_PATIENT_COUNT, { totalPatientCount })
  },
  setCurrentPatientCount({ commit }, { currentPatientCount }) {
    commit(types.SET_CURRENT_PATIENT_COUNT, { currentPatientCount })
  },
  // Called by setFireRequest when a new query goes out. Marks the displayed count as
  // no longer reflecting the cohort on screen WITHOUT touching the count itself.
  invalidateCurrentPatientCount({ commit }) {
    commit(types.SET_CURRENT_PATIENT_COUNT_STALE, { stale: true })
  },
  drilldown({ rootGetters, getters, dispatch }, { aSelectedData }) {
    try {
      const collectedConstraints = {}
      let collectedDateConstraints = {}
      let fromDate
      let toDate
      aSelectedData.forEach(oData => {
        collectedConstraints[oData.id] = collectedConstraints[oData.id] || {
          filterValues: [],
        }

        // Range Constraint
        if (
          rootGetters.getMriFrontendConfig.getAttributeByPath(oData.id).getType() === 'num' &&
          typeof oData.value === 'string'
        ) {
          // get expressions operator
          const sOperator = '>='
          const matchIntervals = oData.value.match(/[-]?[0-9]+([,.][0-9]+)?/g) || []
          // for matching intervals
          if (matchIntervals.length === 2) {
            //
            // remove whitespaces and add the interval notation
            const andContainer = []
            const filterVal1 = {
              op: '>',
              value: parseInt(matchIntervals[0]),
            }
            const filterVal2 = {
              op: '<',
              value: parseInt(matchIntervals[1]),
            }

            andContainer.push(filterVal1)
            andContainer.push(filterVal2)

            collectedConstraints[oData.id].filterValues.push({
              and: andContainer,
            })
            collectedConstraints[oData.id].type = 'range'
          }
          if (matchIntervals.length === 1) {
            //
            // remove whitespaces and add the interval notation
            const andContainer = []
            const filterVal1 = {
              op: '=',
              value: parseInt(matchIntervals[0]),
            }
            collectedConstraints[oData.id].filterValues.push(filterVal1)
          }
        } else if (
          rootGetters.getMriFrontendConfig.getAttributeByPath(oData.id).getType() === 'num' &&
          typeof oData.value === 'number'
        ) {
          // Range Contraint with number
          // remove whitespaces and add the interval notation
          const andContainer = []
          const filterVal1 = {
            op: '=',
            value: oData.value,
          }
          collectedConstraints[oData.id].filterValues.push(filterVal1)
        } else if (rootGetters.getMriFrontendConfig.getAttributeByPath(oData.id).getType() === 'text') {
          // Domain Constraint
          const filterValue = {
            display_value: oData.value,
            score: 1,
            text: '',
            value: oData.value,
          }

          collectedConstraints[oData.id].filterValues.push(filterValue)

          oData = oData.id
        } else if (
          rootGetters.getMriFrontendConfig.getAttributeByPath(oData.id).getType() === 'time' ||
          rootGetters.getMriFrontendConfig.getAttributeByPath(oData.id).getType() === 'datetime'
        ) {
          const parsedDate = parseDrilldownDateValue(oData.value)

          if (parsedDate) {
            const temp = parsedDate

            if (!fromDate) {
              fromDate = parsedDate
              toDate = parsedDate
            } else {
              if (fromDate > temp) {
                fromDate = temp
              } else if (temp > toDate) {
                toDate = temp
              }
            }

            collectedDateConstraints = {
              constraintId: oData.id,
              fromDateValue: new Date(fromDate),
              toDateValue: new Date(toDate),
            }
          }
        }
      })
      if (Object.keys(collectedDateConstraints).length !== 0) {
        dispatch('updateDateConstraintValue', collectedDateConstraints)
      }

      Object.keys(collectedConstraints).forEach(sAttrPath => {
        let filterVals: any[] = []
        if (!collectedConstraints[sAttrPath].type) {
          filterVals = Array.from(
            collectedConstraints[sAttrPath].filterValues.reduce((m, t) => m.set(t.value, t), new Map()).values()
          )
        } else {
          filterVals = collectedConstraints[sAttrPath].filterValues
        }
        dispatch('updateConstraintValue', {
          constraintId: sAttrPath,
          value: filterVals,
        })
      })
      const plotlyElement = getters.getPlotlyElement
      if (plotlyElement) {
        getters.getPlotlyElement.dispatchEvent?.(new CustomEvent('plotly_deselect'))
        Plotly.update(plotlyElement, {}, { selections: [] })
      }
    } catch (e) {
      console.log('Error in query.ts, drilldown', e)
    }
  },
  toggleFilterBooleanCondition({ commit, getters, dispatch, rootGetters }, { filterCardId, operator, parentId }) {
    let newFilterCardModels = []
    // NOTE: below getters.getBoolContainerRoot assumes that all actions are to be performed in root BoolContainer
    const boolContainer = getters.getBoolContainer(getters.getBoolContainerRoot())
    const boolContainerModel = denormalize(boolContainer, boolContainerSchema, getters.getEntities)
    const boolFilterConainterModels = boolContainerModel.props.boolfiltercontainers
    const filterCardModels = boolFilterConainterModels.find(m => m.id === parentId).props.filterCards
    const boolFilterContainerIndex = boolFilterConainterModels.findIndex(c => c.id === parentId)

    // Removing the filtercard from the current BoolFilterContainer
    newFilterCardModels = filterCardModels.splice(filterCardModels.findIndex(m => m.id === filterCardId))

    // Creating a new BoolFilterContainer, with the removed filtercard
    const newFilterContainer = new BoolFilterContainerModel(rootGetters.getMriFrontendConfig, {
      type: 'boolfiltercontainer',
      filterCards: [...newFilterCardModels],
    })
    boolFilterConainterModels.splice(boolFilterContainerIndex + 1, 0, newFilterContainer)

    dispatch('setBoolContainerState', boolContainerModel)
    dispatch('resetAxes')
  },
  toggleFilterContainerBooleanCondition({ commit, getters, dispatch }, { filterContainerId, operator, parentId }) {
    const boolContainer = getters.getBoolContainer(parentId)
    const boolContainerModel = denormalize(boolContainer, boolContainerSchema, getters.getEntities)
    const boolFilterConainterModels = boolContainerModel.props.boolfiltercontainers
    const boolFilterContainerModel = boolFilterConainterModels.find(m => m.id === filterContainerId)
    const filterCardModels = boolFilterContainerModel.props.filterCards
    const filterContainerIndex = boolContainer.props.boolfiltercontainers.indexOf(filterContainerId)

    if (filterContainerIndex > -1 && filterContainerIndex - 1 < boolFilterConainterModels.length) {
      // Find the previous container with the same inclusion/exclusion type
      const isExclusionContainer = filterCardModels.some((fc: any) => fc.props?.excludeFilter)
      let prevIndex = filterContainerIndex - 1
      while (prevIndex >= 0) {
        const candidateIsExclusion = boolFilterConainterModels[prevIndex].props.filterCards.some(
          (fc: any) => fc.props?.excludeFilter
        )
        if (candidateIsExclusion === isExclusionContainer) break
        prevIndex--
      }

      const prevBoolFilterContainerModel = boolFilterConainterModels[prevIndex]
      prevBoolFilterContainerModel.props.filterCards = [
        ...prevBoolFilterContainerModel.props.filterCards,
        ...filterCardModels,
      ]
      boolFilterConainterModels.splice(filterContainerIndex, 1)
    }

    dispatch('setBoolContainerState', boolContainerModel)
    dispatch('resetAxes')
  },
  reorderFilterCards({ commit, getters }, { boolFilterContainerId, newOrder }) {
    const boolFilterContainer = getters.getBoolFilterContainer(boolFilterContainerId)
    // newOrder comes from nonBasicCards computed property which already filters out 'patient' cards.
    // Extract and preserve 'patient' card at the beginning, then merge with the reordered cards.
    const patientCard = boolFilterContainer.props.filterCards.filter(f => f === 'patient')
    const updatedBoolFilterContainer = {
      ...boolFilterContainer,
      props: {
        ...boolFilterContainer.props,
        filterCards: [...patientCard, ...newOrder],
      },
    }
    commit(types.BOOLFILTERCONTAINER_UPDATE, updatedBoolFilterContainer)
  },
  removeBoolFilterContainer({ getters, dispatch }, { boolFilterContainerId }) {
    const boolContainer = getters.getBoolContainer(getters.getBoolContainerRoot())
    const boolContainerModel = denormalize(boolContainer, boolContainerSchema, getters.getEntities)
    const index = boolContainerModel.props.boolfiltercontainers.findIndex(m => m.id === boolFilterContainerId)
    if (index > -1) {
      boolContainerModel.props.boolfiltercontainers.splice(
        boolContainerModel.props.boolfiltercontainers.findIndex(m => m.id === boolFilterContainerId),
        1
      )
      dispatch('setBoolContainerState', boolContainerModel)
    }
  },
  updateCohortEntryExit({ commit }, { filterCardId, key, toggle }) {
    commit(types.FILTERCARD_TOGGLE_IS_ENTRY_EXIT, { filterCardId, key, toggle })
  },
  resetAllFilterCardEntryExit({ commit }, { key }) {
    commit(types.FILTERCARD_RESET_ALL_ENTRY_EXIT, { key })
  },
  setPlotlyElement({ commit }, { element }) {
    commit(types.PLOTLY_SET_ELEMENT, element)
  },
}

// mutations
const mutations = {
  [types.SET_CHART_COVER](modulestate, { chartCover }) {
    modulestate.chartCover = chartCover
  },
  [types.SET_TOTAL_PATIENT_COUNT](modulestate, { totalPatientCount }) {
    modulestate.totalPatientCount = totalPatientCount
  },
  [types.SET_CURRENT_PATIENT_COUNT](modulestate, { currentPatientCount }) {
    modulestate.currentPatientCount = currentPatientCount
    // Every writer here is a resolved query — a real number, '--' on failure, or a
    // no-data result — so the count once again reflects the cohort on screen.
    modulestate.currentPatientCountStale = false
  },
  [types.SET_CURRENT_PATIENT_COUNT_STALE](modulestate, { stale }) {
    modulestate.currentPatientCountStale = stale
  },
  [types.SET_VARIANT_FILTER_CARDS](modulestate, { variantFilterCards }) {
    modulestate.variantFilterCards = variantFilterCards
  },
  [types.SET_CHART_SELECTION](modulestate, { selection }) {
    modulestate.chartSelection = selection
  },
  [types.RESPONSE_SET](modulestate, { response }) {
    modulestate.response = { ...modulestate.response, ...response }
  },
  [types.AXIS_SET_VALUE](modulestate, { id, props }) {
    modulestate.axes.hasOwnProperty(id)
      ? (modulestate.axes[id].props = {
          ...modulestate.axes[id].props,
          ...props,
        })
      : (modulestate.axes[id].props = { ...props })
  },
  [types.AXIS_ADD](modulestate, { axes }) {
    modulestate.axes = axes
  },
  [types.CHART_PROPERTY_SET_VALUE](modulestate, { id, props }) {
    modulestate.chartProperties[id].props = {
      ...modulestate.chartProperties[id].props,
      ...props,
    }
  },
  [types.CHART_PROPERTY_ADD](modulestate, { chartProperties }) {
    for (let ii = 0; ii < chartProperties.length; ii += 1) {
      if (modulestate.chartProperties[ii]) {
        modulestate.chartProperties[ii].props = {
          ...modulestate.chartProperties[ii].props,
          ...chartProperties[ii].props,
        }
      } else {
        modulestate.chartProperties.push(chartProperties[ii])
      }
    }
  },
  [types.BOOLFILTERCONTAINER_ADD](modulestate, boolFilterContainer) {
    modulestate.boolContainerState.content.push(boolFilterContainer)
  },
  [types.QUERY_RESET](modulestate) {
    modulestate.model = {
      entities: {},
      result: '',
    }
  },
  [types.BOOLCONTAINER_ADD](modulestate, boolContainerModel) {
    const normalizedData = normalize(boolContainerModel, boolContainerSchema)
    modulestate.model = { ...modulestate.model, ...normalizedData }
  },
  [types.BOOLFILTERCONTAINER_UPDATE](moduleState, boolFilterContainerModel) {
    moduleState.model.entities.boolFilterContainers[boolFilterContainerModel.id] = boolFilterContainerModel
  },
  [types.FILTERCARD_ADD](moduleState, { boolFilterContainerId, filterCardsToAdd, constraintsToAdd }) {
    moduleState.model.entities.boolFilterContainers[boolFilterContainerId].props.filterCards = [
      ...moduleState.model.entities.boolFilterContainers[boolFilterContainerId].props.filterCards,
      ...Object.keys(filterCardsToAdd),
    ]
    moduleState.model.entities.filterCards = {
      ...moduleState.model.entities.filterCards,
      ...filterCardsToAdd,
    }
    moduleState.model.entities.constraints = {
      ...moduleState.model.entities.constraints,
      ...constraintsToAdd,
    }
  },
  [types.FILTERCARD_DELETE](moduleState, { filterCardId }) {
    // TODO: make use of normalize and denormalize here instead of
    // manually deleting ids from objects that are referring to it
    const emptyBoolFilterContainers = []
    Object.keys(moduleState.model.entities.boolFilterContainers).forEach(key => {
      const index = moduleState.model.entities.boolFilterContainers[key].props.filterCards.indexOf(filterCardId)
      if (index > -1) {
        moduleState.model.entities.boolFilterContainers[key].props.filterCards.splice(index, 1)
        const boolFilterContainer = moduleState.model.entities.boolFilterContainers[key]
        if (boolFilterContainer.props.filterCards.length === 0) {
          emptyBoolFilterContainers.push(key)
          delete moduleState.model.entities.boolFilterContainers[key]
        }
      }
    })
    Object.keys(moduleState.model.entities.boolContainers).forEach(containerId => {
      const boolContainer = moduleState.model.entities.boolContainers[containerId]
      emptyBoolFilterContainers.forEach(filterContainerId => {
        const index = boolContainer.props.boolfiltercontainers.indexOf(filterContainerId)
        if (index > -1) {
          boolContainer.props.boolfiltercontainers.splice(index, 1)
        }
      })
    })

    delete moduleState.model.entities.filterCards[filterCardId]
  },
  [types.FILTERCARD_TOGGLE_EXCLUDE](moduleState, filterCardId) {
    moduleState.model.entities.filterCards[filterCardId].props.excludeFilter =
      !moduleState.model.entities.filterCards[filterCardId].props.excludeFilter
  },
  [types.SET_FILTERCARD_INACTIVE](moduleState, { filterCardId, inactive }) {
    moduleState.model.entities.filterCards[filterCardId].props.inactive = inactive
  },
  [types.FILTERCARD_TOGGLE_ADVANCE_TIME](moduleState, { filterCardId, advancedTimeFilter }) {
    moduleState.model.entities.filterCards[filterCardId].props.advancedTimeFilter = advancedTimeFilter
  },
  [types.FILTERCARD_TOGGLE_IS_ENTRY_EXIT](moduleState, { filterCardId, key, toggle }) {
    moduleState.model.entities.filterCards[filterCardId].props[key] = toggle
  },
  [types.FILTERCARD_RESET_ALL_ENTRY_EXIT](moduleState, { key }) {
    const filterCards = moduleState.model.entities.filterCards
    Object.keys(filterCards).forEach(id => {
      if (key) {
        filterCards[id].props[key] = false
      } else {
        filterCards[id].props.isEntry = false
        filterCards[id].props.isExit = false
      }
    })
  },
  [types.FILTERCARD_SET_PROPS](moduleState, { filterCardId, filterCardProps }) {
    moduleState.model.entities.filterCards[filterCardId].props = {
      ...moduleState.model.entities.filterCards[filterCardId].props,
      ...processStrategy(filterCardProps),
    }
  },
  [types.CONSTRAINTS_DELETE](moduleState, { constraintId }) {
    delete moduleState.model.entities.constraints[constraintId]
  },
  [types.CONSTRAINTS_ADD](moduleState, { constraintsToAdd }) {
    moduleState.model.entities.constraints = {
      ...moduleState.model.entities.constraints,
      ...constraintsToAdd,
    }
  },
  [types.CONSTRAINTS_SET_VALUE](moduleState, { constraintId, value }) {
    moduleState.model.entities.constraints[constraintId].props.value = value
  },
  [types.CONSTRAINTS_DATETIME_SET_VALUE](moduleState, { constraintId, fromDateValue, toDateValue }) {
    moduleState.model.entities.constraints[constraintId].props.fromDate.value = fromDateValue
    moduleState.model.entities.constraints[constraintId].props.toDate.value = toDateValue
  },
  [types.ADVANCEDTIME_SET_TIMEFILTER](moduleState, { filterCardId, timeFilters }) {
    moduleState.model.entities.filterCards[
      filterCardId
    ].props.layout.advancedTimeLayout.props.timeFilterModel.timeFilters = timeFilters
  },
  [types.ADVANCEDTIME_SET_TIMEFILTER_TITLE](moduleState, { filterCardId, timeFilterTitle }) {
    moduleState.model.entities.filterCards[
      filterCardId
    ].props.layout.advancedTimeLayout.props.timeFilterModel.timeFilterTitle = timeFilterTitle
  },
  [types.QUERY_SET_CHARTABLEFILTERCARDS](modulestate, filtercards) {
    modulestate.chartableFilterCards = filtercards
  },
  [types.PLOTLY_SET_ELEMENT](modulestate, element) {
    modulestate.plotlyElement = element
  },
}

export default {
  state,
  getters,
  actions,
  mutations,
}
