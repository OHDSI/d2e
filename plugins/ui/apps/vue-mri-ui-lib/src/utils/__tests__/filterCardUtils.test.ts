import { describe, it, expect, vi } from 'vitest'
import { extractFilterCardDetail, getInclusionReportFilterCardDetails } from '../filterCardUtils'

// --- fixture helpers ---

const makeConstraint = (operator: string, value: string) => ({ operator, value })

const makeAttr = (configPath: string, constraintItems: { operator: string; value: string }[]) => ({
  configPath,
  constraints: { content: constraintItems },
})

const makeCard = (name: string, attrs: any[], advanceTimeFilters: any[] = []) => ({
  name,
  attributes: { content: attrs },
  advanceTimeFilter: advanceTimeFilters.length ? { filters: advanceTimeFilters } : null,
})

const makeExclusionWrapper = (card: any) => ({
  op: 'NOT',
  content: [card],
})

const makeContainer = (...entries: any[]) => ({ content: entries })

const makeBasicDataContainer = (attrs: any[]) => makeContainer(makeCard('Basic Data', attrs))

const noopAttrName = (path: string) => path
const noopAdvTime = (_: any) => 'advance-time'

// ---------------------------------------------------------------------------

describe('extractFilterCardDetail', () => {
  describe('inclusion vs exclusion detection', () => {
    it('marks a direct card (with attributes) as included', () => {
      const card = makeCard('Condition', [makeAttr('p.attr.status', [makeConstraint('=', 'Active')])])
      const result = extractFilterCardDetail(card, noopAttrName, noopAdvTime)
      expect(result.isExcluded).toBe(false)
      expect(result.name).toBe('Condition')
    })

    it('marks a NOT-wrapped card as excluded and lifts inner name', () => {
      const inner = makeCard('Medication', [makeAttr('p.attr.name', [makeConstraint('=', 'Aspirin')])])
      const wrapper = makeExclusionWrapper(inner)
      const result = extractFilterCardDetail(wrapper, noopAttrName, noopAdvTime)
      expect(result.isExcluded).toBe(true)
      expect(result.name).toBe('Medication')
    })
  })

  describe('visible attributes', () => {
    it('includes attributes that have at least one constraint', () => {
      const card = makeCard('Visit', [makeAttr('p.attr.type', [makeConstraint('=', 'Inpatient')])])
      const { visibleAttributes } = extractFilterCardDetail(card, noopAttrName, noopAdvTime)
      expect(visibleAttributes).toHaveLength(1)
      expect(visibleAttributes[0].name).toBe('p.attr.type')
    })

    it('omits attributes with an empty constraints array', () => {
      const card = makeCard('Visit', [makeAttr('p.attr.empty', [])])
      const { visibleAttributes } = extractFilterCardDetail(card, noopAttrName, noopAdvTime)
      expect(visibleAttributes).toHaveLength(0)
    })

    it('calls getAttributeName with the configPath', () => {
      const getAttrName = vi.fn(() => 'Gender')
      const card = makeCard('BD', [makeAttr('patient.attributes.gender', [makeConstraint('=', 'F')])])
      extractFilterCardDetail(card, getAttrName, noopAdvTime)
      expect(getAttrName).toHaveBeenCalledWith('patient.attributes.gender')
    })
  })

  describe('advance time filters', () => {
    it('collects formatted advance-time strings', () => {
      const atf = { this: 'startdate', after_before: 'before', other: 'start', operator: '30', value: 'card1' }
      const card = { ...makeCard('Cond', []), advanceTimeFilter: { filters: [atf] } }
      const fmt = vi.fn(() => '30 days before start of card1')
      const { visibleAdvanceTime } = extractFilterCardDetail(card, noopAttrName, fmt)
      expect(visibleAdvanceTime).toEqual(['30 days before start of card1'])
      expect(fmt).toHaveBeenCalledWith(atf)
    })

    it('returns empty visibleAdvanceTime when advanceTimeFilter is null', () => {
      const card = makeCard('Cond', [])
      const { visibleAdvanceTime } = extractFilterCardDetail(card, noopAttrName, noopAdvTime)
      expect(visibleAdvanceTime).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------

describe('constraint parsing edge cases (via extractFilterCardDetail)', () => {
  const cardWith = (constraintItems: any[]) =>
    makeCard('Test', [{ configPath: 'p.attr.x', constraints: { content: constraintItems } }])

  it('formats a plain = constraint as its raw value', () => {
    const card = cardWith([makeConstraint('=', 'Active')])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual(['Active'])
  })

  it('formats a non-= constraint as operator+value', () => {
    const card = cardWith([makeConstraint('>=', '18')])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual(['>=18'])
  })

  it('extracts .text from a JSON sProcess value', () => {
    const sProcess = JSON.stringify({ sProcess: 'FHIR_CODE', text: 'Male' })
    const card = cardWith([makeConstraint('=', sProcess)])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual(['Male'])
  })

  it('falls back to raw value when JSON parses but has no sProcess', () => {
    const json = JSON.stringify({ foo: 'bar' })
    const card = cardWith([makeConstraint('=', json)])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual([json])
  })

  it('falls back to raw value when value is invalid JSON', () => {
    const card = cardWith([makeConstraint('=', '{bad json')])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual(['{bad json'])
  })

  it('falls back to raw value when JSON.parse returns null (typeof null === "object" guard)', () => {
    // JSON.parse('null') === null; without a null-guard, val.hasOwnProperty would throw
    const card = cardWith([makeConstraint('=', 'null')])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual(['null'])
  })

  it('flattens nested constraint groups (c.content) as operator+value pairs', () => {
    const nested = {
      content: [
        { operator: '>=', value: '18' },
        { operator: '<=', value: '65' },
      ],
    }
    const card = makeCard('Test', [{ configPath: 'p.attr.age', constraints: { content: [nested] } }])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual(['>=18', '<=65'])
  })

  it('accumulates constraints from multiple constraint items', () => {
    const card = cardWith([makeConstraint('=', 'A'), makeConstraint('=', 'B')])
    const [attr] = extractFilterCardDetail(card, noopAttrName, noopAdvTime).visibleAttributes
    expect(attr.visibleConstraints).toEqual(['A', 'B'])
  })
})

// ---------------------------------------------------------------------------

describe('getInclusionReportFilterCardDetails – Basic Data splitting', () => {
  it('returns no rules when there are no boolContainers', () => {
    expect(getInclusionReportFilterCardDetails([], noopAttrName, noopAdvTime)).toEqual([])
  })

  it('produces one rule for a Basic Data card with a single constrained attribute', () => {
    const bc = makeBasicDataContainer([makeAttr('p.attr.gender', [makeConstraint('=', 'Female')])])
    const rules = getInclusionReportFilterCardDetails([bc], noopAttrName, noopAdvTime)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toHaveLength(1)
    expect(rules[0][0].name).toBe('Basic Data')
    expect(rules[0][0].visibleAttributes[0].visibleConstraints).toEqual(['Female'])
  })

  it('splits multiple constrained Basic Data attributes into separate rules', () => {
    const bc = makeBasicDataContainer([
      makeAttr('p.attr.gender', [makeConstraint('=', 'Female')]),
      makeAttr('p.attr.age', [makeConstraint('>=', '18')]),
    ])
    const rules = getInclusionReportFilterCardDetails([bc], noopAttrName, noopAdvTime)
    expect(rules).toHaveLength(2)
    expect(rules[0][0].visibleAttributes[0].name).toBe('p.attr.gender')
    expect(rules[1][0].visibleAttributes[0].name).toBe('p.attr.age')
  })

  it('omits Basic Data attributes that have no constraints (does not generate a rule)', () => {
    const bc = makeBasicDataContainer([makeAttr('p.attr.unused', [])])
    const rules = getInclusionReportFilterCardDetails([bc], noopAttrName, noopAdvTime)
    expect(rules).toHaveLength(0)
  })

  it('handles excluded Basic Data wrapped in NOT', () => {
    const inner = makeCard('Basic Data', [makeAttr('p.attr.gender', [makeConstraint('=', 'Male')])])
    const excluded = makeExclusionWrapper(inner)
    const bc = makeContainer(excluded)
    const rules = getInclusionReportFilterCardDetails([bc], noopAttrName, noopAdvTime)
    expect(rules).toHaveLength(1)
    expect(rules[0][0].name).toBe('Basic Data')
  })
})

// ---------------------------------------------------------------------------

describe('getInclusionReportFilterCardDetails – inclusion/exclusion ordering', () => {
  it('puts inclusion cards before exclusion cards within the same container', () => {
    const inclusion = makeCard('Condition', [makeAttr('p.attr.a', [makeConstraint('=', '1')])])
    const exclusion = makeExclusionWrapper(makeCard('Medication', [makeAttr('p.attr.b', [makeConstraint('=', '2')])]))
    const bc = makeContainer(inclusion, exclusion)
    const rules = getInclusionReportFilterCardDetails([bc], noopAttrName, noopAdvTime)
    // Inclusion rule comes first
    expect(rules[0][0].name).toBe('Condition')
    expect(rules[0][0].isExcluded).toBe(false)
    // Exclusion rule follows; the function extracts the inner card from the NOT wrapper,
    // so isExcluded reflects the inner card's own shape (attributes present → false).
    // Ordering, not this flag, separates inclusions from exclusions here.
    expect(rules[1][0].name).toBe('Medication')
    expect(rules).toHaveLength(2)
  })

  it('collects all inclusions from multiple containers before any exclusions (two-pass ordering)', () => {
    const incA = makeCard('A', [makeAttr('p.x', [makeConstraint('=', '1')])])
    const excA = makeExclusionWrapper(makeCard('ExcA', [makeAttr('p.y', [makeConstraint('=', '2')])]))
    const incB = makeCard('B', [makeAttr('p.z', [makeConstraint('=', '3')])])
    const excB = makeExclusionWrapper(makeCard('ExcB', [makeAttr('p.w', [makeConstraint('=', '4')])]))

    const rules = getInclusionReportFilterCardDetails(
      [makeContainer(incA, excA), makeContainer(incB, excB)],
      noopAttrName,
      noopAdvTime
    )
    expect(rules.map(r => r[0].name)).toEqual(['A', 'B', 'ExcA', 'ExcB'])
  })

  it('groups multiple inclusion cards within one container into the same rule entry', () => {
    const bc = makeContainer(
      makeCard('CondA', [makeAttr('p.a', [makeConstraint('=', '1')])]),
      makeCard('CondB', [makeAttr('p.b', [makeConstraint('=', '2')])])
    )
    const rules = getInclusionReportFilterCardDetails([bc], noopAttrName, noopAdvTime)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toHaveLength(2)
    expect(rules[0].map((c: any) => c.name)).toEqual(['CondA', 'CondB'])
  })

  it('handles a container with only exclusions without pushing an empty inclusion rule', () => {
    const excOnly = makeExclusionWrapper(makeCard('Exc', [makeAttr('p.x', [makeConstraint('=', '1')])]))
    const bc = makeContainer(excOnly)
    const rules = getInclusionReportFilterCardDetails([bc], noopAttrName, noopAdvTime)
    // One rule is pushed (the exclusion), no empty inclusion rule
    expect(rules).toHaveLength(1)
    expect(rules[0][0].name).toBe('Exc')
    // extract is called on the inner card (which has attributes), so isExcluded is false;
    // the two-pass ordering places it in the exclusion pass, not the isExcluded flag
    expect(rules[0][0].isExcluded).toBe(false)
  })

  it('flags only Basic Data cards, regardless of their position within an OR group', () => {
    const bdContainer = makeBasicDataContainer([makeAttr('p.attr.gender', [makeConstraint('=', 'F')])])
    // Two OR'd cards in one container: the second must not inherit isBasicData from its index
    const orContainer = makeContainer(
      makeCard('Condition Occurrence A', [makeAttr('p.attr.c', [makeConstraint('=', 'legacy:243')])]),
      makeCard('Condition Occurrence B', [makeAttr('p.attr.c', [makeConstraint('=', 'legacy:241')])])
    )
    const excContainer = makeContainer(
      makeExclusionWrapper(makeCard('ExcA', [makeAttr('p.x', [makeConstraint('=', '1')])])),
      makeExclusionWrapper(makeCard('ExcB', [makeAttr('p.y', [makeConstraint('=', '2')])]))
    )

    const rules = getInclusionReportFilterCardDetails(
      [bdContainer, orContainer, excContainer],
      noopAttrName,
      noopAdvTime
    )
    expect(rules.map(r => r.map((c: any) => c.isBasicData))).toEqual([[true], [false, false], [false], [false]])
  })

  it('orders Basic Data rules before non-Basic inclusion rules before exclusion rules', () => {
    const bdContainer = makeBasicDataContainer([makeAttr('p.attr.gender', [makeConstraint('=', 'F')])])
    const incCard = makeCard('Condition', [makeAttr('p.attr.c', [makeConstraint('=', '1')])])
    const excCard = makeExclusionWrapper(makeCard('Medication', [makeAttr('p.attr.m', [makeConstraint('=', '2')])]))
    const nonBdContainer = makeContainer(incCard, excCard)

    const rules = getInclusionReportFilterCardDetails([bdContainer, nonBdContainer], noopAttrName, noopAdvTime)
    expect(rules.map(r => r[0].name)).toEqual(['Basic Data', 'Condition', 'Medication'])
  })
})
