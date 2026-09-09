import { describe, expect, it, vi } from 'vitest'
import { deleteExploration, type DeleteExplorationDeps } from '../deleteExploration'

const makeDeps = (): DeleteExplorationDeps & {
  fireBookmarkQuery: ReturnType<typeof vi.fn>
  fireDeleteMaterializedCohortQuery: ReturnType<typeof vi.fn>
  fireDeleteAtlasCohortDefinitionQuery: ReturnType<typeof vi.fn>
} => ({
  fireBookmarkQuery: vi.fn().mockResolvedValue(undefined),
  fireDeleteMaterializedCohortQuery: vi.fn().mockResolvedValue(undefined),
  fireDeleteAtlasCohortDefinitionQuery: vi.fn().mockResolvedValue(undefined),
})

describe('deleteExploration', () => {
  it('type M calls fireDeleteMaterializedCohortQuery with the cohort definition id, and nothing else', async () => {
    const deps = makeDeps()
    const record = { displayName: 'a materialized cohort', cohortDefinition: { id: 42 } } as unknown as BookmarkDisplay

    await deleteExploration(record, deps)

    expect(deps.fireDeleteMaterializedCohortQuery).toHaveBeenCalledWith(42)
    expect(deps.fireDeleteAtlasCohortDefinitionQuery).not.toHaveBeenCalled()
    expect(deps.fireBookmarkQuery).not.toHaveBeenCalled()
  })

  it('type A calls fireDeleteAtlasCohortDefinitionQuery with the Atlas id', async () => {
    const deps = makeDeps()
    const record = {
      displayName: 'an atlas cohort',
      atlasCohortDefinition: { id: 'atlas-1' },
    } as unknown as BookmarkDisplay

    await deleteExploration(record, deps)

    expect(deps.fireDeleteAtlasCohortDefinitionQuery).toHaveBeenCalledWith('atlas-1')
    expect(deps.fireDeleteMaterializedCohortQuery).not.toHaveBeenCalled()
    expect(deps.fireBookmarkQuery).not.toHaveBeenCalled()
  })

  it('type A+M calls fireDeleteAtlasCohortDefinitionQuery with the Atlas id, not the materialized path', async () => {
    const deps = makeDeps()
    const record = {
      displayName: 'a materialized atlas cohort',
      cohortDefinition: { id: 42 },
      atlasCohortDefinition: { id: 'atlas-1' },
    } as unknown as BookmarkDisplay

    await deleteExploration(record, deps)

    expect(deps.fireDeleteAtlasCohortDefinitionQuery).toHaveBeenCalledWith('atlas-1')
    expect(deps.fireDeleteMaterializedCohortQuery).not.toHaveBeenCalled()
    expect(deps.fireBookmarkQuery).not.toHaveBeenCalled()
  })

  it('type D calls fireBookmarkQuery with cmd: delete and the bookmark id', async () => {
    const deps = makeDeps()
    const record = { displayName: 'a bookmark', bookmark: { id: 'bmk-1' } } as unknown as BookmarkDisplay

    await deleteExploration(record, deps)

    expect(deps.fireBookmarkQuery).toHaveBeenCalledWith({
      params: { cmd: 'delete' },
      method: 'delete',
      bookmarkId: 'bmk-1',
    })
    expect(deps.fireDeleteMaterializedCohortQuery).not.toHaveBeenCalled()
    expect(deps.fireDeleteAtlasCohortDefinitionQuery).not.toHaveBeenCalled()
  })

  it('type D+M calls fireBookmarkQuery with cmd: delete and the bookmark id, not the materialized path', async () => {
    const deps = makeDeps()
    const record = {
      displayName: 'a materialized bookmark',
      cohortDefinition: { id: 42 },
      bookmark: { id: 'bmk-1' },
    } as unknown as BookmarkDisplay

    await deleteExploration(record, deps)

    expect(deps.fireBookmarkQuery).toHaveBeenCalledWith({
      params: { cmd: 'delete' },
      method: 'delete',
      bookmarkId: 'bmk-1',
    })
    expect(deps.fireDeleteMaterializedCohortQuery).not.toHaveBeenCalled()
    expect(deps.fireDeleteAtlasCohortDefinitionQuery).not.toHaveBeenCalled()
  })

  it('a record with no sub-record throws, and calls nothing', async () => {
    const deps = makeDeps()
    const record = { displayName: 'nothing here' } as unknown as BookmarkDisplay

    await expect(deleteExploration(record, deps)).rejects.toThrow()

    expect(deps.fireDeleteMaterializedCohortQuery).not.toHaveBeenCalled()
    expect(deps.fireDeleteAtlasCohortDefinitionQuery).not.toHaveBeenCalled()
    expect(deps.fireBookmarkQuery).not.toHaveBeenCalled()
  })

  it('does not reload the list', async () => {
    const deps = makeDeps()
    const record = { displayName: 'a bookmark', bookmark: { id: 'bmk-1' } } as unknown as BookmarkDisplay

    await deleteExploration(record, deps)

    const loadAllCalls = deps.fireBookmarkQuery.mock.calls.filter(
      ([payload]: [{ params?: { cmd?: string } }]) => payload?.params?.cmd === 'loadAll'
    )
    expect(loadAllCalls).toHaveLength(0)
  })
})
