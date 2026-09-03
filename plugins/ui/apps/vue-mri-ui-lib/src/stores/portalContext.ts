import { defineStore } from 'pinia'
import type { Pinia } from 'pinia'
import type { PortalContextState } from '@/types/portal-props'

export const usePortalContextStore = defineStore('portalContext', {
  state: (): PortalContextState => ({
    getToken: async () => '',
    datasetId: '',
    releaseId: '',
    username: '',
    locale: 'en',
    features: [],
    featuresLoading: true,
    qeSvcUrl: undefined,
    REACT_APP_PUBLIC_WEBAPI_PROXY_URL: undefined,
    REACT_APP_USE_PUBLIC_WEBAPI_PROXY: undefined,
    REACT_APP_PUBLIC_WEBAPI_DATASOURCE: undefined,
    debug: undefined,
  }),
  actions: {
    applyProps(next: Partial<PortalContextState>) {
      for (const key of Object.keys(next) as Array<keyof PortalContextState>) {
        const value = next[key]
        if (value !== undefined) {
          this.$state[key] = value
        }
      }
    },
  },
})

export const createPortalContextStore = (initialProps: PortalContextState, pinia?: Pinia) => {
  const store = pinia ? usePortalContextStore(pinia) : usePortalContextStore()
  store.applyProps(initialProps)
  return store
}
