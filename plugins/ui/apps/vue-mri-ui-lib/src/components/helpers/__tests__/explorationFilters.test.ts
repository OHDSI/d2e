import { describe, it, expect } from 'vitest'
import {
  EMPTY_FILTERS,
  applyFilters,
  authorOptions,
  emptyFilters,
  isEmpty,
  matchesFilters,
  type ExplorationFilters,
} from '../explorationFilters'

const card = (over: Record<string, unknown> = {}) => ({ displayName: 'card', ...over }) as never

describe('emptyFilters / EMPTY_FILTERS', () => {
  it('emptyFilters() matches every card and isEmpty is true', () => {
    const filters = emptyFilters()
    expect(isEmpty(filters)).toBe(true)
    expect(matchesFilters(card(), filters)).toBe(true)
    expect(matchesFilters(card({ bookmark: { username: 'alice' } }), filters)).toBe(true)
  })

  it('isEmpty is false once any one of the five fields is constrained', () => {
    expect(isEmpty({ ...emptyFilters(), authors: ['alice'] })).toBe(false)
    expect(isEmpty({ ...emptyFilters(), statuses: ['materialized'] })).toBe(false)
    expect(isEmpty({ ...emptyFilters(), created: { from: '2026-01-01', to: null } })).toBe(false)
    expect(isEmpty({ ...emptyFilters(), lastUpdated: { from: null, to: '2026-01-01' } })).toBe(false)
    expect(isEmpty({ ...emptyFilters(), lastMaterialized: { from: '2026-01-01', to: '2026-01-02' } })).toBe(false)
  })

  it('returns independent objects on every call', () => {
    const a = emptyFilters()
    const b = emptyFilters()
    a.created.from = '2026-01-01'
    expect(b.created.from).toBeNull()
    expect(EMPTY_FILTERS.created.from).toBeNull()
    expect(isEmpty(b)).toBe(true)
  })

  it('EMPTY_FILTERS is frozen', () => {
    expect(Object.isFrozen(EMPTY_FILTERS)).toBe(true)
    expect(() => {
      ;(EMPTY_FILTERS as ExplorationFilters).authors = ['x']
    }).toThrow()
  })
})

describe('authorOptions', () => {
  it('returns distinct, sorted names, drops blanks and undefined, reads atlas username as fallback', () => {
    const cards = [
      card({ bookmark: { username: 'Charlie' } }),
      card({ bookmark: { username: 'alice' } }),
      card({ bookmark: { username: '' } }),
      card({}),
      card({ atlasCohortDefinition: { username: 'bob' } }),
      card({ bookmark: { username: 'alice' } }),
    ]
    expect(authorOptions(cards)).toEqual(['alice', 'bob', 'Charlie'])
  })

  it('reads the unfiltered list, not a filtered one', () => {
    const cards = [card({ bookmark: { username: 'alice' } }), card({ bookmark: { username: 'bob' } })]
    expect(authorOptions(cards)).toEqual(['alice', 'bob'])
  })
})

describe('author filter', () => {
  const alice = card({ displayName: 'A', bookmark: { username: 'alice' } })
  const bob = card({ displayName: 'B', bookmark: { username: 'bob' } })
  const carol = card({ displayName: 'C', bookmark: { username: 'carol' } })

  it('one author selected keeps only that owner', () => {
    const filters = { ...emptyFilters(), authors: ['alice'] }
    expect(applyFilters([alice, bob, carol], filters)).toEqual([alice])
  })

  it('two authors selected keeps both (OR within the filter)', () => {
    const filters = { ...emptyFilters(), authors: ['alice', 'bob'] }
    expect(applyFilters([alice, bob, carol], filters)).toEqual([alice, bob])
  })
})

describe('materialisation status filter', () => {
  const materialized = card({ displayName: 'M', cohortDefinition: { id: '1' } })
  const notMaterialized = card({ displayName: 'N' })

  it('materialized keeps only cards with a cohortDefinition', () => {
    const filters = { ...emptyFilters(), statuses: ['materialized' as const] }
    expect(applyFilters([materialized, notMaterialized], filters)).toEqual([materialized])
  })

  it('not-materialized is the exact complement', () => {
    const filters = { ...emptyFilters(), statuses: ['not-materialized' as const] }
    expect(applyFilters([materialized, notMaterialized], filters)).toEqual([notMaterialized])
  })

  it('both statuses selected is equivalent to neither selected', () => {
    const filters = { ...emptyFilters(), statuses: ['materialized' as const, 'not-materialized' as const] }
    expect(applyFilters([materialized, notMaterialized], filters)).toEqual([materialized, notMaterialized])
    expect(applyFilters([materialized, notMaterialized], emptyFilters())).toEqual([materialized, notMaterialized])
  })
})

describe('date range semantics (lastMaterialized used as the representative range)', () => {
  const dated = (day: string) => card({ displayName: day, cohortDefinition: { createdOn: `${day}T12:00:00` } })

  it('is inclusive at both ends', () => {
    const filters = { ...emptyFilters(), lastMaterialized: { from: '2026-01-01', to: '2026-01-31' } }
    expect(matchesFilters(dated('2026-01-01'), filters)).toBe(true)
    expect(matchesFilters(dated('2026-01-31'), filters)).toBe(true)
    expect(matchesFilters(dated('2025-12-31'), filters)).toBe(false)
    expect(matchesFilters(dated('2026-02-01'), filters)).toBe(false)
  })

  it('from alone means on or after', () => {
    const filters = { ...emptyFilters(), lastMaterialized: { from: '2026-01-15', to: null } }
    expect(matchesFilters(dated('2026-01-15'), filters)).toBe(true)
    expect(matchesFilters(dated('2026-06-01'), filters)).toBe(true)
    expect(matchesFilters(dated('2026-01-01'), filters)).toBe(false)
  })

  it('to alone means on or before', () => {
    const filters = { ...emptyFilters(), lastMaterialized: { from: null, to: '2026-01-15' } }
    expect(matchesFilters(dated('2026-01-15'), filters)).toBe(true)
    expect(matchesFilters(dated('2025-01-01'), filters)).toBe(true)
    expect(matchesFilters(dated('2026-02-01'), filters)).toBe(false)
  })

  it('a card with no materialisation date is dropped by an active range and kept when the range is empty', () => {
    const neverMaterialized = card({ displayName: 'never' })
    const activeFilters = { ...emptyFilters(), lastMaterialized: { from: '2026-01-01', to: null } }
    expect(matchesFilters(neverMaterialized, activeFilters)).toBe(false)
    expect(matchesFilters(neverMaterialized, emptyFilters())).toBe(true)
  })
})

describe('AND across filters', () => {
  it('author and a date range together are AND, not OR', () => {
    const alice = card({
      displayName: 'alice-in-range',
      bookmark: { username: 'alice' },
      cohortDefinition: { createdOn: '2026-01-10T00:00:00' },
    })
    const aliceOutOfRange = card({
      displayName: 'alice-out-of-range',
      bookmark: { username: 'alice' },
      cohortDefinition: { createdOn: '2025-01-10T00:00:00' },
    })
    const bobInRange = card({
      displayName: 'bob-in-range',
      bookmark: { username: 'bob' },
      cohortDefinition: { createdOn: '2026-01-10T00:00:00' },
    })

    const filters = {
      ...emptyFilters(),
      authors: ['alice'],
      lastMaterialized: { from: '2026-01-01', to: '2026-01-31' },
    }

    expect(applyFilters([alice, aliceOutOfRange, bobInRange], filters)).toEqual([alice])
  })
})

describe('created filter (backend-blocked but plumbed)', () => {
  it('works on a synthetic record carrying a creation date', () => {
    const withCreated = card({ displayName: 'has-created', bookmark: { dateCreated: '2026-01-10T00:00:00' } })
    const filters = { ...emptyFilters(), created: { from: '2026-01-01', to: '2026-01-31' } }
    expect(matchesFilters(withCreated, filters)).toBe(true)

    const outside = card({ displayName: 'outside', bookmark: { dateCreated: '2025-01-10T00:00:00' } })
    expect(matchesFilters(outside, filters)).toBe(false)
  })

  it('falls back to the atlas createdOn when there is no bookmark dateCreated', () => {
    const atlas = card({ displayName: 'atlas', atlasCohortDefinition: { createdOn: '2026-01-10T00:00:00' } })
    const filters = { ...emptyFilters(), created: { from: '2026-01-01', to: '2026-01-31' } }
    expect(matchesFilters(atlas, filters)).toBe(true)
  })

  it('a card with no created value fails an active created range', () => {
    const filters = { ...emptyFilters(), created: { from: '2026-01-01', to: '2026-01-31' } }
    expect(matchesFilters(card({ displayName: 'no-created' }), filters)).toBe(false)
  })
})

describe('applyFilters', () => {
  it('preserves input order and does not mutate its input array', () => {
    const a = card({ displayName: 'A', bookmark: { username: 'alice' } })
    const b = card({ displayName: 'B', bookmark: { username: 'bob' } })
    const c = card({ displayName: 'C', bookmark: { username: 'carol' } })
    const input = [c, a, b]

    const result = applyFilters(input, emptyFilters())

    expect(result.map((x: any) => x.displayName)).toEqual(['C', 'A', 'B'])
    expect(input.map((x: any) => x.displayName)).toEqual(['C', 'A', 'B'])
  })
})
