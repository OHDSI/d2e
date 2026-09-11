import { vi } from 'vitest'
import QueryString from '../../../utils/QueryString'
import * as types from '../../mutation-types'
import patientList from '../patientList'

vi.mock('axios')
vi.mock('../../../utils/QueryString')

describe('store - patientList', () => {
  describe('getters', () => {
    it('derives interaction toggles from exact selected attribute paths', () => {
      const state = {
        columnSelectionMenu: {
          patient: {
            path: 'patient',
            text: 'Basic data',
            isBasicData: true,
            subMenu: [{ path: 'patient.attributes.pid' }],
          },
          'patient.interactions.condition': {
            path: 'patient.interactions.condition',
            text: 'Condition occurrence',
            subMenu: [
              { path: 'patient.interactions.condition.attributes.code' },
              { path: 'patient.interactions.condition.attributes.startDate' },
            ],
          },
          'patient.interactions.conditionEra': {
            path: 'patient.interactions.conditionEra',
            text: 'Condition era',
            subMenu: [{ path: 'patient.interactions.conditionEra.attributes.code' }],
          },
        },
        dataModel: {
          resultDefinition: {
            selected_attributes: {
              'patient.attributes.pid': 0,
              'patient.interactions.condition.attributes.code': 1,
            },
          },
        },
      }

      const menu = patientList.getters.getColumnSelectionMenu(state, {
        getText: (key: string) => key,
      })

      expect(menu.slice(0, 3)).toMatchObject([
        {
          path: 'patient',
          toggle: true,
          selected: true,
          disabled: true,
        },
        {
          path: 'patient.interactions.condition',
          toggle: true,
          selected: true,
          disabled: false,
          data: {
            path: 'patient.interactions.condition',
            selected: false,
          },
        },
        {
          path: 'patient.interactions.conditionEra',
          toggle: true,
          selected: false,
          disabled: false,
          data: {
            path: 'patient.interactions.conditionEra',
            selected: true,
          },
        },
      ])
    })
  })

  describe('actions', () => {
    describe('setInteractionSelected', () => {
      const createAttribute = (path: string, initial = false) => ({
        path,
        data: {
          oInternalConfigAttribute: {
            patientlist: { initial },
          },
        },
      })

      const createRootGetters = (basicAttributePaths: string[]) => ({
        getMriFrontendConfig: {
          getPatientListConfig: () => ({
            getBasicDataCols: () => ({
              attributes: basicAttributePaths.map(path => ({
                getConfigPath: () => path,
              })),
            }),
            getAllAttributes: () =>
              basicAttributePaths.map(path => ({
                getConfigPath: () => path,
                isInitialInPatientList: () => true,
              })),
          }),
        },
      })

      const findDataModelCommit = (commit: any) =>
        commit.mock.calls.find(([mutationType]) => mutationType === types.PL_INIT_DATAMODEL)?.[1]

      it('adds the configured initial attributes in one state update', () => {
        const commit = vi.fn()
        const state = {
          columnSelectionMenu: {
            condition: {
              path: 'condition',
              subMenu: [createAttribute('condition.code', true), createAttribute('condition.startDate')],
            },
          },
          dataModel: {
            currentPage: 4,
            resultDefinition: {
              selected_attributes: { 'patient.pid': 0 },
              sorted_attributes: 'patient.pid',
              sorting_directions: 'A',
            },
          },
        }

        patientList.actions.setInteractionSelected(
          { commit, state, rootGetters: createRootGetters(['patient.pid']) },
          { configPath: 'condition', selected: true }
        )

        expect(findDataModelCommit(commit)).toEqual({
          resultDefinition: {
            selected_attributes: {
              'patient.pid': 0,
              'condition.code': 1,
            },
            sorted_attributes: 'patient.pid',
            sorting_directions: 'A',
          },
        })
        expect(commit).toHaveBeenCalledTimes(1)
      })

      it('removes the complete interaction and repairs a removed sort', () => {
        const commit = vi.fn()
        const state = {
          columnSelectionMenu: {
            condition: {
              path: 'condition',
              subMenu: [createAttribute('condition.code', true), createAttribute('condition.startDate')],
            },
          },
          dataModel: {
            currentPage: 3,
            resultDefinition: {
              selected_attributes: {
                'patient.pid': 0,
                'condition.code': 1,
                'condition.startDate': 2,
              },
              sorted_attributes: 'condition.code',
              sorting_directions: 'D',
            },
          },
        }

        patientList.actions.setInteractionSelected(
          { commit, state, rootGetters: createRootGetters(['patient.pid']) },
          { configPath: 'condition', selected: false }
        )

        expect(findDataModelCommit(commit)).toEqual({
          resultDefinition: {
            selected_attributes: { 'patient.pid': 0 },
            sorted_attributes: 'patient.pid',
            sorting_directions: 'A',
          },
        })
        expect(commit).toHaveBeenCalledTimes(1)
      })
    })

    describe('getPatientCount', () => {
      it('calls a backendservice', () => {
        QueryString.prototype = vi.fn().mockImplementationOnce(() => '') as any

        const dispatch = vi.fn((actionName, actionParam) =>
          Promise.resolve({
            data: {
              data: 'mock data',
            },
          })
        )

        const rootGetters = {
          getSelectedDataset: {
            id: 'mock-id',
          },
          getSelectedDatasetVersion: {
            id: 'mock-id',
          },
        }

        patientList.actions.getPatientCount({ dispatch, rootGetters }, { params: {} }).then(() => {
          expect(dispatch).toHaveBeenCalledTimes(1)
          expect(QueryString).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('initPLModel', () => {
      const createAttribute = ({ configPath, isInitialInPatientList = false }) => ({
        getConfigPath: () => configPath,
        isInitialInPatientList: () => isInitialInPatientList,
      })

      const createPatientListConfig = ({
        initialColumns = [],
        basicAttributes = [],
      }: {
        initialColumns?: string[]
        basicAttributes?: Array<{ getConfigPath: () => string; isInitialInPatientList: () => boolean }>
      }) => ({
        getDefaultPageSize: () => 20,
        getInitialTableColumns: () => initialColumns,
        getBasicDataCols: () => ({
          attributes: basicAttributes,
        }),
        getAllAttributes: () => basicAttributes,
      })

      const findInitDataModelCommit = (commit: any) =>
        commit.mock.calls.find(([mutationType]) => mutationType === types.PL_INIT_DATAMODEL)?.[1]

      it('sorts by pid key in ascending order when available', () => {
        const commit = vi.fn()
        const state = {
          dataModel: {
            resultDefinition: {
              selected_attributes: {},
              sorted_attributes: '',
              sorting_directions: '',
            },
          },
        }
        const rootGetters = {
          getMriFrontendConfig: {
            getPatientListConfig: () =>
              createPatientListConfig({
                initialColumns: ['patient.attributes.pid', 'patient.attributes.smoker'],
                basicAttributes: [
                  createAttribute({ configPath: 'patient.attributes.pid' }),
                  createAttribute({ configPath: 'patient.attributes.smoker' }),
                ],
              }),
          },
        }

        patientList.actions.initPLModel({ commit, state, rootGetters }, { loadDefault: true })
        const initDataModelPayload = findInitDataModelCommit(commit)

        expect(initDataModelPayload.resultDefinition.sorted_attributes).toEqual('patient.attributes.pid')
        expect(initDataModelPayload.resultDefinition.sorting_directions).toEqual('A')
      })

      it('falls back to first selected initial patient list column in ascending order when pid is unavailable', () => {
        const commit = vi.fn()
        const state = {
          dataModel: {
            resultDefinition: {
              selected_attributes: {},
              sorted_attributes: '',
              sorting_directions: '',
            },
          },
        }
        const rootGetters = {
          getMriFrontendConfig: {
            getPatientListConfig: () =>
              createPatientListConfig({
                initialColumns: ['patient.attributes.age', 'patient.attributes.gender'],
                basicAttributes: [
                  createAttribute({ configPath: 'patient.attributes.age', isInitialInPatientList: false }),
                  createAttribute({ configPath: 'patient.attributes.gender', isInitialInPatientList: true }),
                ],
              }),
          },
        }

        patientList.actions.initPLModel({ commit, state, rootGetters }, { loadDefault: true })
        const initDataModelPayload = findInitDataModelCommit(commit)

        expect(initDataModelPayload.resultDefinition.sorted_attributes).toEqual('patient.attributes.gender')
        expect(initDataModelPayload.resultDefinition.sorting_directions).toEqual('A')
      })
    })
  })
  describe('mutations', () => {
    let state
    beforeEach(() => {
      state = {
        request: {
          cohortDefinition: {
            cards: {},
            axes: [],
            configData: {
              configId: null,
              configVersion: null,
            },
            guarded: true,
            limit: 0,
            offset: 0,
          },
        },
        totalPatientListCount: 0,
        dataModel: {
          resultDefinition: {
            selected_attributes: {},

            // configPath to sort
            sorted_attributes: '',

            // sorting direction 'A' or 'D',
            sorting_directions: '',
          },
          pageSize: 20,
          currentPage: 1,
          noDataReason: '',
        },
        columnSelectionMenu: [],
        columnWidths: {},
      }
    })

    it('SET_TOTAL_PATIENT_LIST_COUNT', () => {
      patientList.mutations[types.SET_TOTAL_PATIENT_LIST_COUNT](state, {
        totalPatientListCount: 123,
      })
      expect(state.totalPatientListCount).toEqual(123)
    })
    it('PL_SET_REQUEST', () => {
      patientList.mutations[types.PL_SET_REQUEST](state, {
        cohortDefinition: {
          axes: [1, 2],
          guarded: false,
        },
      })
      expect(state.request.cohortDefinition.guarded).toBeFalsy()
      expect(state.request.cohortDefinition.axes[1]).toEqual(2)
    })
    it('PL_INIT_DATAMODEL', () => {
      patientList.mutations[types.PL_INIT_DATAMODEL](state, {
        resultDefinition: {
          selected_attributes: 123,
          sorted_attributes: '',
          sorting_directions: '',
        },
      })
      expect(state.dataModel.resultDefinition.selected_attributes).toEqual(123)
      expect(state.dataModel.currentPage).toEqual(state.dataModel.currentPage)
    })
  })
})
