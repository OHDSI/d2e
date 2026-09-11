import { createApp, Component } from 'vue'
import vuetify from './plugins/vuetify'

import App from './App.vue'
import RootLayout from './RootLayout.vue'
import { createPinia } from 'pinia'
import { createStore } from './store'
import { initializeApps } from './utils/AppRegistry'
import { initializeComponents } from './utils/ComponentRegistry'
import './styles/themes/_main.scss'
import { createPortalContextStore } from './stores/portalContext'
import { initGlobalsOnce, registerDirectivesAndComponents } from './bootstrap/registerGlobals'
import type { PortalContextState } from './types/portal-props'
import { getPortalContextBootstrap, resolvePortalContextProps } from './bootstrap/portalContextBootstrap'
import { installPortalPropsListener } from './bootstrap/portalPropsListener'

let app: Component
const searchParams = new URLSearchParams(window.location.search)
const isAtlas = import.meta.env.VITE_STANDALONE_ATLAS === 'true'

if (isAtlas) {
  app = createApp(RootLayout as unknown as Component)

  // Initialize registries
  initializeApps()
  initializeComponents()
} else {
  app = createApp(App as unknown as Component)
}

const pinia = createPinia()
app.use(pinia)
app.use(createStore())

const bootstrap = getPortalContextBootstrap()
const portalContext: PortalContextState = resolvePortalContextProps(searchParams, import.meta.env, bootstrap)
const portalContextStore = createPortalContextStore(portalContext, pinia)

// The single-spa lifecycle installs this for the portal; the standalone and Atlas
// iframe entries need it too, or a dataset resolved after boot never lands.
installPortalPropsListener(portalContextStore)

app.use(vuetify)
registerDirectivesAndComponents(app as any)

// Suppress errors and warnings in production unless VITE_DEBUG is enabled
if (import.meta.env.VITE_DEBUG !== 'true') {
  app.config.errorHandler = () => null
  app.config.warnHandler = () => null
}

initGlobalsOnce()

app.mount('.vue-main')
