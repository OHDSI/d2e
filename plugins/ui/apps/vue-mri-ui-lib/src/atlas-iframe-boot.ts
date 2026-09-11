/**
 * Iframe boot shim for the Atlas3 shell (entry of atlas-iframe.html).
 *
 * Waits for the parent wrapper parcel to deliver auth/dataset context via
 * postMessage (functions cannot cross the frame boundary through URL params),
 * publishes it as window.__MRI_PORTAL_CONTEXT__ and only then imports main.ts
 * so the app boots with context already present. Subsequent pa-context
 * messages just refresh the token.
 */

type PaContextMessage = {
  type: 'pa-context'
  token?: string
  datasetId?: string
  releaseId?: string
  username?: string
  locale?: string
  qeSvcUrl?: string
}

let currentToken = ''
let currentDatasetId = ''
let booted = false

const publishContext = (data: PaContextMessage) => {
  ;(window as any).__MRI_PORTAL_CONTEXT__ = {
    getToken: async () => currentToken,
    datasetId: currentDatasetId,
    releaseId: data.releaseId || '',
    username: data.username || 'admin',
    locale: data.locale || 'en',
    qeSvcUrl: data.qeSvcUrl || window.location.origin,
  }
  // Serves alp-terminology-open, which only the portal answers otherwise.
  void import('./utils/atlasTerminologyBridge').then(m => m.installAtlasTerminologyBridge())
  void import('./main')
}

// Atlas can deliver the first context before its data source list has loaded, so
// the dataset arrives in a later message. Booting on that first context leaves the
// app without one - config requests are skipped and never retried - so hold for a
// context that carries a dataset, but not forever: a deployment that genuinely has
// none must still start.
const DATASET_WAIT_MS = 10000

let latest: PaContextMessage | null = null

const boot = () => {
  if (booted || !latest) return
  booted = true
  if (waitTimer !== null) {
    clearTimeout(waitTimer)
    waitTimer = null
  }
  currentDatasetId = latest.datasetId || ''
  publishContext(latest)
}

// The wait cannot depend on another message arriving: contexts are only re-posted
// on a five minute token refresh, so a deployment with no dataset would sit blank
// until then. It starts when the first dataset-less context lands rather than at
// load: boot() needs a context to publish, so a timer armed before one arrives
// would fire against a null `latest`, return having done nothing, and be spent -
// leaving nothing to rescue the very case it exists for.
let waitTimer: ReturnType<typeof setTimeout> | null = null

const armDatasetWait = () => {
  if (booted || waitTimer !== null) return
  waitTimer = setTimeout(boot, DATASET_WAIT_MS)
}

window.addEventListener('message', (event: MessageEvent<PaContextMessage>) => {
  if (event.origin !== window.location.origin) return
  const data = event.data
  if (!data || data.type !== 'pa-context') return

  currentToken = data.token || ''

  if (booted) {
    // A dataset that arrives after boot is announced the way the app already
    // expects to hear about it.
    if (data.datasetId && data.datasetId !== currentDatasetId) {
      currentDatasetId = data.datasetId
      const context = (window as any).__MRI_PORTAL_CONTEXT__
      if (context) context.datasetId = currentDatasetId
      window.dispatchEvent(
        new CustomEvent('custom-props-changed', { detail: { datasetId: currentDatasetId } })
      )
    }
    return
  }

  latest = data
  if (!data.datasetId) {
    armDatasetWait()
    return
  }
  boot()
})

window.parent?.postMessage({ type: 'pa-ready' }, window.location.origin)
