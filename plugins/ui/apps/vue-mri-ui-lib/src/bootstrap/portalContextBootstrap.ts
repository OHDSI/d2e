import type { PortalContextState } from '@/types/portal-props'

type TokenProvider = () => Promise<string>

type PortalBootstrapInput = Partial<PortalContextState> & {
  datasetId?: string
  releaseId?: string
  username?: string
  locale?: string
  datasource?: string
}

const parseFeatures = (value: string | undefined): PortalContextState['features'] => {
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

const toBoolean = (value: unknown): boolean => value === true || value === 'true'

export const getPortalContextBootstrap = (): PortalBootstrapInput => {
  return ((window as unknown as { __MRI_PORTAL_CONTEXT__?: PortalBootstrapInput }).__MRI_PORTAL_CONTEXT__ ||
    {}) as PortalBootstrapInput
}

export const resolvePortalContextProps = (
  searchParams: URLSearchParams,
  env: Record<string, string | undefined>,
  bootstrap: PortalBootstrapInput
): PortalContextState => {
  const getToken: TokenProvider =
    bootstrap.getToken ||
    (async () => {
      return localStorage.getItem('msaltoken') || ''
    })

  const datasetId = searchParams.get('datasetId') || bootstrap.datasetId || env.VITE_DATASET_ID || ''
  const releaseId = searchParams.get('releaseId') || bootstrap.releaseId || ''

  return {
    getToken,
    datasetId,
    releaseId,
    username: bootstrap.username || env.VITE_USERNAME || 'admin',
    locale: bootstrap.locale || env.VITE_LOCALE || 'en',
    features: bootstrap.features || parseFeatures(env.VITE_FEATURES),
    featuresLoading: bootstrap.featuresLoading ?? false,
    qeSvcUrl: bootstrap.qeSvcUrl || env.VITE_QE_SVC_URL || 'https://localhost:8081',
    REACT_APP_PUBLIC_WEBAPI_PROXY_URL:
      bootstrap.REACT_APP_PUBLIC_WEBAPI_PROXY_URL || env.VITE_REACT_APP_PUBLIC_WEBAPI_PROXY_URL,
    REACT_APP_USE_PUBLIC_WEBAPI_PROXY:
      bootstrap.REACT_APP_USE_PUBLIC_WEBAPI_PROXY || env.VITE_REACT_APP_USE_PUBLIC_WEBAPI_PROXY || 'true',
    REACT_APP_PUBLIC_WEBAPI_DATASOURCE:
      bootstrap.REACT_APP_PUBLIC_WEBAPI_DATASOURCE || bootstrap.datasource || env.VITE_DEFAULT_DATASOURCE || 'SYNPUF1K',
    debug: bootstrap.debug ?? toBoolean(env.VITE_DEBUG),
  }
}

export const resolveStandaloneAppCustomProps = (
  searchParams: URLSearchParams,
  env: Record<string, string | undefined>,
  bootstrap: PortalBootstrapInput
) => {
  const getToken: TokenProvider =
    bootstrap.getToken ||
    (async () => {
      return localStorage.getItem('msaltoken') || ''
    })

  return {
    getToken,
    username: bootstrap.username || env.VITE_USERNAME || 'admin',
    datasetId: searchParams.get('datasetId') || bootstrap.datasetId || env.VITE_DATASET_ID || '',
    locale: bootstrap.locale || env.VITE_LOCALE || 'en',
  }
}
