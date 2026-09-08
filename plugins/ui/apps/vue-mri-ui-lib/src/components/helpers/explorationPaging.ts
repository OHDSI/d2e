/**
 * Client-side paging for the Data Exploration grid. The list endpoint takes no
 * `page` or `limit` parameter, so the whole list is already in memory and this
 * only slices it. Pure functions, no Vue import, so the test does not load
 * Vuetify.
 */

export const PAGE_SIZES = [12, 24, 48] as const
export type PageSize = (typeof PAGE_SIZES)[number]

/** Total pages for a list length. Always at least 1, so an empty list is page 1 of 1. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

/** Clamp a page into [1, pageCount]. Guards a page that a filter change orphaned. */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, page), pageCount(total, size))
}

/** The slice for a page, 1-based. */
export function pageSlice<T>(items: readonly T[], page: number, size: number): T[] {
  const start = (page - 1) * size
  return items.slice(start, start + size)
}

/** "1-12 of 43". Returns "0 of 0" when the list is empty. */
export function pageLabel(total: number, page: number, size: number): string {
  if (total === 0) return '0 of 0'
  const start = (page - 1) * size + 1
  const end = Math.min(page * size, total)
  return `${start}-${end} of ${total}`
}
