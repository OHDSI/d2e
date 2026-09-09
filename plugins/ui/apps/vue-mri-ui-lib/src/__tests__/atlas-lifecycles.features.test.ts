import { vi, describe, expect, it, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * The native Atlas entry has to supply a feature list the host never sends,
 * and then not lose it.
 *
 * Analyze is gated on the `wizards` feature. Atlas3 passes no `features` at
 * all, so the entry fetches the list the portal is given. The subtle part is
 * `update()`: Atlas calls it on every prop change, including a data source
 * switch, and it still sends no features. Re-deriving a list there would hand
 * the app an empty one and turn Analyze back off.
 *
 * The entry relies on `applyProps` skipping `undefined` rather than holding
 * the list itself. These tests pin both halves of that.
 */
const mountSpy = vi.fn()
const updateSpy = vi.fn()

vi.mock('../lifecycles', () => ({
  bootstrap: vi.fn(),
  mount: (props: unknown) => {
    mountSpy(props)
    return Promise.resolve('mounted')
  },
  unmount: vi.fn().mockResolvedValue(undefined),
  update: (props: unknown) => {
    updateSpy(props)
    return Promise.resolve('updated')
  },
}))
vi.mock('../stores/notifications', () => ({
  useNotificationStore: () => ({ setAlertMessage: vi.fn(), setToastMessage: vi.fn() }),
}))

import { mount, update } from '../atlas-lifecycles'
import { usePortalContextStore } from '../stores/portalContext'

const FEATURES = [{ feature: 'wizards', isEnabled: true }]

describe('atlas-lifecycles: the feature list', () => {
  beforeEach(() => {
    mountSpy.mockClear()
    updateSpy.mockClear()
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => FEATURES } as unknown as Response))
  })

  it('fetches the feature list on mount, because the host sends none', async () => {
    await mount({ getToken: async () => 'tok', domElement: null })

    expect(fetch).toHaveBeenCalledWith('/system-portal/feature/list', {
      headers: { Authorization: 'Bearer tok' },
    })
    expect(mountSpy.mock.calls[0][0].features).toEqual(FEATURES)
  })

  it('keeps the host-supplied list when there is one', async () => {
    const hostFeatures = [{ feature: 'wizards', isEnabled: false }]
    await mount({ getToken: async () => 'tok', features: hostFeatures, domElement: null })

    expect(fetch).not.toHaveBeenCalled()
    expect(mountSpy.mock.calls[0][0].features).toEqual(hostFeatures)
  })

  it('mounts with an empty list when the fetch fails, rather than failing the mount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('401')))

    await expect(mount({ getToken: async () => 'tok', domElement: null })).resolves.toBe('mounted')
    expect(mountSpy.mock.calls[0][0].features).toEqual([])
  })

  it('leaves features undefined on update, so applyProps cannot overwrite them', async () => {
    // This is the whole reason the entry holds no state of its own.
    await update({ datasetId: 'ds-2' })

    const passed = updateSpy.mock.calls[0][0]
    expect(passed.features).toBeUndefined()
    expect(passed.datasetId).toBe('ds-2')
  })

  it('an update therefore does not clear a feature list already in the store', async () => {
    // The real proof: drive the store the way mount then update would, and
    // confirm wizards survives. Before this, a source switch turned it off.
    const store = usePortalContextStore()
    store.applyProps({ features: FEATURES } as never)
    expect(store.features).toEqual(FEATURES)

    store.applyProps({ datasetId: 'ds-2', features: undefined } as never)

    expect(store.features).toEqual(FEATURES)
    expect(store.datasetId).toBe('ds-2')
  })
})
