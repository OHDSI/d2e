/**
 * The bulk-delete loop for the Data Exploration page. Kept as a pure,
 * dependency-injected function so it is testable without mounting
 * `ExplorationsPage.vue` — the repository rule against mounting components to
 * assert markup or dialog state applies to that page's bulk-delete UI too.
 *
 * See `docs/projects/vue-mri-ui/pr10/02-bulk-compare-and-delete.md` section 3d
 * for the five rules this implements:
 *  1. Delete one at a time (the caller's `deleteOne` is awaited in sequence,
 *     never `Promise.all`'d).
 *  2. Reload once, after the whole loop.
 *  3. Report partial failure (via `notifyFailure`).
 *  4. Clear the selection after the run, including the failures.
 *  5. Handle the active bookmark (via `clearActiveBookmarkIfDeleted`).
 */

export interface RunBulkDeleteDeps {
  /** Deletes one record. Wraps `deleteExploration` with the store's actions. */
  deleteOne: (record: BookmarkDisplay) => Promise<void>
  /** Reloads the exploration list. Called exactly once, after the loop. */
  reload: () => Promise<unknown>
  /** Clears the page's selection state. */
  clearSelection: () => void
  /**
   * If any target that was NOT in `failedNames` was the active bookmark,
   * clears it and resets the chart. Receives every target (not only the
   * successful ones) so it can apply the same "was this the active one"
   * check `DeleteExplorationDialog` uses, filtered by the failure list.
   */
  clearActiveBookmarkIfDeleted: (targets: BookmarkDisplay[], failedNames: string[]) => Promise<void> | void
  /** Reports the display names that failed to delete, in order. */
  notifyFailure: (failedNames: string[]) => void
}

/**
 * Deletes every target sequentially, each by its own path, then reloads once,
 * clears the selection, handles the active bookmark, and reports any
 * failures. A failure on one target does not stop the rest.
 */
export async function runBulkDelete(targets: readonly BookmarkDisplay[], deps: RunBulkDeleteDeps): Promise<void> {
  const failed: string[] = []

  for (const record of targets) {
    try {
      await deps.deleteOne(record)
    } catch (error) {
      console.error('Bulk delete failed for', record?.displayName, error)
      failed.push(record?.displayName)
    }
  }

  await deps.reload()
  deps.clearSelection()
  await deps.clearActiveBookmarkIfDeleted([...targets], failed)

  if (failed.length) {
    deps.notifyFailure(failed)
  }
}
