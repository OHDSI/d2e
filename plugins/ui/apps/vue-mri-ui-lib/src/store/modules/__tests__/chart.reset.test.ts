import { describe, expect, it, vi } from 'vitest'

vi.mock('axios')
vi.mock('../../stores/notifications', () => ({
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

import chartModule from '../chart'

const INVALID_AXIS = 'hc.mri.pa.ui.lib.Selection.Invalid'

describe('store - chart reset', () => {
  describe('setInitialAxisSelection', () => {
    it('applies the configured axis identity and default bin size while clearing unused slots', () => {
      const dispatch = vi.fn()
      const ageAxis = 'patient.attributes.age'
      const initialAxis = [ageAxis, INVALID_AXIS, INVALID_AXIS, INVALID_AXIS, 'patient.attributes.pcount']
      const defaultBins: Record<string, number | undefined> = {
        [ageAxis]: 10,
        'patient.attributes.pcount': undefined,
      }
      const rootGetters = {
        getMriFrontendConfig: {
          getInitialAxisSelection: () => initialAxis,
          getAttributeByPath: (path: string) => ({
            getDefaultBinSize: () => defaultBins[path],
          }),
        },
      }

      chartModule.actions.setInitialAxisSelection({ dispatch, rootGetters } as any)

      expect(dispatch).toHaveBeenNthCalledWith(1, 'setAxisValue', {
        id: 0,
        props: {
          key: 'age',
          filterCardId: 'patient',
          attributeId: ageAxis,
          binsize: 10,
        },
      })
      expect(dispatch).toHaveBeenNthCalledWith(2, 'setAxisValue', {
        id: 1,
        props: {
          key: '',
          filterCardId: '',
          attributeId: '',
          binsize: '',
        },
      })
      expect(dispatch).toHaveBeenNthCalledWith(5, 'setAxisValue', {
        id: 4,
        props: {
          key: 'pcount',
          filterCardId: 'patient',
          attributeId: 'patient.attributes.pcount',
          binsize: '',
        },
      })
    })

    it('uses any configured default and preserves a zero bin size', () => {
      const dispatch = vi.fn()
      const configuredAxis = 'patient.attributes.gender'
      const rootGetters = {
        getMriFrontendConfig: {
          getInitialAxisSelection: () => [configuredAxis],
          getAttributeByPath: () => ({ getDefaultBinSize: () => 0 }),
        },
      }

      chartModule.actions.setInitialAxisSelection({ dispatch, rootGetters } as any)

      expect(dispatch).toHaveBeenNthCalledWith(1, 'setAxisValue', {
        id: 0,
        props: {
          key: 'gender',
          filterCardId: 'patient',
          attributeId: configuredAxis,
          binsize: 0,
        },
      })
    })
  })

  describe('resetChart', () => {
    it('holds requests and fires once after the configured reset state is committed', async () => {
      const calls: string[] = []
      const dispatch = vi.fn((action: string) => {
        calls.push(action)
        return Promise.resolve()
      })
      const getters = {
        getMriFrontendConfig: {
          getInitialIFR: () => ({ config: 'initial-ifr' }),
        },
      }

      await chartModule.actions.resetChart({ dispatch, getters } as any)

      expect(calls).toEqual([
        'holdFireRequest',
        'queryReset',
        'resetChartProperties',
        'setIFRState',
        'setupChartDefaults',
        'releaseFireRequest',
        'setFireRequest',
      ])
      expect(dispatch).toHaveBeenCalledWith('setIFRState', { ifr: { config: 'initial-ifr' } })
    })

    it('releases the request hold without firing when state reconstruction fails', async () => {
      const calls: string[] = []
      const resetError = new Error('invalid initial IFR')
      const dispatch = vi.fn((action: string) => {
        calls.push(action)
        return action === 'setIFRState' ? Promise.reject(resetError) : Promise.resolve()
      })
      const getters = {
        getMriFrontendConfig: {
          getInitialIFR: () => ({ config: 'invalid-ifr' }),
        },
      }

      await expect(chartModule.actions.resetChart({ dispatch, getters } as any)).rejects.toThrow('invalid initial IFR')

      expect(calls).toEqual([
        'holdFireRequest',
        'queryReset',
        'resetChartProperties',
        'setIFRState',
        'releaseFireRequest',
      ])
      expect(dispatch).not.toHaveBeenCalledWith('setFireRequest')
    })
  })
})
