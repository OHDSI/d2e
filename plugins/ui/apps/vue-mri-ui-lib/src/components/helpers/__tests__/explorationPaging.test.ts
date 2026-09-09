import { describe, expect, it } from 'vitest'
import { clampPage, pageCount, pageRange, pageSlice } from '../explorationPaging'

describe('pageCount', () => {
  it('divides the total by the page size, rounding up', () => {
    expect(pageCount(43, 12)).toBe(4)
  })

  it('is always at least 1, so an empty list is page 1 of 1', () => {
    expect(pageCount(0, 12)).toBe(1)
  })

  it('is exactly 1 when the total is one full page', () => {
    expect(pageCount(12, 12)).toBe(1)
  })
})

describe('clampPage', () => {
  it('pulls a page back down when a filter change orphaned it', () => {
    expect(clampPage(9, 5, 12)).toBe(1)
  })

  it('floors at page 1', () => {
    expect(clampPage(0, 43, 12)).toBe(1)
  })

  it('leaves an in-range page untouched', () => {
    expect(clampPage(3, 43, 12)).toBe(3)
  })
})

describe('pageSlice', () => {
  const items = Array.from({ length: 43 }, (_, i) => i + 1)

  it('returns a full page for page 1', () => {
    expect(pageSlice(items, 1, 12)).toEqual(items.slice(0, 12))
  })

  it('returns the remainder for the last page', () => {
    expect(pageSlice(items, 4, 12)).toEqual(items.slice(36, 43))
    expect(pageSlice(items, 4, 12)).toHaveLength(7)
  })

  it('returns an empty array for an out-of-range page rather than throwing', () => {
    expect(pageSlice(items, 99, 12)).toEqual([])
  })
})

describe('pageRange', () => {
  it('renders the first page', () => {
    expect(pageRange(43, 1, 12)).toEqual({ startLabel: '1', endLabel: '12', totalLabel: '43' })
  })

  it('renders the last, partial page', () => {
    expect(pageRange(43, 4, 12)).toEqual({ startLabel: '37', endLabel: '43', totalLabel: '43' })
  })

  it('returns three zeros for an empty list', () => {
    expect(pageRange(0, 1, 12)).toEqual({ startLabel: '0', endLabel: '0', totalLabel: '0' })
  })

  it('comma-separates thousands in every number, start/end and total alike', () => {
    expect(pageRange(2450, 1, 1000)).toEqual({ startLabel: '1', endLabel: '1,000', totalLabel: '2,450' })
    expect(pageRange(2450, 3, 1000)).toEqual({ startLabel: '2,001', endLabel: '2,450', totalLabel: '2,450' })
  })
})
