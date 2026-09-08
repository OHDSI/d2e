import { describe, expect, it, vi } from 'vitest'
import { runBulkDelete } from '../bulkDeleteExplorations'

const record = (displayName: string): BookmarkDisplay => ({ displayName }) as unknown as BookmarkDisplay

const makeDeps = () => ({
  deleteOne: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn().mockResolvedValue(undefined),
  clearSelection: vi.fn(),
  clearActiveBookmarkIfDeleted: vi.fn().mockResolvedValue(undefined),
  notifyFailure: vi.fn(),
})

describe('runBulkDelete', () => {
  it('deletes every target, in order', async () => {
    const deps = makeDeps()
    const targets = [record('one'), record('two'), record('three')]

    await runBulkDelete(targets, deps)

    expect(deps.deleteOne).toHaveBeenCalledTimes(3)
    expect(deps.deleteOne.mock.calls.map(([r]: [BookmarkDisplay]) => r.displayName)).toEqual(['one', 'two', 'three'])
  })

  it('one failure does not stop the rest', async () => {
    const deps = makeDeps()
    deps.deleteOne.mockImplementation(async (r: BookmarkDisplay) => {
      if (r.displayName === 'two') throw new Error('boom')
    })
    const targets = [record('one'), record('two'), record('three')]

    await runBulkDelete(targets, deps)

    expect(deps.deleteOne).toHaveBeenCalledTimes(3)
  })

  it('the failed names reach the alert, in the order they failed', async () => {
    const deps = makeDeps()
    deps.deleteOne.mockImplementation(async (r: BookmarkDisplay) => {
      if (r.displayName === 'two' || r.displayName === 'three') throw new Error('boom')
    })
    const targets = [record('one'), record('two'), record('three')]

    await runBulkDelete(targets, deps)

    expect(deps.notifyFailure).toHaveBeenCalledWith(['two', 'three'])
  })

  it('does not call notifyFailure when nothing failed', async () => {
    const deps = makeDeps()
    const targets = [record('one'), record('two')]

    await runBulkDelete(targets, deps)

    expect(deps.notifyFailure).not.toHaveBeenCalled()
  })

  it('reloads exactly once, after the loop', async () => {
    const deps = makeDeps()
    const callOrder: string[] = []
    deps.deleteOne.mockImplementation(async () => {
      callOrder.push('delete')
    })
    deps.reload.mockImplementation(async () => {
      callOrder.push('reload')
    })
    const targets = [record('one'), record('two'), record('three')]

    await runBulkDelete(targets, deps)

    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['delete', 'delete', 'delete', 'reload'])
  })

  it('reloads exactly once even when every delete fails', async () => {
    const deps = makeDeps()
    deps.deleteOne.mockRejectedValue(new Error('boom'))
    const targets = [record('one'), record('two')]

    await runBulkDelete(targets, deps)

    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('clears the selection after the run', async () => {
    const deps = makeDeps()
    const targets = [record('one')]

    await runBulkDelete(targets, deps)

    expect(deps.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('clears the selection even when every delete fails', async () => {
    const deps = makeDeps()
    deps.deleteOne.mockRejectedValue(new Error('boom'))
    const targets = [record('one')]

    await runBulkDelete(targets, deps)

    expect(deps.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('passes every target and the failed names to clearActiveBookmarkIfDeleted', async () => {
    const deps = makeDeps()
    deps.deleteOne.mockImplementation(async (r: BookmarkDisplay) => {
      if (r.displayName === 'two') throw new Error('boom')
    })
    const targets = [record('one'), record('two')]

    await runBulkDelete(targets, deps)

    expect(deps.clearActiveBookmarkIfDeleted).toHaveBeenCalledWith(targets, ['two'])
  })

  it('does not use Promise.all — deletes are sequential, not concurrent', async () => {
    const deps = makeDeps()
    let active = 0
    let maxActive = 0
    deps.deleteOne.mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
    })
    const targets = [record('one'), record('two'), record('three')]

    await runBulkDelete(targets, deps)

    // Promise.all would let all three run at once, so maxActive would be 3.
    expect(maxActive).toBe(1)
  })
})
