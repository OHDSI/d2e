/**
 * Deletes one exploration record, taking the correct one of three paths.
 *
 * Extracted from `DeleteExplorationDialog.confirm()` (moved unchanged) so the
 * single-delete dialog and the bulk-delete loop on `ExplorationsPage.vue`
 * share one implementation instead of two copies that can drift apart.
 *
 * Deliberately does NOT reload the list and does NOT touch the active
 * bookmark — the single-delete dialog and the bulk loop do both differently
 * (once per delete vs. once after the whole loop), so the caller owns them.
 */
import { getBookmarkType } from '../../utils/BookmarkUtils'

export interface DeleteExplorationDeps {
  fireBookmarkQuery: (payload: unknown) => Promise<unknown>
  fireDeleteMaterializedCohortQuery: (id: string) => Promise<unknown>
  fireDeleteAtlasCohortDefinitionQuery: (id: string) => Promise<unknown>
}

export async function deleteExploration(record: BookmarkDisplay, deps: DeleteExplorationDeps): Promise<void> {
  const bookmarkType = getBookmarkType(record)
  const isMaterializedCohort = bookmarkType === 'M'
  const isAtlasCohortDefinition = bookmarkType === 'A' || bookmarkType === 'A+M'
  const isD2ECohortDefinition = bookmarkType === 'D' || bookmarkType === 'D+M'

  if (isMaterializedCohort) {
    await deps.fireDeleteMaterializedCohortQuery(record.cohortDefinition.id)
  } else if (isAtlasCohortDefinition) {
    await deps.fireDeleteAtlasCohortDefinitionQuery(record.atlasCohortDefinition.id)
  } else if (isD2ECohortDefinition) {
    await deps.fireBookmarkQuery({
      params: { cmd: 'delete' },
      method: 'delete',
      bookmarkId: record.bookmark.id,
    })
  } else {
    // `getBookmarkType` returns undefined when all three sub-records are
    // absent. The single-delete dialog never hit this in practice, but the
    // bulk loop needs a real error to attribute a per-record failure to,
    // rather than silently doing nothing and reporting success.
    throw new Error(`deleteExploration: unrecognised bookmark type for "${record?.displayName}"`)
  }
}
