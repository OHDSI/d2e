import { defineAsyncComponent, type AsyncComponentLoader, type Component } from 'vue'
import LazyLoadError from '../components/LazyLoadError.vue'

/**
 * Declare a component that loads on demand, and fail visibly if it cannot.
 *
 * The chart-bearing components load lazily so plotly.js, echarts and d3 stay
 * out of the single-spa entry's static dependency graph. That turns each one
 * into a network dependency at runtime, which a static import never was.
 *
 * A bare `defineAsyncComponent(loader)` handles that badly here. This app sets
 * `app.config.errorHandler = () => null` in every non-debug build, in both
 * `main.ts` and `lifecycles.ts`, so a rejected chunk fetch is discarded: the
 * pane renders empty, nothing reaches the console, and there is no way back
 * without a reload the user has no reason to try.
 *
 * So: retry once, because the common causes are transient, then show
 * `LazyLoadError` and log past the suppressed handler.
 */

/** One retry. A second failure is a real one, not a blip. */
const RETRY_LIMIT = 1

/** Long enough for a large chart chunk on a slow link. */
const TIMEOUT_MS = 30000

export const lazyComponent = (name: string, loader: AsyncComponentLoader): Component =>
  defineAsyncComponent({
    loader,
    errorComponent: LazyLoadError,
    timeout: TIMEOUT_MS,
    onError: (error, retry, fail, attempts) => {
      if (attempts <= RETRY_LIMIT) {
        retry()
        return
      }
      // console.error, not the Vue error handler: that one is suppressed.
      console.error(`[lazyComponent] ${name} failed to load`, error)
      fail()
    },
  })
