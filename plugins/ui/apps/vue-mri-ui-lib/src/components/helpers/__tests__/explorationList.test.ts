import { describe, it, expect } from 'vitest'
import { filterAndSort, lastUpdatedMs, scoreCard } from '../explorationList'

const card = (over: Record<string, unknown> = {}) => ({ displayName: 'card', ...over }) as never

describe('lastUpdatedMs', () => {
  it('prefers the bookmark dateModified', () => {
    const c = card({
      bookmark: { dateModified: '2026-03-01T00:00:00Z' },
      atlasCohortDefinition: { updatedOn: '2020-01-01T00:00:00Z' },
      cohortDefinition: { createdOn: '2019-01-01T00:00:00Z' },
    })
    expect(lastUpdatedMs(c)).toBe(new Date('2026-03-01T00:00:00Z').getTime())
  })

  it('falls back to the atlas updatedOn, then the cohort createdOn', () => {
    const atlas = card({ atlasCohortDefinition: { updatedOn: '2021-05-05T00:00:00Z' } })
    expect(lastUpdatedMs(atlas)).toBe(new Date('2021-05-05T00:00:00Z').getTime())

    const cohort = card({ cohortDefinition: { createdOn: '2022-06-06T00:00:00Z' } })
    expect(lastUpdatedMs(cohort)).toBe(new Date('2022-06-06T00:00:00Z').getTime())
  })

  it('returns 0 when the record carries no date', () => {
    expect(lastUpdatedMs(card())).toBe(0)
  })

  it('does not throw for a bookmark-only record with no cohortDefinition', () => {
    expect(() => lastUpdatedMs(card({ bookmark: { id: '1' } }))).not.toThrow()
    expect(lastUpdatedMs(card({ bookmark: { id: '1' } }))).toBe(0)
  })
})

describe('scoreCard', () => {
  it('scores an id match 100', () => {
    expect(scoreCard(card({ bookmark: { id: '4242' } }), '4242')).toBe(100)
    expect(scoreCard(card({ cohortDefinition: { id: '4242' } }), '4242')).toBe(100)
    expect(scoreCard(card({ atlasCohortDefinition: { id: '4242' } }), '4242')).toBe(100)
  })

  it('scores a name match 50', () => {
    expect(scoreCard(card({ displayName: 'Diabetes cohort' }), 'diabetes')).toBe(50)
    expect(scoreCard(card({ cohortDefinition: { cohortDefinitionName: 'Diabetes' } }), 'diabetes')).toBe(50)
    expect(scoreCard(card({ atlasCohortDefinition: { name: 'Diabetes' } }), 'diabetes')).toBe(50)
  })

  it('scores a description match 25 and an author match 10', () => {
    expect(scoreCard(card({ cohortDefinition: { description: 'first cut' } }), 'first cut')).toBe(25)
    expect(scoreCard(card({ bookmark: { username: 'alice' } }), 'alice')).toBe(10)
    expect(scoreCard(card({ atlasCohortDefinition: { username: 'alice' } }), 'alice')).toBe(10)
  })

  it('scores a miss 0 and is case-insensitive', () => {
    expect(scoreCard(card({ displayName: 'Diabetes' }), 'oncology')).toBe(0)
    expect(scoreCard(card({ displayName: 'DIABETES' }), 'diabetes')).toBe(50)
  })

  it('takes the highest matching group only, it does not add', () => {
    const c = card({ bookmark: { id: 'x1', username: 'x1' }, displayName: 'x1' })
    expect(scoreCard(c, 'x1')).toBe(100)
  })
})

describe('filterAndSort', () => {
  const a = card({ displayName: 'Alpha', bookmark: { id: '1', dateModified: '2026-01-01T00:00:00Z' } })
  const b = card({ displayName: 'Bravo', bookmark: { id: '2', dateModified: '2026-02-01T00:00:00Z' } })
  const c = card({ displayName: 'Charlie', bookmark: { id: '3', dateModified: '2026-03-01T00:00:00Z' } })

  it('returns every card for an empty query, ordered by the key', () => {
    expect(filterAndSort([a, b, c], '', 'lastUpdated').map(x => x.displayName)).toEqual(['Charlie', 'Bravo', 'Alpha'])
    expect(filterAndSort([c, a, b], '', 'nameAsc').map(x => x.displayName)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('drops cards that do not match the query', () => {
    expect(filterAndSort([a, b, c], 'alpha', 'lastUpdated').map(x => x.displayName)).toEqual(['Alpha'])
    expect(filterAndSort([a, b, c], 'nothing', 'lastUpdated')).toEqual([])
  })

  it('ranks a score-100 hit above a score-50 hit even when nameAsc would not', () => {
    // "2" is Bravo's id (100). Zulu's name contains "2" (50) but sorts later A-Z.
    const zulu = card({ displayName: 'Zulu 2', bookmark: { id: '9', dateModified: '2026-01-01T00:00:00Z' } })
    expect(filterAndSort([zulu, b], '2', 'nameAsc').map(x => x.displayName)).toEqual(['Bravo', 'Zulu 2'])
  })

  it('orders nameAsc and nameDesc as exact reverses', () => {
    const asc = filterAndSort([c, a, b], '', 'nameAsc').map(x => x.displayName)
    const desc = filterAndSort([c, a, b], '', 'nameDesc').map(x => x.displayName)
    expect(desc).toEqual([...asc].reverse())
  })

  it('does not mutate the input array', () => {
    const input = [c, a, b]
    filterAndSort(input, '', 'nameAsc')
    expect(input.map(x => x.displayName)).toEqual(['Charlie', 'Alpha', 'Bravo'])
  })
})
