import { createRequire } from 'node:module'
import { vi } from 'vitest'

// Mock canvas context for tests that use canvas
HTMLCanvasElement.prototype.getContext = (() => {
  return {} as any
}) as any

// Mock SAP UI5 utils and UI5Adaptor
;(globalThis as any).sap = {
  ui: {
    require: () => ({}),
    getCore: () => ({
      getEventBus: () => ({}),
      byId: () => ({}),
    }),
  },
}

// happy-dom does not implement visualViewport — Vuetify's VOverlay reads it
if (typeof window !== 'undefined' && !(window as { visualViewport?: unknown }).visualViewport) {
  ;(window as { visualViewport?: unknown }).visualViewport = {
    width: window.innerWidth ?? 1024,
    height: window.innerHeight ?? 768,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }
}

// happy-dom does not implement matchMedia — Vuetify's display composable reads it
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  ;(window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  })
}

// Fail loudly if the install gives the test run more than one copy of Vue.
// `@vue/test-utils` ships CommonJS, so its own `require('vue')` bypasses the
// `vue` alias in vite.config.ts and resolves through node. If a workspace pins
// an exact vue version, bun nests a second copy under the app and the two
// halves disagree: `mount()` renders with one runtime while the compiled SFCs
// call `renderSlot` on the other, whose `currentRenderingInstance` is always
// null. The symptom is an opaque "Cannot read properties of null (reading
// 'ce')". Keep vue ranges compatible across plugins/ui so bun hoists one copy.
{
  const require_ = createRequire(import.meta.url)
  const appVue = require_.resolve('vue/package.json')
  const testUtilsRequire = createRequire(require_.resolve('@vue/test-utils/package.json'))
  const testUtilsVue = testUtilsRequire.resolve('vue/package.json')
  if (appVue !== testUtilsVue) {
    throw new Error(
      `Duplicate Vue install detected.\n` +
        `  app        -> ${appVue}\n` +
        `  test-utils -> ${testUtilsVue}\n` +
        `Align the "vue" ranges across plugins/ui so bun hoists a single copy.`
    )
  }
}
