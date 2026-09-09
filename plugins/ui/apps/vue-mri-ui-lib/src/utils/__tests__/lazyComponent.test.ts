import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest'

/**
 * The charts load on demand so the chart libraries stay out of the entry
 * bundle. That makes each one a network dependency, and this app sets
 * `app.config.errorHandler = () => null` in every non-debug build — so a
 * rejected chunk fetch is discarded and the pane just renders empty.
 *
 * These tests pin the `onError` policy that stops that: retry once, then fail
 * loudly enough to reach the console and visibly enough to reach the user.
 *
 * `defineAsyncComponent` is mocked so the options object can be inspected
 * directly. That keeps this a test of the retry policy rather than of
 * rendering.
 */
const capturedOptions: Record<string, any>[] = []

vi.mock('vue', () => ({
  defineAsyncComponent: (options: Record<string, any>) => {
    capturedOptions.push(options)
    return { name: 'stub' }
  },
}))
vi.mock('../../components/LazyLoadError.vue', () => ({ default: { name: 'lazyLoadError' } }))

import { lazyComponent } from '../lazyComponent'
import LazyLoadError from '../../components/LazyLoadError.vue'

const optionsFor = (loader = async () => ({})) => {
  capturedOptions.length = 0
  lazyComponent('TestChart', loader as never)
  return capturedOptions[0]
}

describe('lazyComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an error component rather than nothing when the chunk cannot load', () => {
    expect(optionsFor().errorComponent).toBe(LazyLoadError)
  })

  it('retries once, because the common causes are transient', () => {
    const retry = vi.fn()
    const fail = vi.fn()

    optionsFor().onError(new Error('network'), retry, fail, 1)

    expect(retry).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
  })

  it('gives up on the second failure instead of retrying forever', () => {
    const retry = vi.fn()
    const fail = vi.fn()

    optionsFor().onError(new Error('network'), retry, fail, 2)

    expect(fail).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
  })

  it('logs through console.error, which the suppressed Vue handler cannot swallow', () => {
    const error = new Error('network')

    optionsFor().onError(error, vi.fn(), vi.fn(), 2)

    expect(console.error).toHaveBeenCalledWith('[lazyComponent] TestChart failed to load', error)
  })

  it('sets a timeout, so a stalled fetch does not hang on the loading state', () => {
    expect(optionsFor().timeout).toBeGreaterThan(0)
  })
})
