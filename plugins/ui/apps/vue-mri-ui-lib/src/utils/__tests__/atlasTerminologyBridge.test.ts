import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  installAtlasTerminologyBridge,
  uninstallAtlasTerminologyBridge,
} from '../atlasTerminologyBridge'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** Answers the request the bridge posts, the way the wrapper parcel does. */
const replyFromHost = (choice: unknown) => {
  const posted = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'pa-concept-set-chosen', requestId: posted.requestId, choice },
      origin: window.location.origin,
      source: window.parent,
    })
  )
}

const openTerminology = (props: Record<string, unknown>) =>
  window.dispatchEvent(new CustomEvent('alp-terminology-open', { detail: { props } }))

describe('atlasTerminologyBridge', () => {
  let postMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    postMessage = vi.fn()
    ;(window as any).__MRI_PORTAL_CONTEXT__ = { datasetId: 'ds-1' }
    Object.defineProperty(window, 'parent', { value: { postMessage }, configurable: true })
    installAtlasTerminologyBridge()
  })

  afterEach(() => {
    uninstallAtlasTerminologyBridge()
    delete (window as any).__MRI_PORTAL_CONTEXT__
    Object.defineProperty(window, 'parent', { value: window, configurable: true })
  })

  it('asks the host for a concept set and reports the choice through onClose', async () => {
    const onClose = vi.fn()
    openTerminology({ mode: 'CONCEPT_SET', onClose })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pa-choose-concept-set' }),
      window.location.origin
    )

    replyFromHost({ conceptSetId: 42, name: 'Diabetes' })
    await flush()

    expect(onClose).toHaveBeenCalledWith({ currentConceptSet: { id: '42', name: 'Diabetes' } })
  })

  it('closes cleanly when the dialog is dismissed', async () => {
    const onClose = vi.fn()
    openTerminology({ mode: 'CONCEPT_SET', onClose })
    replyFromHost(null)
    await flush()

    expect(onClose).toHaveBeenCalledWith(undefined)
  })

  it('leaves concept multi-select alone: the host chooser cannot serve it', () => {
    const onClose = vi.fn()
    openTerminology({ mode: 'CONCEPT_MULTI_SELECT', onClose })

    expect(postMessage).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('matches replies to their own request when two are outstanding', async () => {
    const first = vi.fn()
    const second = vi.fn()
    openTerminology({ mode: 'CONCEPT_SET', onClose: first })
    const firstPosted = postMessage.mock.calls.at(-1)?.[0]
    openTerminology({ mode: 'CONCEPT_SET', onClose: second })

    // Answer the first request while the second is still pending.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'pa-concept-set-chosen', requestId: firstPosted.requestId, choice: { conceptSetId: 1, name: 'One' } },
        origin: window.location.origin,
        source: window.parent,
      })
    )
    await flush()

    expect(first).toHaveBeenCalledWith({ currentConceptSet: { id: '1', name: 'One' } })
    expect(second).not.toHaveBeenCalled()
  })

  it('ignores replies from another origin', async () => {
    const onClose = vi.fn()
    openTerminology({ mode: 'CONCEPT_SET', onClose })
    const posted = postMessage.mock.calls.at(-1)?.[0]

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'pa-concept-set-chosen', requestId: posted.requestId, choice: { conceptSetId: 9, name: 'Evil' } },
        origin: 'https://attacker.example',
        source: window.parent,
      })
    )
    await flush()

    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores a same-origin reply that did not come from the parent', async () => {
    // Every plugin iframe the portal hosts is same-origin and request ids are a
    // plain counter, so origin alone would let a sibling frame answer this.
    const onClose = vi.fn()
    openTerminology({ mode: 'CONCEPT_SET', onClose })
    const posted = postMessage.mock.calls.at(-1)?.[0]

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'pa-concept-set-chosen', requestId: posted.requestId, choice: { conceptSetId: 9, name: 'Evil' } },
        origin: window.location.origin,
        source: { postMessage: vi.fn() } as any,
      })
    )
    await flush()

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not install standalone, leaving the portal listener in charge', () => {
    uninstallAtlasTerminologyBridge()
    delete (window as any).__MRI_PORTAL_CONTEXT__
    Object.defineProperty(window, 'parent', { value: window, configurable: true })

    installAtlasTerminologyBridge()
    openTerminology({ mode: 'CONCEPT_SET', onClose: vi.fn() })

    expect(postMessage).not.toHaveBeenCalled()
  })
})
