/**
 * List behaviour for the Data Exploration page: scored search and sorting.
 *
 * Lifted from `BookmarkItems.vue` (lines 59-140), which holds the same scoring
 * but is gated out of the D2E build by `v-if="isAtlas"`. Kept as pure functions
 * with no Vue import so the test does not have to load Vuetify.
 */

/** Relevance weights. The first group that matches wins; scores do not add. */
const SCORE_ID = 100
const SCORE_NAME = 50
const SCORE_DESCRIPTION = 25
const SCORE_USERNAME = 10
const SCORE_NONE = 0

export type ExplorationSortKey = 'lastUpdated' | 'nameAsc' | 'nameDesc'

const includes = (value: unknown, query: string): boolean =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).toLowerCase().includes(query)
    : false

const toMs = (value: unknown): number => {
  if (!value) return 0
  const ms = new Date(value as string).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * The record's effective "last updated" instant, in ms. 0 when unknown.
 *
 * Every access is optional. `BookmarkItems.vue:133` dereferences
 * `cohortDefinition.createdOn` without a guard, which throws on a bookmark-only
 * record; that bug is deliberately not carried over.
 */
export function lastUpdatedMs(card): number {
  return (
    toMs(card?.bookmark?.dateModified) ||
    toMs(card?.atlasCohortDefinition?.updatedOn) ||
    toMs(card?.cohortDefinition?.createdOn)
  )
}

/** Scored relevance: id 100, name 50, description 25, username 10, else 0. */
export function scoreCard(card, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return SCORE_NONE

  if (
    includes(card?.bookmark?.id, q) ||
    includes(card?.cohortDefinition?.id, q) ||
    includes(card?.atlasCohortDefinition?.id, q)
  ) {
    return SCORE_ID
  }

  if (
    includes(card?.displayName, q) ||
    includes(card?.cohortDefinition?.cohortDefinitionName, q) ||
    includes(card?.atlasCohortDefinition?.name, q)
  ) {
    return SCORE_NAME
  }

  if (includes(card?.cohortDefinition?.description, q) || includes(card?.atlasCohortDefinition?.description, q)) {
    return SCORE_DESCRIPTION
  }

  if (includes(card?.bookmark?.username, q) || includes(card?.atlasCohortDefinition?.username, q)) {
    return SCORE_USERNAME
  }

  return SCORE_NONE
}

const compareBy = (sort: ExplorationSortKey) => (a, b) => {
  if (sort === 'nameAsc') return String(a?.displayName ?? '').localeCompare(String(b?.displayName ?? ''))
  if (sort === 'nameDesc') return String(b?.displayName ?? '').localeCompare(String(a?.displayName ?? ''))
  return lastUpdatedMs(b) - lastUpdatedMs(a)
}

/**
 * Filter by query (score > 0), then sort. An empty query filters nothing.
 *
 * With a query, relevance is the primary sort and `sort` is only the tie-break:
 * searching an id must surface that record first rather than leaving it in
 * alphabetical position.
 */
export function filterAndSort(cards: readonly unknown[], query: string, sort: ExplorationSortKey) {
  const q = query.trim().toLowerCase()
  const tieBreak = compareBy(sort)

  if (!q) {
    return [...cards].sort(tieBreak)
  }

  return cards
    .map(card => ({ card, score: scoreCard(card, q) }))
    .filter(entry => entry.score > SCORE_NONE)
    .sort((a, b) => (a.score !== b.score ? b.score - a.score : tieBreak(a.card, b.card)))
    .map(entry => entry.card)
}
