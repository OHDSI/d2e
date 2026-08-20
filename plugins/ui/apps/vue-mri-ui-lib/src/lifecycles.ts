import singleSpaVue from 'single-spa-vue'
import { createApp, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import App from './App.vue'
import { createStore } from './store'
import vuetify from './plugins/vuetify'
import { createPortalContextStore, usePortalContextStore } from './stores/portalContext'
import { installDatasetChangeWatcher } from './bootstrap/datasetWatcher'
import { installPortalPropsListener } from './bootstrap/portalPropsListener'
import { initGlobalsOnce, registerDirectivesAndComponents } from './bootstrap/registerGlobals'
import { useUnsavedChanges } from './composables/useUnsavedChanges'
import type { PortalContextState } from './types/portal-props'
import './styles/themes/_main.scss'

let watcherStop: (() => void) | null = null
let propsListenerStop: (() => void) | null = null

const toPortalContextProps = (props: Partial<PortalContextState>): PortalContextState => ({
  getToken: props.getToken || (async () => ''),
  datasetId: props.datasetId || '',
  releaseId: props.releaseId || '',
  username: props.username || '',
  locale: props.locale || 'en',
  features: props.features || [],
  featuresLoading: props.featuresLoading ?? false,
  qeSvcUrl: props.qeSvcUrl,
  REACT_APP_PUBLIC_WEBAPI_PROXY_URL: props.REACT_APP_PUBLIC_WEBAPI_PROXY_URL,
  REACT_APP_USE_PUBLIC_WEBAPI_PROXY: props.REACT_APP_USE_PUBLIC_WEBAPI_PROXY,
  REACT_APP_PUBLIC_WEBAPI_DATASOURCE: props.REACT_APP_PUBLIC_WEBAPI_DATASOURCE,
  debug: props.debug,
  view: props.view,
})

const lifecycles = singleSpaVue({
  createApp,
  replaceMode: true,
  appOptions: {
    render() {
      return h(App)
    },
  },
  async handleInstance(app: any, props: PortalContextState) {
    await initGlobalsOnce()
  
    const pinia = createPinia()
    app.use(pinia)
    setActivePinia(pinia)

    const portalContextStore = createPortalContextStore(toPortalContextProps(props), pinia)

    const vuexStore = createStore()
    app.use(vuexStore)
    app.use(vuetify)
    registerDirectivesAndComponents(app)

    watcherStop = installDatasetChangeWatcher(portalContextStore, vuexStore)

    const unsavedChanges = useUnsavedChanges(vuexStore)
    propsListenerStop = installPortalPropsListener(portalContextStore, {
      expectedAppId: (props as any)?.appId,
      expectedContainerId: (props as any)?.containerId,
      guardChange: (_incoming, apply) => unsavedChanges.guard(apply),
    })

    if (import.meta.env.VITE_DEBUG !== 'true') {
      app.config.errorHandler = () => null
      app.config.warnHandler = () => null
    }
  },
})

export const { bootstrap, mount } = lifecycles

export const update = async (props: Partial<PortalContextState>) => {
  const portalContextStore = usePortalContextStore()
  portalContextStore.applyProps(props)
}

export const unmount = async (props: unknown) => {
  await lifecycles.unmount(props as any)
  watcherStop?.()
  propsListenerStop?.()
  watcherStop = null
  propsListenerStop = null
}
