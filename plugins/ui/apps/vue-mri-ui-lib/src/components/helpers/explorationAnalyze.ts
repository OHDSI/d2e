/**
 * Pure decisions behind the exploration card's Analyze action.
 *
 * These live outside `ExplorationsPage.vue` so they can be tested without
 * mounting anything, which the repository's testing policy asks for. The
 * defects they encode were all found by review rather than by tests, so each
 * one has a case in `__tests__/explorationAnalyze.test.ts`.
 */

/** The five wizard-flow modals, as the composable exposes them. */
export interface DashboardFlowFlags {
  showDashboardSelectionModal?: boolean
  showRequiredFiltersModal?: boolean
  showTable1ConfigModal?: boolean
  showDashboardModal?: boolean
  showSaveCohortModal?: boolean
}

/**
 * The bookmark id to analyse, or `null` when the card cannot be analysed.
 *
 * Only `bookmark.id` is accepted. A cohort-definition or Atlas id comes from a
 * different table and the two can collide — the grid namespaces its own card
 * ids for exactly that reason — and `getBookmarkById` dereferences the result
 * of a `.find()` with no guard, so passing one either throws or silently
 * addresses a different exploration.
 */
export function analyzeBookmarkId(card: unknown): string | null {
  const id = (card as { source?: { bookmark?: { id?: unknown } } })?.source?.bookmark?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Whether any wizard modal is on screen.
 *
 * This is the mount condition for `DashboardFlowModals`. It is derived only
 * from the modal flags, which are refs, so it cannot be left stuck on. An
 * earlier version OR-ed in a sticky "analyze in progress" flag; several flow
 * paths end with every modal closed and that flag still set, after which the
 * modals stayed mounted and unmounting the page tore down a teleport whose
 * target was itself being removed.
 */
export function isDashboardFlowOpen(flags: DashboardFlowFlags | null | undefined): boolean {
  if (!flags) return false
  return Boolean(
    flags.showDashboardSelectionModal ||
      flags.showRequiredFiltersModal ||
      flags.showTable1ConfigModal ||
      flags.showDashboardModal ||
      flags.showSaveCohortModal
  )
}

/**
 * Whether closing has finished the flow, so the shared Vuex state it mutated
 * should be put back.
 *
 * Only on the true-to-false edge, and never while the composable reports it is
 * still working: the flow closes one modal before opening the next across an
 * await, and resetting in that gap breaks it.
 */
export function shouldResetDashboardFlow(args: {
  isOpen: boolean
  wasOpen: boolean
  isProcessing: boolean
}): boolean {
  return !args.isOpen && args.wasOpen && !args.isProcessing
}
