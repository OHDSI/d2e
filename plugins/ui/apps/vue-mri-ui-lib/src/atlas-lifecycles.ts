/**
 * Native Atlas3 single-spa entry for Patient Analytics (no iframe).
 *
 * Atlas3 loads this bundle with System.import and calls the exported
 * bootstrap/mount/unmount lifecycles directly, passing its own customProps
 * (authContext, messageBus, domElement, getToken, datasetId, locale, ...).
 * Those props differ from the portal contract src/lifecycles.ts expects:
 *
 * - qeSvcUrl is absent, which would make the vuex auth module fall back to
 *   import.meta.env.VITE_HOST (undefined in this build). Atlas3 serves the
 *   plugin same-origin, so qeSvcUrl is normalized to window.location.origin
 *   (the same value the iframe boot uses).
 * - features / featuresLoading / releaseId may be absent; default them so the
 *   portal-context store never sees undefined.
 *
 * The `alp-terminology-open` DOM event is answered here via the host's
 * messageBus instead of the iframe postMessage relay in
 * utils/atlasTerminologyBridge.ts: the host's concept set chooser is requested
 * with `conceptSet:choose` and the choice is delivered through the event's own
 * onClose, so callers are unchanged.
 */

import {
  bootstrap as portalBootstrap,
  mount as portalMount,
  unmount as portalUnmount,
  update as portalUpdate,
} from './lifecycles'

type AtlasProps = Record<string, any>

const normalizeProps = (props: AtlasProps): AtlasProps => ({
  ...props,
  qeSvcUrl: window.location.origin,
  features: props.features ?? [],
  featuresLoading: props.featuresLoading ?? false,
  releaseId: props.releaseId ?? '',
})

/**
 * Atlas3 resolves customProps.domElement with getElementById at mount time.
 * When that runs before PluginContainer has rendered, domElement arrives null
 * and single-spa-vue appends its own div to document.body — the app then
 * renders outside the host layout. Poll briefly for the container the host
 * promises (`plugin-<appId>`) before falling back to the host's value.
 */
const resolveDomElement = async (props: AtlasProps, timeoutMs = 5000): Promise<HTMLElement | null> => {
  if (props.domElement instanceof HTMLElement) return props.domElement
  const containerId = props.containerId || (props.appId ? `plugin-${props.appId}` : null)
  if (!containerId) return props.domElement ?? null
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const el = document.getElementById(containerId)
    if (el) return el
    if (Date.now() >= deadline) return null
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

type TerminologyCloseValues = {
  currentConceptSet?: { id: string; name: string }
}

type TerminologyEventProps = {
  mode?: string
  title?: string
  onClose?: (values?: TerminologyCloseValues) => void
}

type ConceptSetChoice = { conceptSetId: number | string; name: string }

type MessageBus = {
  request: (type: string, payload?: unknown) => Promise<unknown>
}

const OPEN_EVENT = 'alp-terminology-open'
const CHOOSE_REQUEST = 'conceptSet:choose'
const REQUEST_TIMEOUT_MS = 60_000

/**
 * Removes the listener installed by the current mount, or null when none is
 * installed.
 *
 * Not a boolean. A flag only tells you a listener was installed once, and this
 * bridge needs to be taken down: Atlas3 is a shared realm, so a listener left
 * on `window` after unmount answers another plugin's `alp-terminology-open`
 * from an app that is no longer mounted. A flag also pins the first mount's
 * `messageBus` for the life of the page — a remount would skip installation and
 * keep talking to the old bus.
 */
let removeTerminologyBridge: (() => void) | null = null

const requestConceptSetChoice = (messageBus: MessageBus, title?: string): Promise<ConceptSetChoice | null> => {
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS))
  const request = Promise.resolve(messageBus.request(CHOOSE_REQUEST, { title }))
    .then(choice => (choice as ConceptSetChoice) ?? null)
    .catch(() => null)
  return Promise.race([request, timeout])
}

const onTerminologyOpen =
  (messageBus: MessageBus) =>
  (event: Event): void => {
    const props: TerminologyEventProps = (event as CustomEvent<{ props: TerminologyEventProps }>).detail?.props ?? {}

    // CONCEPT_MULTI_SELECT wants a concept picker, which the host chooser is not.
    if (props.mode && props.mode !== 'CONCEPT_SET') return

    // The bridge this handler belongs to. The request races a 60 second
    // timeout, so it can resolve long after the user has left the plugin;
    // calling `onClose` then would reach into an unmounted app.
    const bridgeAtRequestTime = removeTerminologyBridge

    void requestConceptSetChoice(messageBus, props.title).then(choice => {
      if (removeTerminologyBridge !== bridgeAtRequestTime) return
      if (!choice) {
        // Dismissed, timed out, or errored: report no change so the caller
        // closes cleanly instead of waiting.
        props.onClose?.(undefined)
        return
      }
      props.onClose?.({ currentConceptSet: { id: String(choice.conceptSetId), name: choice.name } })
    })
  }

/**
 * Replaces any previous bridge, so a remount never stacks two listeners and
 * never keeps a stale `messageBus`.
 */
const installTerminologyBridge = (props: AtlasProps): void => {
  removeTerminologyBridge?.()
  removeTerminologyBridge = null

  const messageBus = props?.messageBus as MessageBus | undefined
  if (!messageBus || typeof messageBus.request !== 'function') return

  const handler = onTerminologyOpen(messageBus)
  window.addEventListener(OPEN_EVENT, handler)
  removeTerminologyBridge = () => window.removeEventListener(OPEN_EVENT, handler)
}

export const bootstrap = portalBootstrap

export const unmount = async (props: AtlasProps) => {
  // Before delegating, so a failure inside portalUnmount cannot leave the
  // listener attached to a realm this app has left.
  removeTerminologyBridge?.()
  removeTerminologyBridge = null
  return (portalUnmount as (p: AtlasProps) => Promise<unknown>)(props)
}

export const mount = async (props: AtlasProps) => {
  const normalizedProps = normalizeProps(props ?? {})
  const domElement = await resolveDomElement(normalizedProps)
  if (domElement) normalizedProps.domElement = domElement
  // portalMount runs single-spa-vue's handleInstance with these props, which
  // sets up the portal-context store; install the bridge right after, with
  // the messageBus captured from the same props.
  const result = await (portalMount as (p: AtlasProps) => Promise<unknown>)(normalizedProps)
  installTerminologyBridge(normalizedProps)
  return result
}

export const update = async (props: AtlasProps) =>
  (portalUpdate as (p: AtlasProps) => Promise<unknown>)(normalizeProps(props ?? {}))
