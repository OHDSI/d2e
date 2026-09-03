/**
 * Filter state and predicate for the Data Exploration list (PR 8, ticket
 * OHDSI/Data2Evidence#3150). Pure functions, no Vue import, so the test does
 * not have to load Vuetify.
 *
 * Record parameters are typed loosely (`unknown` with optional chaining). The
 * store getter that produces list rows is untyped and `BookmarkDisplay` from
 * `src/types.d.ts` is an ambient global, not an importable module — see
 * `explorationList.ts` next door for the same reasoning.
 */

import { lastUpdatedMs } from './explorationList'

export type MaterializationStatus = 'materialized' | 'not-materialized'

export interface DateRange {
  from: string | null // ISO "YYYY-MM-DD", inclusive
  to: string | null // ISO "YYYY-MM-DD", inclusive
}

export interface ExplorationFilters {
  authors: string[] // empty = no author constraint
  statuses: MaterializationStatus[] // empty = no status constraint
  created: DateRange
  lastUpdated: DateRange
  lastMaterialized: DateRange
}

const emptyRange = (): DateRange => ({ from: null, to: null })

/** A fresh, fully-unconstrained filter set. Use this for every reset. */
export const emptyFilters = (): ExplorationFilters => ({
  authors: [],
  statuses: [],
  created: emptyRange(),
  lastUpdated: emptyRange(),
  lastMaterialized: emptyRange(),
})

/**
 * Frozen reference value. Never spread it — call `emptyFilters()` instead.
 *
 * A shallow spread (`{ ...EMPTY_FILTERS }`) shares the three nested
 * `DateRange` objects by reference with this constant. The first
 * `filters.created.from = x` then mutates this module-level object in place,
 * after which `isEmpty()` never returns true again and "Clear all" stops
 * clearing. `emptyFilters()` exists to avoid that; `Object.freeze` makes a
 * future mutation attempt fail loudly instead of silently.
 */
export const EMPTY_FILTERS: Readonly<ExplorationFilters> = Object.freeze(emptyFilters())

const isEmptyRange = (range: DateRange): boolean => range.from == null && range.to == null

/** True when nothing is constrained — drives the "Clear all" disabled state. */
export function isEmpty(filters: ExplorationFilters): boolean {
  return (
    filters.authors.length === 0 &&
    filters.statuses.length === 0 &&
    isEmptyRange(filters.created) &&
    isEmptyRange(filters.lastUpdated) &&
    isEmptyRange(filters.lastMaterialized)
  )
}

const author = (card: unknown): string | undefined =>
  (card as any)?.bookmark?.username ?? (card as any)?.atlasCohortDefinition?.username

/** Distinct owners across the loaded records, sorted with localeCompare, blanks dropped. */
export function authorOptions(cards: readonly unknown[]): string[] {
  const names = new Set<string>()
  for (const card of cards) {
    const name = author(card)
    if (typeof name === 'string' && name.trim() !== '') {
      names.add(name)
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * Materialisation status. The canonical helper is `getBookmarkType()` in
 * `src/utils/BookmarkUtils.ts` — `'M'`, `'A+M'` and `'D+M'` are materialised,
 * `'A'` and `'D'` are not. Presence of `cohortDefinition` is the same test
 * and is cheaper.
 *
 * There are exactly two statuses. *Stale* is not derivable from any field
 * today and belongs to ticket #3117.
 */
const status = (card: unknown): MaterializationStatus =>
  (card as any)?.cohortDefinition ? 'materialized' : 'not-materialized'

/** Local calendar day ("YYYY-MM-DD") for a timestamp, in the viewer's timezone. Empty when unknown. */
const localDay = (value: unknown): string | null => {
  if (!value) return null
  const date = new Date(value as string)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * True when `value`'s local calendar day falls inside `range`, inclusive at
 * both ends. An empty range constrains nothing. A missing `value` fails an
 * active range and passes an empty one.
 */
const inRange = (value: unknown, range: DateRange): boolean => {
  if (isEmptyRange(range)) return true
  const day = localDay(value)
  if (day == null) return false
  if (range.from != null && day < range.from) return false
  if (range.to != null && day > range.to) return false
  return true
}

/**
 * `created` accessor is backend-blocked: `Bookmark` carries only
 * `dateModified`, there is no creation timestamp for a D2E exploration. The
 * audit columns exist on the `user_artifact` row
 * (`plugins/functions/portal/src/common/entity/audit.entity.ts`) but
 * `formatUserArtifactData` does not expose them. Implemented anyway so that
 * once the backend surfaces a creation timestamp the filter starts working
 * with no logic change.
 */
const created = (card: unknown): unknown =>
  (card as any)?.bookmark?.dateCreated ?? (card as any)?.atlasCohortDefinition?.createdOn

const lastMaterialized = (card: unknown): unknown => (card as any)?.cohortDefinition?.createdOn

/** True when the card satisfies every active constraint. */
export function matchesFilters(card: unknown, filters: ExplorationFilters): boolean {
  if (filters.authors.length > 0) {
    const owner = author(card)
    if (owner == null || !filters.authors.includes(owner)) return false
  }

  if (filters.statuses.length > 0 && !filters.statuses.includes(status(card))) {
    return false
  }

  if (!inRange(created(card), filters.created)) return false
  if (!inRange(lastUpdatedMs(card) || null, filters.lastUpdated)) return false
  if (!inRange(lastMaterialized(card), filters.lastMaterialized)) return false

  return true
}

export function applyFilters(cards: readonly unknown[], filters: ExplorationFilters): unknown[] {
  return cards.filter(card => matchesFilters(card, filters))
}
