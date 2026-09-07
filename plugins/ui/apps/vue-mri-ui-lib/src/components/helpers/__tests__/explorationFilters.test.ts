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

  it('EMPTY_FILTERS is frozen all the way down', () => {
    expect(Object.isFrozen(EMPTY_FILTERS)).toBe(true)
    // The nested ranges matter more than the top level: they are the objects a
    // shallow spread shares, and the ones the corruption bug writes into.
    expect(Object.isFrozen(EMPTY_FILTERS.created)).toBe(true)
    expect(Object.isFrozen(EMPTY_FILTERS.lastUpdated)).toBe(true)
    expect(Object.isFrozen(EMPTY_FILTERS.lastMaterialized)).toBe(true)
    expect(Object.isFrozen(EMPTY_FILTERS.authors)).toBe(true)
    expect(Object.isFrozen(EMPTY_FILTERS.statuses)).toBe(true)
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

/**
 * `lastUpdated` is the one range that does not read a date field directly: it
 * goes through `lastUpdatedMs()`, which returns milliseconds and falls back
 * across three fields. Its own tests, because the representative range above
 * cannot exercise that path.
 */
describe('lastUpdated range', () => {
  it('reads bookmark.dateModified', () => {
    const filters = { ...emptyFilters(), lastUpdated: { from: '2026-01-01', to: '2026-01-31' } }
    expect(matchesFilters(card({ bookmark: { dateModified: '2026-01-15T09:00:00' } }), filters)).toBe(true)
    expect(matchesFilters(card({ bookmark: { dateModified: '2025-12-31T09:00:00' } }), filters)).toBe(false)
  })

  it('falls back to the atlas updatedOn when there is no bookmark', () => {
    const filters = { ...emptyFilters(), lastUpdated: { from: '2026-01-01', to: '2026-01-31' } }
    expect(matchesFilters(card({ atlasCohortDefinition: { updatedOn: '2026-01-15T09:00:00' } }), filters)).toBe(true)
    expect(matchesFilters(card({ atlasCohortDefinition: { updatedOn: '2026-03-01T09:00:00' } }), filters)).toBe(false)
  })

  it('ignores the materialisation instant, which the card does not show as "last updated"', () => {
    // A type-'M' record: materialised, with no bookmark and no Atlas
    // definition. Its card renders "Last updated: -", so a LAST UPDATED range
    // must not match it on cohortDefinition.createdOn.
    const materializedOnly = card({ cohortDefinition: { createdOn: '2026-03-10T09:00:00' } })
    const march = { ...emptyFilters(), lastUpdated: { from: '2026-03-01', to: '2026-03-31' } }
    expect(matchesFilters(materializedOnly, march)).toBe(false)
    // The same record is still reachable through LAST MATERIALIZED.
    expect(
      matchesFilters(materializedOnly, { ...emptyFilters(), lastMaterialized: { from: '2026-03-01', to: '2026-03-31' } }),
    ).toBe(true)
  })

  it('drops a card with no date anywhere, and keeps it when the range is empty', () => {
    const undated = card({ displayName: 'undated' })
    expect(matchesFilters(undated, { ...emptyFilters(), lastUpdated: { from: '2026-01-01', to: null } })).toBe(false)
    expect(matchesFilters(undated, emptyFilters())).toBe(true)
  })
})

/**
 * Real timestamps are UTC: `getDisplayBookmarks` normalises
 * `cohortDefinition.createdOn` with `.toISOString()`, and `processBookmarksData`
 * does the same for the Atlas `createdOn` / `updatedOn`. The naive local
 * strings used above never exercise that, and the whole point of comparing
 * local calendar days is that a `Z` timestamp lands on the day the card
 * displays. Expectations are derived from the running timezone so the
 * assertion holds under any TZ.
 */
describe('UTC timestamps land on the viewer local day', () => {
  const UTC_INSTANT = '2026-01-31T20:00:00.000Z'
  const localDayOf = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const shiftDay = (day: string, by: number) => {
    const [y, m, d] = day.split('-').map(Number)
    return localDayOf(new Date(y, m - 1, d + by).toISOString())
  }

  it('a Z timestamp matches a range built from its own local day', () => {
    const c = card({ cohortDefinition: { createdOn: UTC_INSTANT } })
    const day = localDayOf(UTC_INSTANT)
    expect(matchesFilters(c, { ...emptyFilters(), lastMaterialized: { from: day, to: day } })).toBe(true)
  })

  it('a Z timestamp is excluded by the neighbouring local days', () => {
    const c = card({ cohortDefinition: { createdOn: UTC_INSTANT } })
    const day = localDayOf(UTC_INSTANT)
    const before = shiftDay(day, -1)
    const after = shiftDay(day, 1)
    expect(matchesFilters(c, { ...emptyFilters(), lastMaterialized: { from: null, to: before } })).toBe(false)
    expect(matchesFilters(c, { ...emptyFilters(), lastMaterialized: { from: after, to: null } })).toBe(false)
  })

  it('agrees with the card display, which also reads local parts', () => {
    // DateUtils.displayBookmarkDateFormat builds its label from getDate() /
    // getMonth() / getFullYear(), so the filter and the card must land on the
    // same calendar day for the same instant.
    const d = new Date(UTC_INSTANT)
    expect(localDayOf(UTC_INSTANT).endsWith(String(d.getDate()).padStart(2, '0'))).toBe(true)
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
