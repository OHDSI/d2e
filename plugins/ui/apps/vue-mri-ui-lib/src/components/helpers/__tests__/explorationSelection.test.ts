import { describe, expect, it } from 'vitest'
import { allSelected, applyPageSelection, retainIds, someSelected } from '../explorationSelection'

describe('allSelected', () => {
  it('is false for an empty page', () => {
    expect(allSelected([], ['a', 'b'])).toBe(false)
  })

  it('is true only when every page id is selected', () => {
    expect(allSelected(['a', 'b'], ['a', 'b', 'c'])).toBe(true)
  })

  it('is false when some page ids are missing from the selection', () => {
    expect(allSelected(['a', 'b'], ['a'])).toBe(false)
  })

  it('is false when none of the page ids are selected', () => {
    expect(allSelected(['a', 'b'], [])).toBe(false)
  })
})

describe('someSelected', () => {
  it('is false when all page ids are selected (exclusive with allSelected)', () => {
    expect(someSelected(['a', 'b'], ['a', 'b'])).toBe(false)
  })

  it('is false when none of the page ids are selected', () => {
    expect(someSelected(['a', 'b'], [])).toBe(false)
  })

  it('is true for a mix of selected and unselected cards on the page', () => {
    expect(someSelected(['a', 'b'], ['a'])).toBe(true)
  })

  it('is false for an empty page', () => {
    expect(someSelected([], ['a'])).toBe(false)
  })
})

describe('retainIds', () => {
  it('drops an id that left the visible set, and keeps the rest', () => {
    expect(retainIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'c'])
  })

  it('keeps every id when all are still visible', () => {
    expect(retainIds(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b'])
  })

  it('returns an empty array when nothing survives', () => {
    expect(retainIds(['a', 'b'], [])).toEqual([])
  })

  it('does not mutate its inputs', () => {
    const selected = ['a', 'b', 'c']
    const visible = ['a', 'c']
    const result = retainIds(selected, visible)
    expect(selected).toEqual(['a', 'b', 'c'])
    expect(visible).toEqual(['a', 'c'])
    expect(result).not.toBe(selected)
  })
})

describe('applyPageSelection', () => {
  it('adds the page ids without touching a selection from another page', () => {
    expect(applyPageSelection(['x'], ['a', 'b'], true)).toEqual(expect.arrayContaining(['x', 'a', 'b']))
    expect(applyPageSelection(['x'], ['a', 'b'], true)).toHaveLength(3)
  })

  it('removes only the page ids when clearing, keeping a selection from another page', () => {
    expect(applyPageSelection(['x', 'a', 'b'], ['a', 'b'], false)).toEqual(['x'])
  })

  it('does not duplicate an id already selected when adding', () => {
    expect(applyPageSelection(['a'], ['a', 'b'], true)).toEqual(expect.arrayContaining(['a', 'b']))
    expect(applyPageSelection(['a'], ['a', 'b'], true)).toHaveLength(2)
  })

  it('does not mutate its inputs', () => {
    const selected = ['x']
    const pageIds = ['a', 'b']
    applyPageSelection(selected, pageIds, true)
    expect(selected).toEqual(['x'])
    expect(pageIds).toEqual(['a', 'b'])
  })
})
