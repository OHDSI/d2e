import { vi, describe, expect, it } from 'vitest'

vi.mock('axios')
vi.mock('@/stores/notifications', () => ({
  useNotificationStore: () => ({ setToastMessage: vi.fn(), setAlertMessage: vi.fn() }),
}))
vi.mock('@/composables/usePortalContext', () => ({
  usePortalContext: () => ({ datasetId: '', releaseId: '' }),
}))

import configModule from '../config'
import * as types from '../../mutation-types'

/**
 * The data-source list exists only to turn the active dataset id into a name
 * for display. `setDataset` commits `{ id }` and nothing else, so without this
 * the header shows a UUID.
 */
describe('store - config: data sources', () => {
  const sources = [
    { sourceKey: 'aaa-111', sourceName: 'Demo dataset' },
    { sourceKey: 'bbb-222', sourceName: 'test dataset 2' },
  ]

  describe('getSelectedDatasetName', () => {
    const name = (selectedDataset: unknown, dataSources: unknown[]) =>
      configModule.getters.getSelectedDatasetName({ selectedDataset, dataSources } as never)

    it('resolves the id to its source name', () => {
      expect(name({ id: 'bbb-222' }, sources)).toBe('test dataset 2')
    })

    it('falls back to the id while the list has not arrived', () => {
      // The fetch is not awaited, so this is the normal first render, not an
      // edge case. Showing a UUID beats showing nothing.
      expect(name({ id: 'bbb-222' }, [])).toBe('bbb-222')
    })

    it('falls back to the id when the id is not in the list', () => {
      expect(name({ id: 'unknown-999' }, sources)).toBe('unknown-999')
    })

    it('is empty when no dataset is selected', () => {
      expect(name(undefined, sources)).toBe('')
      expect(name({}, sources)).toBe('')
    })

    it('prefers the name even when a source carries an empty name', () => {
      // An empty sourceName must not render as a blank header.
      expect(name({ id: 'ccc-333' }, [{ sourceKey: 'ccc-333', sourceName: '' }])).toBe('ccc-333')
    })
  })

  describe('fireGetDataSources', () => {
    it('commits the fetched list', async () => {
      const commit = vi.fn()
      const dispatch = vi.fn().mockResolvedValue({ data: sources })

      await configModule.actions.fireGetDataSources({ commit, dispatch } as never)

      expect(dispatch).toHaveBeenCalledWith('ajaxAuth', {
        method: 'get',
        url: '/d2e-webapi/source/sources',
      })
      expect(commit).toHaveBeenCalledWith(types.SET_DATA_SOURCES, sources)
    })

    it('commits an empty list when the response is not an array', async () => {
      const commit = vi.fn()
      const dispatch = vi.fn().mockResolvedValue({ data: { error: 'nope' } })

      await configModule.actions.fireGetDataSources({ commit, dispatch } as never)

      expect(commit).toHaveBeenCalledWith(types.SET_DATA_SOURCES, [])
    })

    it('swallows a failure and commits nothing', async () => {
      // The name is decoration and the getter falls back to the id, so a
      // failure here must not reach the user or break the page.
      const commit = vi.fn()
      const dispatch = vi.fn().mockRejectedValue(new Error('401'))

      await expect(configModule.actions.fireGetDataSources({ commit, dispatch } as never)).resolves.toBeUndefined()

      expect(commit).not.toHaveBeenCalled()
    })
  })
})
