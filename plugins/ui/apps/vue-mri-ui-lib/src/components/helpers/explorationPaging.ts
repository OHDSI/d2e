/**
 * Client-side paging for the Data Exploration grid. The list endpoint takes no
 * `page` or `limit` parameter, so the whole list is already in memory and this
 * only slices it. Pure functions, no Vue import, so the test does not load
 * Vuetify.
 */
import { formatNumber } from '../../utils/NumberUtils'

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

export interface PageRangeLabel {
  /** Comma-grouped first row number on the page. */
  startLabel: string
  /** Comma-grouped last row number on the page. */
  endLabel: string
  /** Comma-grouped total rows in the filtered set. */
  totalLabel: string
}

/**
 * The comma-grouped start, end and total for the pagination label.
 *
 * Returns three "0" labels for an empty list. The caller composes the final
 * label from a locale string (see `ExplorationPagination.vue`), so the English
 * word "of" — or any other language's equivalent — never lives in this helper.
 * Keeping this pure means the composition rule stays unit-testable here.
 */
export function pageRange(total: number, page: number, size: number): PageRangeLabel {
  if (total === 0) {
    const zero = formatNumber(0)
    return { startLabel: zero, endLabel: zero, totalLabel: zero }
  }
  const start = (page - 1) * size + 1
  const end = Math.min(page * size, total)
  return {
    startLabel: formatNumber(start),
    endLabel: formatNumber(end),
    totalLabel: formatNumber(total),
  }
}
