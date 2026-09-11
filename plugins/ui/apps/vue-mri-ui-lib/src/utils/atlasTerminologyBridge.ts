/**
 * Serves `alp-terminology-open` when Patient Analytics runs embedded in Atlas.
 *
 * The filter cards raise that event to ask for the terminology UI, and the only
 * listener for it is the one the d2e portal renders. Inside Atlas nothing answers
 * it, so the control appears dead. Here the request is relayed to the Atlas host,
 * which runs its own concept set chooser and hands the selection back; the result
 * is delivered through the event's own onClose, so callers are unchanged.
 *
 * Only concept set selection is served. Anything else - creating a set, picking
 * individual concepts - is left alone rather than answered with a dialog that
 * cannot do the job.
 */

type TerminologyCloseValues = {
  currentConceptSet?: { id: string; name: string }
}

type TerminologyEventProps = {
  mode?: string
  selectedConceptSetId?: string | number
  selectedDatasetId?: string
  onClose?: (values?: TerminologyCloseValues) => void
}

type ConceptSetChoice = { conceptSetId: number | string; name: string }

const OPEN_EVENT = 'alp-terminology-open'
const REQUEST_MESSAGE = 'pa-choose-concept-set'
const REPLY_MESSAGE = 'pa-concept-set-chosen'

const pending = new Map<string, (choice: ConceptSetChoice | null) => void>()
let installed = false
let requestCounter = 0

const isEmbedded = (): boolean =>
  typeof window !== 'undefined' && window.parent !== window && !!(window as any).__MRI_PORTAL_CONTEXT__

const askHostForConceptSet = (title?: string): Promise<ConceptSetChoice | null> => {
  const requestId = `pa-cs-${++requestCounter}`
  return new Promise(resolve => {
    pending.set(requestId, resolve)
    window.parent.postMessage({ type: REQUEST_MESSAGE, requestId, title }, window.location.origin)
  })
}

const onHostReply = (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return
  // Origin alone is not enough: every plugin iframe the portal hosts is
  // same-origin, and request ids are a plain counter, so a sibling frame could
  // answer a request it did not receive. The request goes to window.parent, so
  // only window.parent may answer it - the same check the parcel receiver makes.
  if (event.source !== window.parent) return
  if (event.data?.type !== REPLY_MESSAGE) return

  const resolve = pending.get(event.data.requestId)
  if (!resolve) return
  pending.delete(event.data.requestId)
  resolve(event.data.choice ?? null)
}

const onTerminologyOpen = (event: Event) => {
  const props: TerminologyEventProps = (event as CustomEvent<{ props: TerminologyEventProps }>).detail?.props ?? {}

  // CONCEPT_MULTI_SELECT wants a concept picker, which the host chooser is not.
  if (props.mode && props.mode !== 'CONCEPT_SET') return

  void askHostForConceptSet().then(choice => {
    if (!choice) {
      // Dismissed, or a host that does not serve the request: report no change so
      // the caller closes cleanly instead of waiting.
      props.onClose?.(undefined)
      return
    }
    props.onClose?.({ currentConceptSet: { id: String(choice.conceptSetId), name: choice.name } })
  })
}

/**
 * Idempotent: the boot shim imports the app once, but a re-entry must not leave
 * two listeners answering the same event.
 */
export const installAtlasTerminologyBridge = (): void => {
  if (installed || !isEmbedded()) return
  installed = true
  window.addEventListener('message', onHostReply)
  window.addEventListener(OPEN_EVENT, onTerminologyOpen)
}

/** Exposed for tests; production installs once for the life of the frame. */
export const uninstallAtlasTerminologyBridge = (): void => {
  if (!installed) return
  installed = false
  pending.clear()
  window.removeEventListener('message', onHostReply)
  window.removeEventListener(OPEN_EVENT, onTerminologyOpen)
}
