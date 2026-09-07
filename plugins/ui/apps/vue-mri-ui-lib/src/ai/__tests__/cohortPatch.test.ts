import { vi } from 'vitest'
import { applyCohortPatch, type PatchOp } from '../cohortPatch'
import AdvancedTimeFilterModel from '../../lib/models/AdvancedTimeFilterModel'

// A store stand-in that models just enough of the query module for the applier:
// filter cards, constraints, the bool-container tree that carries the AND/OR
// structure, and the actions/getters it calls. Cards and constraints are held in
// plain maps so tests can assert the resulting state.
//
// `existingCards` is a flat list (one card per group, i.e. all AND-ed) unless
// `existingGroups` is passed, which spells the grouping out: each inner array is
// one bool-filter container, so cards listed together are OR-ed.
const makeStore = ({
  existingCards = [] as string[],
  existingGroups,
  axes = [] as any[],
  // attributePath -> config `domainFilter`, the OMOP domain a conceptSet
  // attribute's concepts must come from. Only set in the tests that exercise it.
  domains,
  // The dataset's panelOptions.cohortEntryExit flag. Left undefined for the
  // no-config-loaded case; every seeded D2E config ships it false.
  cohortEntryExit,
}: {
  existingCards?: string[]
  existingGroups?: string[][]
  axes?: any[]
  domains?: Record<string, string>
  cohortEntryExit?: boolean
} = {}) => {
  // Mirror FilterCardModel.buildLayout: every card carries an (initially empty)
  // advanced-time layout, which is where temporal relations live.
  const makeCard = (id: string, excludeFilter = false) => ({
    props: {
      excludeFilter,
      name: id,
      // FilterCardModel's defaults for the props the Entry/Exit menu reads.
      inactive: false,
      isEntry: false,
      isExit: false,
      layout: { advancedTimeLayout: { props: { timeFilterModel: { timeFilters: [] as any[] } } } },
    },
  })
  const cards: Record<string, ReturnType<typeof makeCard>> = {}
  const groups: string[][] = existingGroups ?? existingCards.map(id => [id])
  for (const id of groups.flat()) cards[id] = makeCard(id)
  const constraints: Record<string, any> = {}
  // Instance numbers continue past whatever is already on the cohort, as they do live.
  let cardSeq = Object.keys(cards).filter(id => id !== 'patient').length
  let conSeq = 0

  // Bool containers are addressed by id in the store, so index them the way the
  // real entity map does: group N is container "bfc<N>", stable across splices.
  const containerIds = () => groups.map((_, i) => `bfc${i}`)
  const groupOf = (containerId: string) => groups[Number(containerId.replace('bfc', ''))]

  const store: any = {
    getters: {
      getFilterCards: () => cards,
      getFilterCard: (id: string) => cards[id],
      getFilterCardConstraints: (cardId: string) => Object.values(constraints).filter((c: any) => c.parent === cardId),
      getAllAxes: axes,
      getBoolContainerRoot: () => 'root',
      getBoolContainer: (id: string) => (id === 'root' ? { props: { boolfiltercontainers: containerIds() } } : null),
      getBoolFilterContainer: (id: string) => ({ props: { filterCards: groupOf(id) ?? [] } }),
      getConstraintForAttribute: ({ filterCardId, key }: { filterCardId: string; key: string }) =>
        Object.values(constraints).find((c: any) => c.parent === filterCardId && c.props.attrKey === key) ?? null,
      ...(domains || cohortEntryExit !== undefined
        ? {
            getMriFrontendConfig: {
              getAttributeByPath: (path: string) => ({ getDomainFilter: () => domains?.[path] ?? '' }),
              // Where ChartController.vue reads the Entry/Exit gate from.
              _internalConfig: { panelOptions: { cohortEntryExit: cohortEntryExit ?? false } },
            },
          }
        : {}),
    },
    dispatch: vi.fn(),
  }

  store.dispatch.mockImplementation((type: string, payload: any) => {
    switch (type) {
      case 'holdFireRequest':
      case 'releaseFireRequest':
      case 'setFireRequest':
      case 'refreshPatientCount':
      case 'resetAxes':
        return Promise.resolve(undefined)
      case 'setAxisValue': {
        if (axes[payload.id]) axes[payload.id].props = { ...axes[payload.id].props, ...payload.props }
        return Promise.resolve(undefined)
      }
      case 'addFilterCard': {
        // Mirror BoolFilterContainer.createFilterCard: the Basic Data card keeps its
        // config path as its instance id, interaction cards get an index suffix.
        const id = payload.configPath === 'patient' ? 'patient' : `${payload.configPath}.${++cardSeq}`
        cards[id] = makeCard(id, payload.isExclusion ?? false)
        // No container id → a NEW group (AND). With one → join that group (OR).
        const target = payload.boolFilterContainerId ? groupOf(payload.boolFilterContainerId) : undefined
        if (target) {
          target.push(id)
        } else {
          groups.push([id])
        }
        return Promise.resolve(id)
      }
      // AND → OR: fold this container into the nearest preceding one.
      case 'toggleFilterContainerBooleanCondition': {
        const index = Number(payload.filterContainerId.replace('bfc', ''))
        groups[index - 1].push(...groups[index])
        groups.splice(index, 1)
        return Promise.resolve(undefined)
      }
      // OR → AND: split the card (and everything after it) into its own container.
      case 'toggleFilterBooleanCondition': {
        const index = Number(payload.parentId.replace('bfc', ''))
        const group = groups[index]
        const moved = group.splice(group.indexOf(payload.filterCardId))
        groups.splice(index + 1, 0, moved)
        return Promise.resolve(undefined)
      }
      case 'addFilterCardConstraint': {
        const existing = Object.values(constraints).find(
          (c: any) => c.parent === payload.filterCardId && c.props.attrKey === payload.key
        ) as any
        if (existing) {
          return Promise.resolve(existing.id)
        }
        const id = `con${++conSeq}`
        // type derived from key for test purposes: age -> num, *date -> time,
        // else conceptSet/text
        const type =
          payload.key === 'age'
            ? 'num'
            : /date$/i.test(payload.key)
              ? 'time'
              : payload.key === 'condition' || /conceptset$/i.test(payload.key)
                ? 'conceptSet'
                : 'text'
        // The real constraint carries the attribute's config path; the card's
        // instance id is its config path plus an index suffix.
        const attributePath = `${payload.filterCardId.replace(/\.\d+$/, '')}.attributes.${payload.key}`
        constraints[id] = {
          id,
          parent: payload.filterCardId,
          props: {
            attrKey: payload.key,
            attributePath,
            type,
            value: undefined,
            // Mirror DateConstraintModel: a date constraint keeps NO value of its
            // own — its state is fromDate/toDate, initialized to ''.
            ...(type === 'time' ? { fromDate: { value: '' }, toDate: { value: '' } } : {}),
          },
        }
        return Promise.resolve(id)
      }
      case 'updateConstraintValue': {
        constraints[payload.constraintId].props.value = payload.value
        return Promise.resolve(undefined)
      }
      // Mirrors CONSTRAINTS_DATETIME_SET_VALUE — a slot entirely separate from
      // props.value, which props.value-only bookkeeping cannot restore.
      case 'updateDateConstraintValue': {
        constraints[payload.constraintId].props.fromDate.value = payload.fromDateValue
        constraints[payload.constraintId].props.toDate.value = payload.toDateValue
        return Promise.resolve(undefined)
      }
      case 'deleteFilterCardConstraint': {
        delete constraints[payload.constraintId]
        return Promise.resolve(undefined)
      }
      // Mirrors FILTERCARD_TOGGLE_IS_ENTRY_EXIT: one card, one role flag.
      case 'updateCohortEntryExit': {
        cards[payload.filterCardId].props[payload.key] = payload.toggle
        return Promise.resolve(undefined)
      }
      // Mirrors FILTERCARD_RESET_ALL_ENTRY_EXIT: a null key clears BOTH roles.
      case 'resetAllFilterCardEntryExit': {
        for (const card of Object.values(cards)) {
          if (payload.key) {
            card.props[payload.key] = false
          } else {
            card.props.isEntry = false
            card.props.isExit = false
          }
        }
        return Promise.resolve(undefined)
      }
      // Mirrors ADVANCEDTIME_SET_TIMEFILTER: the array is assigned by reference.
      case 'updateFilterCardTimeFilter': {
        cards[payload.filterCardId].props.layout.advancedTimeLayout.props.timeFilterModel.timeFilters =
          payload.timeFilters
        return Promise.resolve(undefined)
      }
      case 'deleteFilterCard': {
        delete cards[payload.filterCardId]
        // Mirror FILTERCARD_DELETE: the card leaves its container, and a container
        // left empty is dropped from the tree.
        for (let i = groups.length - 1; i >= 0; i -= 1) {
          const at = groups[i].indexOf(payload.filterCardId)
          if (at > -1) groups[i].splice(at, 1)
          if (groups[i].length === 0) groups.splice(i, 1)
        }
        // Mirror the real query-module action: deleting a card clears every axis
        // bound to that card id.
        for (const axis of axes) {
          if (axis?.props?.filterCardId === payload.filterCardId) {
            axis.props = { ...axis.props, attributeId: '', filterCardId: '', key: '' }
          }
        }
        return Promise.resolve(undefined)
      }
      default:
        return Promise.resolve(undefined)
    }
  })

  return { store, cards, constraints, groups }
}

describe('applyCohortPatch', () => {
  it('rejects an empty patch', async () => {
    const { store } = makeStore()
    await expect(applyCohortPatch(store, [] as PatchOp[])).rejects.toThrow(/non-empty/)
  })

  it('holds fire-request, then releases + refreshes after success', async () => {
    const { store } = makeStore()
    await applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: 'patient.interactions.priDiag' }])

    expect(store.dispatch).toHaveBeenCalledWith('holdFireRequest', undefined)
    expect(store.dispatch).toHaveBeenCalledWith('releaseFireRequest', undefined)
    expect(store.dispatch).toHaveBeenCalledWith('setFireRequest', undefined)
    expect(store.dispatch).toHaveBeenCalledWith('refreshPatientCount', undefined)
  })

  it('applies a basic numeric filter (age >= 65) via the shared normalizer', async () => {
    const { store, constraints } = makeStore()
    const res = await applyCohortPatch(store, [
      { op: 'add_card', cardConfigPath: 'patient', ref: 'basic' },
      { op: 'add_constraint', card: 'basic', attributePath: 'patient.attributes.age', value: '>=65' },
    ])

    expect(res.applied).toBe(true)
    // The `ref` resolved across ops, so the constraint landed on the card the
    // preceding add_card created.
    expect(res.createdCards).toHaveLength(1)
    const con = Object.values(constraints).find((c: any) => c.props.attrKey === 'age') as any
    expect(con.props.value).toEqual([{ op: '>=', value: 65 }])
  })

  it('applies a concept-set filter with the picker value shape (conceptSetId + includeDescendants)', async () => {
    const { store, constraints } = makeStore()
    await applyCohortPatch(store, [
      { op: 'add_card', cardConfigPath: 'patient.interactions.priDiag', ref: 'dx' },
      {
        op: 'add_constraint',
        card: 'dx',
        attributePath: 'patient.interactions.priDiag.attributes.condition',
        value: { conceptSetId: 'cs_42', includeDescendants: true, displayValue: 'Viral sinusitis' },
      },
    ])

    const con = Object.values(constraints).find((c: any) => c.props.attrKey === 'condition') as any
    expect(con.props.value).toEqual([
      { value: 'cs_42', text: 'Viral sinusitis', display_value: 'Viral sinusitis', includeDescendants: true },
    ])
  })

  it('reports the constraint values that actually landed, read back from the store', async () => {
    const { store } = makeStore()
    const res = await applyCohortPatch(store, [
      { op: 'add_card', cardConfigPath: 'patient.interactions.conditionoccurrence', ref: 'dx' },
      {
        op: 'add_constraint',
        card: 'dx',
        attributePath: 'patient.interactions.conditionoccurrence.attributes.condition',
        // conceptSetId as a NUMBER, exactly as d2e-mcp create_concept_set returns it:
        // it has to land as the stringified id (the filter Expression reads .value),
        // never as the object stringified to "[object Object]" — a broken filter that
        // renders an empty chart and a patient count of "--".
        value: { conceptSetId: 37, displayValue: "Alzheimer's disease" },
      },
    ])

    expect(res.appliedConstraints).toEqual([
      {
        card: 'patient.interactions.conditionoccurrence.1',
        attributePath: 'patient.interactions.conditionoccurrence.attributes.condition',
        value: [
          {
            value: '37',
            text: "Alzheimer's disease",
            display_value: "Alzheimer's disease",
            includeDescendants: false,
          },
        ],
      },
    ])
  })

  // Every empty shape is caught by the same input check, before anything is
  // mutated: applyConstraintValue reads an empty value on a text/conceptSet
  // attribute as "clear this filter", so the patch would report success and leave
  // a filter card with no constraint on the cohort.
  it.each([[undefined], [''], [[]], [{}], [null]])(
    'rejects an add_constraint whose value is %p instead of silently clearing the filter',
    async value => {
      const { store, cards } = makeStore()
      await expect(
        applyCohortPatch(store, [
          { op: 'add_card', cardConfigPath: 'patient.interactions.conditionoccurrence', ref: 'dx' },
          {
            op: 'add_constraint',
            card: 'dx',
            attributePath: 'patient.interactions.conditionoccurrence.attributes.conditionconceptset',
            value,
          } as any,
        ])
      ).rejects.toThrow(/has no value/)

      // The half-built card must not survive as an unfiltered Condition Occurrence.
      expect(Object.keys(cards)).toHaveLength(0)
    }
  )

  it('names the mistake when the concept-set id sits beside `value` instead of inside it', async () => {
    const { store } = makeStore()
    await expect(
      applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: 'patient.interactions.conditionoccurrence', ref: 'dx' },
        {
          op: 'add_constraint',
          card: 'dx',
          attributePath: 'patient.interactions.conditionoccurrence.attributes.conditionconceptset',
          conceptSetId: 37,
        } as any,
      ])
    ).rejects.toThrow(/conceptSetId at the top level of the op — it belongs inside `value`/)
  })

  it('rejects an unknown cardConfigPath with a recoverable message when config is loaded', async () => {
    const { store } = makeStore()
    store.getters.getMriFrontendConfig = {
      getFilterCards: () => [{ getConfigPath: () => 'patient' }],
    }
    await expect(applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: 'patient.bogus' }])).rejects.toThrow(
      /Unknown cardConfigPath/
    )
  })

  it('creates an exclusion card when exclude is set', async () => {
    const { store, cards } = makeStore()
    await applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: 'patient.interactions.priDiag', exclude: true }])
    expect(store.dispatch).toHaveBeenCalledWith('addFilterCard', {
      configPath: 'patient.interactions.priDiag',
      isExclusion: true,
    })
    expect(Object.values(cards)[0].props.excludeFilter).toBe(true)
  })

  it('reuses the Basic Data card instead of adding a second copy of it', async () => {
    // The model has no way to know Basic Data is always present, so it adds it
    // before constraining Age/Gender. The store would create a SECOND card under
    // the same instance id ('patient'), which duplicates every constraint on it in
    // the generated SQL and clears the chart axes as soon as either copy is deleted.
    const { store, cards } = makeStore({ existingCards: ['patient'] })
    const res = await applyCohortPatch(store, [
      { op: 'add_card', cardConfigPath: 'patient', ref: 'basic' },
      { op: 'add_constraint', card: 'basic', attributePath: 'patient.attributes.age', value: '<100' },
    ])

    expect(store.dispatch).not.toHaveBeenCalledWith('addFilterCard', expect.objectContaining({ configPath: 'patient' }))
    expect(Object.keys(cards)).toEqual(['patient'])
    // The ref still resolves, so the constraint lands on the card that is there.
    expect(res.applied).toBe(true)
    expect(res.createdCards).toEqual([])
  })

  it('still creates a second instance of an indexed (interaction) card', async () => {
    const { store, cards } = makeStore({ existingCards: ['patient.interactions.conditionoccurrence.1'] })
    await applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: 'patient.interactions.conditionoccurrence' }])
    expect(Object.keys(cards)).toHaveLength(2)
  })

  it('restores the axis selection when a rolled-back card deletion clears it', async () => {
    const axes = [
      { props: { attributeId: 'patient.attributes.Gender', filterCardId: 'patient', key: 'Gender' } },
      { props: { attributeId: 'patient.attributes.Age', filterCardId: 'patient', key: 'Age', binsize: 10 } },
    ]
    const { store } = makeStore({ axes })

    await expect(
      applyCohortPatch(store, [
        // 'patient' is absent here, so this genuinely creates the card...
        { op: 'add_card', cardConfigPath: 'patient', ref: 'p' },
        // ...and this fails, so the rollback deletes it again — taking both axes with it.
        { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
      ])
    ).rejects.toThrow(/Unknown card/)

    expect(axes[0].props).toMatchObject({
      attributeId: 'patient.attributes.Gender',
      filterCardId: 'patient',
      key: 'Gender',
    })
    expect(axes[1].props).toMatchObject({ attributeId: 'patient.attributes.Age', filterCardId: 'patient', binsize: 10 })
  })

  describe('AND / OR grouping', () => {
    const DX = 'patient.interactions.conditionoccurrence'

    it('AND-s a new card by default (each card in its own group)', async () => {
      const { store, groups } = makeStore({ existingCards: ['patient', `${DX}.1`] })
      const res = await applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: DX }])

      expect(groups).toEqual([['patient'], [`${DX}.1`], [`${DX}.2`]])
      expect(res.cardGroups).toHaveLength(3)
    })

    it('ORs a new card with an existing one via orWith — "Alzheimer\'s OR sinusitis"', async () => {
      // The reported bug: asked to widen an Alzheimer's cohort to "Alzheimer's OR
      // sinusitis", the assistant could only add a second AND-ed card, which reads
      // as "had both". The second condition has to land in the FIRST card's group.
      const { store, groups, constraints } = makeStore({ existingCards: ['patient', `${DX}.1`] })
      const res = await applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: DX, ref: 'dx2', orWith: `${DX}.1` },
        {
          op: 'add_constraint',
          card: 'dx2',
          attributePath: `${DX}.attributes.conditionconceptset`,
          value: { conceptSetId: 42, displayValue: 'Sinusitis' },
        },
      ])

      expect(store.dispatch).toHaveBeenCalledWith('addFilterCard', {
        configPath: DX,
        isExclusion: false,
        boolFilterContainerId: 'bfc1',
      })
      // One group holding both condition cards = Or(A, B) in the IFR.
      expect(groups).toEqual([['patient'], [`${DX}.1`, `${DX}.2`]])
      expect(res.cardGroups).toEqual([
        { cards: [{ filterCardId: 'patient', name: 'patient' }] },
        {
          cards: [
            { filterCardId: `${DX}.1`, name: `${DX}.1` },
            { filterCardId: `${DX}.2`, name: `${DX}.2` },
          ],
        },
      ])
      // ...and the sinusitis filter is on the NEW card only — the first card's
      // concept set is not restated, which would have made it "both conditions".
      const con = Object.values(constraints).find((c: any) => c.parent === `${DX}.2`) as any
      expect(con.props.value).toEqual([
        { value: '42', text: 'Sinusitis', display_value: 'Sinusitis', includeDescendants: false },
      ])
      expect(Object.values(constraints)).toHaveLength(1)
    })

    it('resolves orWith against a ref created earlier in the same patch', async () => {
      const { store, groups } = makeStore({ existingCards: ['patient'] })
      await applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: DX, ref: 'a' },
        { op: 'add_card', cardConfigPath: DX, ref: 'b', orWith: 'a' },
      ])
      expect(groups).toEqual([['patient'], [`${DX}.1`, `${DX}.2`]])
    })

    it('refuses to OR a card with Basic Data (it would match every patient)', async () => {
      const { store, groups } = makeStore({ existingCards: ['patient'] })
      await expect(
        applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: DX, orWith: 'patient' }])
      ).rejects.toThrow(/Basic Data/)
      expect(groups).toEqual([['patient']])
    })

    it('refuses to OR an exclusion card with an inclusion one', async () => {
      const { store } = makeStore({ existingCards: ['patient', `${DX}.1`] })
      await expect(
        applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: DX, exclude: true, orWith: `${DX}.1` }])
      ).rejects.toThrow(/exclusion/)
    })

    it('set_card_join OR merges a card already on the cohort into the preceding group', async () => {
      const { store, groups } = makeStore({ existingCards: ['patient', `${DX}.1`, `${DX}.2`] })
      const res = await applyCohortPatch(store, [{ op: 'set_card_join', card: `${DX}.2`, join: 'OR' }])

      expect(groups).toEqual([['patient'], [`${DX}.1`, `${DX}.2`]])
      expect(res.cardGroups?.[1].cards.map(c => c.filterCardId)).toEqual([`${DX}.1`, `${DX}.2`])
    })

    it('set_card_join AND splits an OR-ed card back into its own group', async () => {
      const { store, groups } = makeStore({ existingGroups: [['patient'], [`${DX}.1`, `${DX}.2`]] })
      await applyCohortPatch(store, [{ op: 'set_card_join', card: `${DX}.2`, join: 'AND' }])

      expect(groups).toEqual([['patient'], [`${DX}.1`], [`${DX}.2`]])
    })

    it('is a no-op when the requested join is already in place', async () => {
      const { store, groups } = makeStore({ existingGroups: [['patient'], [`${DX}.1`, `${DX}.2`]] })
      await applyCohortPatch(store, [{ op: 'set_card_join', card: `${DX}.2`, join: 'OR' }])
      expect(groups).toEqual([['patient'], [`${DX}.1`, `${DX}.2`]])
      expect(store.dispatch).not.toHaveBeenCalledWith('toggleFilterContainerBooleanCondition', expect.anything())
    })

    it('refuses to OR the first filter card with Basic Data before it', async () => {
      const { store, groups } = makeStore({ existingCards: ['patient', `${DX}.1`] })
      await expect(applyCohortPatch(store, [{ op: 'set_card_join', card: `${DX}.1`, join: 'OR' }])).rejects.toThrow(
        /Basic Data/
      )
      expect(groups).toEqual([['patient'], [`${DX}.1`]])
    })

    it('refuses to change the join on the Basic Data card itself', async () => {
      const { store, groups } = makeStore({ existingCards: ['patient', `${DX}.1`] })
      await expect(applyCohortPatch(store, [{ op: 'set_card_join', card: 'patient', join: 'OR' }])).rejects.toThrow(
        /Basic Data card is always AND-ed/
      )
      expect(groups).toEqual([['patient'], [`${DX}.1`]])
    })

    it('rejects an invalid join value', async () => {
      const { store } = makeStore({ existingCards: ['patient', `${DX}.1`, `${DX}.2`] })
      await expect(
        applyCohortPatch(store, [{ op: 'set_card_join', card: `${DX}.2`, join: 'XOR' } as any])
      ).rejects.toThrow(/must be "AND" or "OR"/)
    })

    it('undoes a grouping change when a later op fails (atomic)', async () => {
      const { store, groups } = makeStore({ existingCards: ['patient', `${DX}.1`, `${DX}.2`] })
      await expect(
        applyCohortPatch(store, [
          { op: 'set_card_join', card: `${DX}.2`, join: 'OR' },
          { op: 'add_constraint', card: 'ghost', attributePath: `${DX}.attributes.condition`, value: 1 },
        ])
      ).rejects.toThrow(/Unknown card/)

      expect(groups).toEqual([['patient'], [`${DX}.1`], [`${DX}.2`]])
    })

    it('keeps the chart axes when OR-ing clears them (resetAxes fires on grouped cards)', async () => {
      // resetAxes clears every axis bound to a card in a container that now holds
      // more than one card. Left cleared, the chart query goes out with an empty
      // axisSelection and the patient count renders "--".
      const axes = [{ props: { attributeId: `${DX}.attributes.startdate`, filterCardId: `${DX}.1`, key: 'startdate' } }]
      const { store } = makeStore({ existingCards: ['patient', `${DX}.1`], axes })
      // The real resetAxes runs inside addFilterCard; the mock triggers it here.
      store.dispatch.mockImplementation(
        ((inner: any) => (type: string, payload: any) => {
          const res = inner(type, payload)
          if (type === 'addFilterCard' && payload.boolFilterContainerId) {
            axes[0].props = { attributeId: '', filterCardId: '', key: '' }
          }
          return res
        })(store.dispatch.getMockImplementation())
      )

      await applyCohortPatch(store, [{ op: 'add_card', cardConfigPath: DX, orWith: `${DX}.1` }])

      expect(axes[0].props).toMatchObject({
        attributeId: `${DX}.attributes.startdate`,
        filterCardId: `${DX}.1`,
      })
    })
  })

  describe('concept-set domain', () => {
    const DX = 'patient.interactions.conditionoccurrence'
    const VISIT = 'patient.interactions.visit'
    const DX_SET = `${DX}.attributes.conditionconceptset`
    const VISIT_SET = `${VISIT}.attributes.visitconceptset`
    const domains = { [DX_SET]: 'Condition', [VISIT_SET]: 'Visit' }

    // "Alzheimer's OR an ER visit": the model OR-ed the Visit card correctly and
    // then filled its concept set with the Alzheimer's set it already had in
    // context, never resolving "ER visit". The cohort computes, so nothing looks
    // wrong — it just answers a different question.
    const carriedOverPatch: PatchOp[] = [
      { op: 'add_card', cardConfigPath: VISIT, ref: 'v', orWith: `${DX}.1` },
      { op: 'add_constraint', card: 'v', attributePath: VISIT_SET, value: { conceptSetId: 41 } },
    ]

    const withAlzheimers = async () => {
      const made = makeStore({ existingCards: ['patient', `${DX}.1`], domains })
      await applyCohortPatch(made.store, [
        {
          op: 'add_constraint',
          card: `${DX}.1`,
          attributePath: DX_SET,
          value: { conceptSetId: 41, displayValue: "Alzheimer's disease" },
        },
      ])
      return made
    }

    it("rejects carrying a Condition concept set onto a Visit card's concept set", async () => {
      const { store, constraints } = await withAlzheimers()

      await expect(applyCohortPatch(store, carriedOverPatch)).rejects.toThrow(
        /Concept set 41 is already filtered on .*conditionconceptset.*Condition-domain.*Visit-domain/s
      )
      // Atomic: the half-built Visit card is gone, and the Alzheimer's filter stands.
      const visitConstraint = Object.values(constraints).find((c: any) => c.parent.startsWith(VISIT))
      expect(visitConstraint).toBeUndefined()
      expect(Object.values(constraints)).toHaveLength(1)
    })

    it('rolls the OR-ed card back out of the group when its value is rejected', async () => {
      const { store, groups } = await withAlzheimers()
      await expect(applyCohortPatch(store, carriedOverPatch)).rejects.toThrow(/Concept set 41/)
      expect(groups).toEqual([['patient'], [`${DX}.1`]])
    })

    it('allows the same concept set on two cards of the SAME domain (primary + secondary diagnosis)', async () => {
      const { store } = await withAlzheimers()
      const res = await applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: DX, ref: 'dx2', orWith: `${DX}.1` },
        { op: 'add_constraint', card: 'dx2', attributePath: DX_SET, value: { conceptSetId: 41 } },
      ])
      expect(res.applied).toBe(true)
    })

    it('allows a different concept set on the Visit card — the correct fix', async () => {
      const { store, constraints } = await withAlzheimers()
      const res = await applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: VISIT, ref: 'v', orWith: `${DX}.1` },
        {
          op: 'add_constraint',
          card: 'v',
          attributePath: VISIT_SET,
          value: { conceptSetId: 88, displayValue: 'Emergency Room Visit' },
        },
      ])
      expect(res.applied).toBe(true)
      const visitConstraint = Object.values(constraints).find((c: any) => c.parent.startsWith(VISIT)) as any
      expect(visitConstraint.props.value[0]).toMatchObject({ value: '88', text: 'Emergency Room Visit' })
    })

    it('skips the check when the config exposes no domain for the attribute', async () => {
      // domainFilter is empty on plenty of attributes (and absent on non-OMOP
      // configs); an unknown domain must not block a legitimate patch.
      const { store } = makeStore({ existingCards: ['patient', `${DX}.1`] })
      await applyCohortPatch(store, [
        { op: 'add_constraint', card: `${DX}.1`, attributePath: DX_SET, value: { conceptSetId: 41 } },
      ])
      const res = await applyCohortPatch(store, carriedOverPatch)
      expect(res.applied).toBe(true)
    })
  })

  it('restores a date range when a later op fails — the state lives in fromDate/toDate', async () => {
    // Date/time constraints are written by updateDateConstraintValue into
    // props.fromDate.value / props.toDate.value and have no props.value at all, so
    // rollback bookkeeping that snapshots only `value` recorded undefined and
    // restored nothing: the patch threw, and the widened window stayed on the
    // cohort. The user is told nothing was applied, and a later save persists a
    // date range nobody asked for.
    const DX = 'patient.interactions.conditionoccurrence'
    const STARTDATE = `${DX}.attributes.startdate`
    const { store, constraints } = makeStore({ existingCards: ['patient', `${DX}.1`] })

    // Patch 1 commits the window the cohort arrives with (as opening a saved
    // cohort would) — the constraint therefore pre-exists patch 2.
    await applyCohortPatch(store, [
      {
        op: 'add_constraint',
        card: `${DX}.1`,
        attributePath: STARTDATE,
        value: { from: '2019-01-01', to: '2019-12-31' },
      },
    ])
    const con = Object.values(constraints).find((c: any) => c.props.attrKey === 'startdate') as any
    const before = { from: con.props.fromDate.value, to: con.props.toDate.value }
    expect(before.from).toBeInstanceOf(Date)
    expect(con.props.value).toBeUndefined()

    // Patch 2 widens the window, then fails on the next op.
    await expect(
      applyCohortPatch(store, [
        {
          op: 'add_constraint',
          card: `${DX}.1`,
          attributePath: STARTDATE,
          value: { from: '2015-01-01', to: '2020-12-31' },
        },
        { op: 'add_constraint', card: 'ghost', attributePath: `${DX}.attributes.condition`, value: 1 },
      ])
    ).rejects.toThrow(/Unknown card/)

    expect(con.props.fromDate.value).toEqual(before.from)
    expect(con.props.toDate.value).toEqual(before.to)
    // isUTC:true is the pass-through branch; isUTC:false shifts by the timezone
    // offset on every call, so a revert using it would move the restored range.
    expect(store.dispatch).toHaveBeenCalledWith('updateDateConstraintValue', {
      constraintId: con.id,
      fromDateValue: before.from,
      toDateValue: before.to,
      isUTC: true,
    })
  })

  describe('date-range warnings', () => {
    // A date range is the one constraint the model can fabricate without a lookup,
    // so it is the one that lands cleanly when nobody asked for it: the reported
    // symptom was an invented start-date window on the Observation Period card,
    // added for a prior-observation requirement that belongs in set_time_relation.
    // The applier cannot know what the user said, so it does not reject — it makes
    // the range impossible to leave unmentioned.
    const OBS = 'patient.interactions.obsperiod'
    const OBS_START = `${OBS}.attributes.startdate`

    it('warns about every date range that landed, naming the window and the alternatives', async () => {
      const { store } = makeStore({ existingCards: ['patient', `${OBS}.1`] })
      const res = await applyCohortPatch(store, [
        {
          op: 'add_constraint',
          card: `${OBS}.1`,
          attributePath: OBS_START,
          value: { from: '2010-01-01', to: '2015-12-31' },
        },
      ])
      expect(res.applied).toBe(true)
      expect(res.warnings).toHaveLength(1)
      const [warning] = res.warnings!
      // The exact window, so the model cannot report the filter without the dates.
      expect(warning).toContain('2010-01-01')
      expect(warning).toContain('2015-12-31')
      expect(warning).toContain(OBS_START)
      // And the two ops it should have reached for instead.
      expect(warning).toContain('set_time_relation')
      expect(warning).toContain('set_entry_exit')
      expect(warning).toContain('remove_constraint')
    })

    it('omits `warnings` entirely when no date range was applied', async () => {
      // The result is resent on every agent turn, so an always-present empty array
      // is pure context burn.
      const DX = 'patient.interactions.conditionoccurrence'
      const { store } = makeStore({ existingCards: ['patient', `${DX}.1`] })
      const res = await applyCohortPatch(store, [
        {
          op: 'add_constraint',
          card: `${DX}.1`,
          attributePath: `${DX}.attributes.conditionconceptset`,
          value: { conceptSetId: 37 },
        },
        { op: 'add_constraint', card: 'patient', attributePath: 'patient.attributes.age', value: 60, operator: '>=' },
      ])
      expect(res.applied).toBe(true)
      expect('warnings' in res).toBe(false)
    })

    it('quotes the dates the OP asked for, not the shifted Date the store holds', async () => {
      // updateDateConstraintValue shifts the value by the local timezone offset so
      // it SERIALISES to the intended calendar day, so formatting the stored Date
      // back prints the neighbouring day west of UTC. A warning that misquotes the
      // window is worse than none — and the op's own strings are what the model has
      // to justify anyway.
      const { store, constraints } = makeStore({ existingCards: ['patient', `${OBS}.1`] })
      const res = await applyCohortPatch(store, [
        {
          op: 'add_constraint',
          card: `${OBS}.1`,
          attributePath: OBS_START,
          value: { from: '2010-01-01', to: '2015-12-31' },
        },
      ])
      const stored = Object.values(constraints).find((c: any) => c.props.attrKey === 'startdate') as any
      expect(stored.props.fromDate.value).toBeInstanceOf(Date)
      expect(res.warnings![0]).toContain('Date range 2010-01-01 → 2015-12-31')
    })

    it('warns on a scalar date too — it pins both ends of the range to one day', async () => {
      const { store } = makeStore({ existingCards: ['patient', `${OBS}.1`] })
      const res = await applyCohortPatch(store, [
        { op: 'add_constraint', card: `${OBS}.1`, attributePath: OBS_START, value: '2010-06-15' },
      ])
      expect(res.warnings).toHaveLength(1)
      expect(res.warnings![0]).toContain('Date range 2010-06-15 → 2010-06-15')
    })

    it('warns per date range, so a from/to pair on two cards is two warnings', async () => {
      const DX = 'patient.interactions.conditionoccurrence'
      const { store } = makeStore({ existingCards: ['patient', `${OBS}.1`, `${DX}.1`] })
      const res = await applyCohortPatch(store, [
        {
          op: 'add_constraint',
          card: `${OBS}.1`,
          attributePath: OBS_START,
          value: { from: '2010-01-01', to: '2015-12-31' },
        },
        {
          op: 'add_constraint',
          card: `${DX}.1`,
          attributePath: `${DX}.attributes.startdate`,
          value: { from: '2012-01-01', to: '2012-12-31' },
        },
      ])
      expect(res.warnings).toHaveLength(2)
    })
  })

  describe('removals', () => {
    const DX = 'patient.interactions.conditionoccurrence'
    const DX_SET = `${DX}.attributes.conditionconceptset`

    const withAlzheimers = async () => {
      const made = makeStore({ existingCards: ['patient', `${DX}.1`] })
      await applyCohortPatch(made.store, [
        { op: 'add_constraint', card: 'patient', attributePath: 'patient.attributes.age', value: '>=65' },
        {
          op: 'add_constraint',
          card: `${DX}.1`,
          attributePath: DX_SET,
          value: { conceptSetId: 41, displayValue: "Alzheimer's disease" },
        },
      ])
      return made
    }

    it("removes one constraint and leaves the card's other filters alone", async () => {
      const { store, constraints } = await withAlzheimers()
      const res = await applyCohortPatch(store, [{ op: 'remove_constraint', card: `${DX}.1`, attributePath: DX_SET }])

      expect(res.applied).toBe(true)
      expect(Object.values(constraints).map((c: any) => c.props.attrKey)).toEqual(['age'])
    })

    it('is a no-op when the constraint to remove is not on the card', async () => {
      const { store } = makeStore({ existingCards: ['patient'] })
      const res = await applyCohortPatch(store, [
        { op: 'remove_constraint', card: 'patient', attributePath: 'patient.attributes.age' },
      ])

      expect(res.applied).toBe(true)
      expect(store.dispatch).not.toHaveBeenCalledWith('deleteFilterCardConstraint', expect.anything())
    })

    it('puts a removed constraint back — value and all — when a later op fails', async () => {
      // Atomic has to mean the filter the user had comes back, not merely that
      // nothing new was added. A patch that widens a cohort by dropping a filter and
      // then fails would otherwise leave it permanently widened while telling the
      // user nothing was applied.
      const { store, constraints } = await withAlzheimers()

      await expect(
        applyCohortPatch(store, [
          { op: 'remove_constraint', card: `${DX}.1`, attributePath: DX_SET },
          { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
        ])
      ).rejects.toThrow(/Unknown card/)

      const con = Object.values(constraints).find((c: any) => c.props.attrKey === 'conditionconceptset') as any
      expect(con.props.value).toEqual([
        { value: '41', text: "Alzheimer's disease", display_value: "Alzheimer's disease", includeDescendants: false },
      ])
    })

    it('puts the ORIGINAL value back when the patch replaced the same constraint and then failed', async () => {
      const { store, constraints } = await withAlzheimers()

      await expect(
        applyCohortPatch(store, [
          { op: 'remove_constraint', card: `${DX}.1`, attributePath: DX_SET },
          {
            op: 'add_constraint',
            card: `${DX}.1`,
            attributePath: DX_SET,
            value: { conceptSetId: 99, displayValue: 'Something else' },
          },
          { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
        ])
      ).rejects.toThrow(/Unknown card/)

      const cons = Object.values(constraints).filter((c: any) => c.props.attrKey === 'conditionconceptset')
      expect(cons).toHaveLength(1)
      expect((cons[0] as any).props.value).toEqual([
        { value: '41', text: "Alzheimer's disease", display_value: "Alzheimer's disease", includeDescendants: false },
      ])
    })

    it('removes a card — and leaves it removed when a later op fails', async () => {
      // The one op revert cannot undo: re-adding the card would mint a new instance
      // id and lose the constraints that hung off it. Pinned here so the limitation
      // stays a decision (documented on applyCohortPatch) rather than a surprise.
      const { store, cards, groups } = makeStore({ existingCards: ['patient', `${DX}.1`] })

      await expect(
        applyCohortPatch(store, [
          { op: 'remove_card', card: `${DX}.1` },
          { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
        ])
      ).rejects.toThrow(/Unknown card/)

      expect(Object.keys(cards)).toEqual(['patient'])
      expect(groups).toEqual([['patient']])
    })

    it('does not re-point the chart axes at a card the patch removed', async () => {
      const axes = [{ props: { attributeId: `${DX}.attributes.startdate`, filterCardId: `${DX}.1`, key: 'startdate' } }]
      const { store } = makeStore({ existingCards: ['patient', `${DX}.1`], axes })

      await expect(
        applyCohortPatch(store, [
          { op: 'remove_card', card: `${DX}.1` },
          { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
        ])
      ).rejects.toThrow(/Unknown card/)

      // Restoring the snapshot here would leave the chart querying an axis bound to
      // a filterCardId the IFR no longer contains.
      expect(axes[0].props).toMatchObject({ attributeId: '', filterCardId: '', key: '' })
    })
  })

  it('rolls back created cards/constraints when a later op fails (atomic)', async () => {
    const { store, cards, constraints } = makeStore()
    await expect(
      applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: 'patient', ref: 'p' },
        { op: 'add_constraint', card: 'p', attributePath: 'patient.attributes.age', value: 65 },
        // Unknown card ref -> resolveCard throws mid-patch.
        { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
      ])
    ).rejects.toThrow(/Unknown card/)

    // Everything created during the patch is undone.
    expect(Object.keys(cards)).toHaveLength(0)
    expect(Object.keys(constraints)).toHaveLength(0)
    expect(store.dispatch).toHaveBeenCalledWith('releaseFireRequest', undefined)
    // No live refresh on failure.
    expect(store.dispatch).not.toHaveBeenCalledWith('refreshPatientCount', undefined)
  })

  describe('temporal relations', () => {
    const DX = 'patient.interactions.conditionoccurrence.1'
    const RX = 'patient.interactions.drugexposure.1'
    const timeFiltersOn = (cards: any, id: string) =>
      cards[id].props.layout.advancedTimeLayout.props.timeFilterModel.timeFilters

    it('writes "within 90 days after" as a 0–90 range, not a bare 90', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX] })
      const result = await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'within', days: 90, direction: 'after' },
      ])

      expect(timeFiltersOn(cards, RX)).toEqual([
        {
          originSelection: 'startdate',
          targetSelection: 'after_startdate',
          targetInteraction: DX,
          // A bare "90" would mean the 90th day EXACTLY (see getRequest) — the
          // single most likely way to get this wrong.
          days: '[0-90]',
        },
      ])
      expect(result.timeRelations).toEqual([
        { card: RX, relativeTo: DX, description: `${RX} starts within 90 days after ${DX} starts` },
      ])
    })

    // The point of building the `days` expression in the applier rather than
    // taking it raw: prove the window the query gets is 0–90, not day 90.
    it('round-trips through getRequest as a 0–90 day window', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX] })
      await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'within', days: 90, direction: 'after' },
      ])

      const request = AdvancedTimeFilterModel.getRequest(cards[RX].props.layout.advancedTimeLayout)
      // `after` negates the day count, so the window is [-90, 0]: the drug starts
      // between 0 and 90 days after the diagnosis.
      expect(request).toEqual([
        {
          and: [
            {
              value: DX,
              filter: [
                {
                  this: 'startdate',
                  other: 'startdate',
                  and: [
                    { op: '<=', value: -0 },
                    { op: '>=', value: -90 },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })

    // `within` is the second value nothing stops the model getting wrong (dates
    // are the first): "the 2nd eGFR >=90 days after the 1st" built as within+90
    // is the COMPLEMENT of the request, and it computes and renders like a
    // success. The warning is what makes the bound impossible to leave unsaid.
    it('warns that a "within" relation is a closed at-most window', async () => {
      const { store } = makeStore({ existingCards: ['patient', DX, RX] })
      const result = await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'within', days: 90, direction: 'after' },
      ])

      expect(result.warnings).toHaveLength(1)
      expect(result.warnings![0]).toContain('0–90 days')
      expect(result.warnings![0]).toContain('AT MOST 90 days apart')
      // Names the op that fixes it, with the day count already filled in.
      expect(result.warnings![0]).toContain('mode:"at_least", days:90')
      // The mode was explicit here, so it is not reported as a default.
      expect(result.warnings![0]).not.toContain('defaulted')
    })

    it('calls out the defaulted mode when the op omits it', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX] })
      const result = await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, days: 90 },
      ])

      expect(timeFiltersOn(cards, RX)[0]).toMatchObject({ days: '[0-90]' })
      expect(result.warnings![0]).toContain('defaulted to "within"')
    })

    // A mode that carries its own bound needs no second-guessing, and a warning
    // on every relation would train the reader to skip them.
    it('does not warn for at_least / between / overlaps', async () => {
      const { store } = makeStore({ existingCards: ['patient', DX, RX] })
      for (const op of [
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'at_least', days: 90 },
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'between', minDays: 30, maxDays: 90 },
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'overlaps' },
      ] as const) {
        const result = await applyCohortPatch(store, [op as any])
        expect(result.warnings).toBeUndefined()
      }
    })

    // The clinical shape the warning exists for, end to end: two instances of the
    // same card, each carrying the threshold, with a floor between them.
    it('expresses "2 values <60, the 2nd >=90d after the 1st" as at_least between two cards', async () => {
      const LAB1 = 'patient.interactions.measurement.1'
      const LAB2 = 'patient.interactions.measurement.2'
      const { store, cards } = makeStore({ existingCards: ['patient', LAB1, LAB2] })
      const result = await applyCohortPatch(store, [
        { op: 'set_time_relation', card: LAB2, relativeTo: LAB1, mode: 'at_least', days: 90, direction: 'after' },
      ])

      expect(timeFiltersOn(cards, LAB2)[0]).toMatchObject({
        days: '>=90',
        targetSelection: 'after_startdate',
        targetInteraction: LAB1,
      })
      expect(result.warnings).toBeUndefined()
      expect(result.timeRelations).toEqual([
        { card: LAB2, relativeTo: LAB1, description: `${LAB2} starts at least 90 days after ${LAB1} starts` },
      ])
    })

    it('mode "exactly" is a single day, and getIFR keeps it', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX] })
      await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'exactly', days: 30, direction: 'before' },
      ])

      expect(timeFiltersOn(cards, RX)[0]).toMatchObject({ days: '30', targetSelection: 'before_startdate' })
      const ifr = AdvancedTimeFilterModel.getIFR(cards[RX].props.layout.advancedTimeLayout)
      expect(ifr.filters).toEqual([
        { value: DX, this: 'startdate', other: 'startdate', after_before: 'before', operator: '30' },
      ])
    })

    it('supports end anchors, at_least/at_most/between and overlaps', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX] })
      await applyCohortPatch(store, [
        {
          op: 'set_time_relation',
          card: RX,
          relativeTo: DX,
          mode: 'between',
          minDays: 30,
          maxDays: 90,
          toDate: 'end',
        },
      ])
      expect(timeFiltersOn(cards, RX)[0]).toMatchObject({ days: '[30-90]', targetSelection: 'after_enddate' })

      await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'at_least', days: 7, fromDate: 'end' },
      ])
      expect(timeFiltersOn(cards, RX)[0]).toMatchObject({ days: '>=7', originSelection: 'enddate' })

      await applyCohortPatch(store, [{ op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'at_most', days: 7 }])
      expect(timeFiltersOn(cards, RX)[0]).toMatchObject({ days: '<=7' })

      await applyCohortPatch(store, [{ op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'overlaps' }])
      expect(timeFiltersOn(cards, RX)[0]).toEqual({
        originSelection: 'overlap',
        // Never left empty: AdvancedTime.vue resolves this key against its option
        // list on mount and throws on an unknown one.
        targetSelection: 'before_startdate',
        targetInteraction: DX,
        days: '',
      })
    })

    it('rejects a day count that is not a whole number of days', async () => {
      const { store } = makeStore({ existingCards: ['patient', DX, RX] })
      await expect(
        applyCohortPatch(store, [{ op: 'set_time_relation', card: RX, relativeTo: DX, days: 1.5 }])
      ).rejects.toThrow(/whole number of days/)
      await expect(
        applyCohortPatch(store, [
          { op: 'set_time_relation', card: RX, relativeTo: DX, mode: 'between', minDays: 90, maxDays: 30 },
        ])
      ).rejects.toThrow(/must not be greater than/)
    })

    it('refuses to time against an OR group, or against Basic Data / an exclusion card', async () => {
      const OTHER_DX = 'patient.interactions.conditionoccurrence.2'
      const { store } = makeStore({ existingGroups: [['patient'], [DX, OTHER_DX], [RX]] })

      // The target is OR-ed with another card: there is no single interaction to
      // measure the days from.
      await expect(
        applyCohortPatch(store, [{ op: 'set_time_relation', card: RX, relativeTo: DX, days: 90 }])
      ).rejects.toThrow(/cannot time against an OR group/)

      // Both cards in the same group: the cohort only requires that ONE matched.
      await expect(
        applyCohortPatch(store, [{ op: 'set_time_relation', card: OTHER_DX, relativeTo: DX, days: 90 }])
      ).rejects.toThrow(/OR-ed together in the same group/)

      await expect(
        applyCohortPatch(store, [{ op: 'set_time_relation', card: RX, relativeTo: 'patient', days: 90 }])
      ).rejects.toThrow(/Basic Data card/)

      await expect(
        applyCohortPatch(store, [{ op: 'set_time_relation', card: RX, relativeTo: RX, days: 90 }])
      ).rejects.toThrow(/cannot be timed against itself/)
    })

    it('rejects a relation on an exclusion card, which the builder never renders', async () => {
      const { store } = makeStore({ existingCards: ['patient', DX] })
      await applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: 'patient.interactions.drugexposure', exclude: true, ref: 'no_rx' },
      ])
      const excluded = 'patient.interactions.drugexposure.2'
      await expect(
        applyCohortPatch(store, [{ op: 'set_time_relation', card: excluded, relativeTo: DX, days: 90 }])
      ).rejects.toThrow(/exclusion card/)
    })

    it('replaces the relation to the same target and keeps relations to others', async () => {
      const DEATH = 'patient.interactions.death.1'
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX, DEATH] })
      await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, days: 90 },
        { op: 'set_time_relation', card: RX, relativeTo: DEATH, days: 30, direction: 'before' },
        // Same pair again — a correction, not a second relation.
        { op: 'set_time_relation', card: RX, relativeTo: DX, days: 180 },
      ])

      const filters = timeFiltersOn(cards, RX)
      expect(filters).toHaveLength(2)
      expect(filters.find((f: any) => f.targetInteraction === DX).days).toBe('[0-180]')
      expect(filters.find((f: any) => f.targetInteraction === DEATH).days).toBe('[0-30]')
    })

    it('clears one relation or all of them', async () => {
      const DEATH = 'patient.interactions.death.1'
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX, DEATH] })
      await applyCohortPatch(store, [
        { op: 'set_time_relation', card: RX, relativeTo: DX, days: 90 },
        { op: 'set_time_relation', card: RX, relativeTo: DEATH, days: 30 },
      ])

      await applyCohortPatch(store, [{ op: 'clear_time_relation', card: RX, relativeTo: DX }])
      expect(timeFiltersOn(cards, RX).map((f: any) => f.targetInteraction)).toEqual([DEATH])

      const result = await applyCohortPatch(store, [{ op: 'clear_time_relation', card: RX }])
      expect(timeFiltersOn(cards, RX)).toEqual([])
      expect(result.timeRelations).toEqual([])
    })

    it('restores the previous relation when a later op fails', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient', DX, RX] })
      await applyCohortPatch(store, [{ op: 'set_time_relation', card: RX, relativeTo: DX, days: 90 }])

      await expect(
        applyCohortPatch(store, [
          { op: 'set_time_relation', card: RX, relativeTo: DX, days: 7 },
          { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
        ])
      ).rejects.toThrow(/Unknown card/)

      // The 90-day window the user already had is back — not the 7-day one the
      // failed patch tried to set, and not an empty relation.
      expect(timeFiltersOn(cards, RX)).toEqual([
        { originSelection: 'startdate', targetSelection: 'after_startdate', targetInteraction: DX, days: '[0-90]' },
      ])
    })

    it('can time a card created earlier in the same patch, by ref', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient'] })
      const result = await applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: 'patient.interactions.conditionoccurrence', ref: 'dx' },
        { op: 'add_card', cardConfigPath: 'patient.interactions.drugexposure', ref: 'rx' },
        { op: 'set_time_relation', card: 'rx', relativeTo: 'dx', mode: 'within', days: 90 },
      ])

      expect(timeFiltersOn(cards, 'patient.interactions.drugexposure.2')[0]).toMatchObject({
        targetInteraction: 'patient.interactions.conditionoccurrence.1',
        days: '[0-90]',
      })
      expect(result.timeRelations).toHaveLength(1)
    })
  })

  // The observation window behind CohortEntryExit.vue's two buttons. Distinct from
  // the temporal relations above: those constrain the gap BETWEEN interactions,
  // these re-anchor the window everything is measured over.
  describe('cohort entry / exit', () => {
    const DX = 'patient.interactions.conditionoccurrence.1'
    const RX = 'patient.interactions.drugexposure.1'
    const supported = (over: Record<string, unknown> = {}) =>
      makeStore({ existingCards: ['patient', DX, RX], cohortEntryExit: true, ...over })

    it('flags the entry card and reports the window that landed', async () => {
      const { store, cards } = supported()
      const result = await applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])

      expect(cards[DX].props.isEntry).toBe(true)
      expect(cards[DX].props.isExit).toBe(false)
      expect(result.cohortEntryExit).toEqual({
        supported: true,
        entry: { filterCardId: DX, name: DX },
        exit: null,
      })
    })

    it('dispatches the reset-then-flag pair the Entry/Exit menu uses', async () => {
      const { store } = supported()
      await applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'exit' }])

      expect(store.dispatch).toHaveBeenCalledWith('resetAllFilterCardEntryExit', { key: 'isExit' })
      expect(store.dispatch).toHaveBeenCalledWith('updateCohortEntryExit', {
        filterCardId: DX,
        key: 'isExit',
        toggle: true,
      })
    })

    it('sets both ends of the window in one patch', async () => {
      const { store, cards } = supported()
      const result = await applyCohortPatch(store, [
        { op: 'set_entry_exit', card: DX, role: 'entry' },
        { op: 'set_entry_exit', card: RX, role: 'exit' },
      ])

      expect(cards[DX].props.isEntry).toBe(true)
      expect(cards[RX].props.isExit).toBe(true)
      expect(result.cohortEntryExit).toMatchObject({
        entry: { filterCardId: DX },
        exit: { filterCardId: RX },
      })
    })

    // Each role is single-valued: the failure this prevents is two cards claiming
    // "entry", which the query resolves by whichever it happens to walk last.
    it('moving a role to another card takes it off the first', async () => {
      const { store, cards } = supported()
      await applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])
      const result = await applyCohortPatch(store, [{ op: 'set_entry_exit', card: RX, role: 'entry' }])

      expect(cards[DX].props.isEntry).toBe(false)
      expect(cards[RX].props.isEntry).toBe(true)
      expect(result.cohortEntryExit).toMatchObject({ entry: { filterCardId: RX } })
    })

    it('can anchor the window to a card created earlier in the same patch, by ref', async () => {
      const { store, cards } = makeStore({ existingCards: ['patient'], cohortEntryExit: true })
      await applyCohortPatch(store, [
        { op: 'add_card', cardConfigPath: 'patient.interactions.conditionoccurrence', ref: 'dx' },
        { op: 'set_entry_exit', card: 'dx', role: 'entry' },
      ])

      expect(cards['patient.interactions.conditionoccurrence.1'].props.isEntry).toBe(true)
    })

    describe('dataset support', () => {
      // The common case, not an edge case: every seeded D2E config ships the flag
      // off, and a flag written with it off is ignored by query-gen-svc — so the
      // cohort would report a window it is not actually measured over.
      it('refuses to write a flag the query would ignore, naming the config gate', async () => {
        const { store, cards } = makeStore({ existingCards: ['patient', DX], cohortEntryExit: false })
        await expect(applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])).rejects.toThrow(
          /does not support cohort entry\/exit.*panelOptions\.cohortEntryExit off/s
        )
        expect(cards[DX].props.isEntry).toBe(false)
      })

      it('fails closed when the frontend config is not loaded yet', async () => {
        const { store } = makeStore({ existingCards: ['patient', DX] })
        await expect(applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])).rejects.toThrow(
          /not loaded yet/
        )
      })

      it('points at set_time_relation, which does work on such a dataset', async () => {
        const { store } = makeStore({ existingCards: ['patient', DX], cohortEntryExit: false })
        await expect(applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])).rejects.toThrow(
          /set_time_relation/
        )
      })

      it('reads the gate through getPanelOptions when the config exposes it', async () => {
        const { store, cards } = makeStore({ existingCards: ['patient', DX] })
        store.getters.getMriFrontendConfig = { getPanelOptions: (key: string) => key === 'cohortEntryExit' }
        await applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])

        expect(cards[DX].props.isEntry).toBe(true)
      })

      // getPanelOptions indexes panelOptions unguarded, so a half-loaded config
      // throws rather than returning undefined.
      it('falls back to the raw panelOptions read when getPanelOptions throws', async () => {
        const { store, cards } = makeStore({ existingCards: ['patient', DX], cohortEntryExit: true })
        store.getters.getMriFrontendConfig.getPanelOptions = () => {
          throw new TypeError('panelOptions is undefined')
        }
        await applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])

        expect(cards[DX].props.isEntry).toBe(true)
      })

      it('omits cohortEntryExit from the result when the dataset has none and nothing is set', async () => {
        const { store } = makeStore({ existingCards: ['patient', DX], cohortEntryExit: false })
        const result = await applyCohortPatch(store, [
          { op: 'add_constraint', card: 'patient', attributePath: 'patient.attributes.age', value: '>=65' },
        ])

        expect(result.cohortEntryExit).toBeUndefined()
        expect(result.applied).toBe(true)
      })
    })

    // Each rejection mirrors a card the builder's own Entry/Exit menu omits or
    // greys out — a flag on any of them lands in the store, is dropped by
    // BMGetChartableCards, and never reaches the query.
    describe('cards the builder would not offer', () => {
      it('rejects the Basic Data card — it has no interaction dates', async () => {
        const { store } = supported()
        await expect(
          applyCohortPatch(store, [{ op: 'set_entry_exit', card: 'patient', role: 'entry' }])
        ).rejects.toThrow(/Basic Data card cannot be the entry or exit event/)
      })

      it('rejects an exclusion card', async () => {
        const { store, cards } = supported()
        cards[RX].props.excludeFilter = true
        await expect(applyCohortPatch(store, [{ op: 'set_entry_exit', card: RX, role: 'exit' }])).rejects.toThrow(
          /exclusion card/
        )
      })

      it('rejects an inactive card', async () => {
        const { store, cards } = supported()
        cards[RX].props.inactive = true
        await expect(applyCohortPatch(store, [{ op: 'set_entry_exit', card: RX, role: 'exit' }])).rejects.toThrow(
          /inactive/
        )
      })

      it('rejects a card that is OR-ed with another, and says how to split it', async () => {
        const { store } = makeStore({ existingGroups: [['patient'], [DX, RX]], cohortEntryExit: true })
        await expect(applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])).rejects.toThrow(
          /OR-ed with .*set_card_join/s
        )
      })

      it('rejects a card that already holds the other role', async () => {
        const { store } = supported()
        await applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])
        await expect(applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'exit' }])).rejects.toThrow(
          /already the cohort entry event/
        )
      })

      it('rejects a role that is neither entry nor exit', async () => {
        const { store } = supported()
        await expect(
          applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'start' } as any])
        ).rejects.toThrow(/role must be "entry".*or "exit"/)
      })
    })

    describe('clear_entry_exit', () => {
      it('clears one role and leaves the other', async () => {
        const { store, cards } = supported()
        await applyCohortPatch(store, [
          { op: 'set_entry_exit', card: DX, role: 'entry' },
          { op: 'set_entry_exit', card: RX, role: 'exit' },
        ])
        const result = await applyCohortPatch(store, [{ op: 'clear_entry_exit', role: 'entry' }])

        expect(cards[DX].props.isEntry).toBe(false)
        expect(cards[RX].props.isExit).toBe(true)
        expect(result.cohortEntryExit).toMatchObject({ entry: null, exit: { filterCardId: RX } })
      })

      it('clears both roles when no role is given', async () => {
        const { store, cards } = supported()
        await applyCohortPatch(store, [
          { op: 'set_entry_exit', card: DX, role: 'entry' },
          { op: 'set_entry_exit', card: RX, role: 'exit' },
        ])
        const result = await applyCohortPatch(store, [{ op: 'clear_entry_exit' }])

        expect(cards[DX].props.isEntry).toBe(false)
        expect(cards[RX].props.isExit).toBe(false)
        expect(store.dispatch).toHaveBeenCalledWith('resetAllFilterCardEntryExit', { key: null })
        expect(result.cohortEntryExit).toMatchObject({ entry: null, exit: null })
      })

      // A bookmark saved while the dataset had the feature on still carries the
      // flags after it is turned off; clearing can only ever remove a window, so
      // unlike set_entry_exit it is not gated on support.
      it('clears leftover flags even on a dataset that no longer supports the feature', async () => {
        const { store, cards } = makeStore({ existingCards: ['patient', DX], cohortEntryExit: false })
        cards[DX].props.isEntry = true

        const result = await applyCohortPatch(store, [{ op: 'clear_entry_exit' }])

        expect(cards[DX].props.isEntry).toBe(false)
        // Reported so the caller can see the flag is gone AND that the dataset
        // could not have honoured it anyway.
        expect(result.cohortEntryExit).toEqual({ supported: false, entry: null, exit: null })
      })

      it('is a no-op when the role is already clear', async () => {
        const { store } = supported()
        await applyCohortPatch(store, [{ op: 'clear_entry_exit', role: 'entry' }])

        expect(store.dispatch).not.toHaveBeenCalledWith('resetAllFilterCardEntryExit', expect.anything())
      })
    })

    describe('rollback', () => {
      it('puts the previous entry card back when a later op fails', async () => {
        const { store, cards } = supported()
        await applyCohortPatch(store, [{ op: 'set_entry_exit', card: DX, role: 'entry' }])

        await expect(
          applyCohortPatch(store, [
            { op: 'set_entry_exit', card: RX, role: 'entry' },
            { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
          ])
        ).rejects.toThrow(/Unknown card/)

        // Not merely "RX is no longer the entry": the window the user had is back.
        expect(cards[DX].props.isEntry).toBe(true)
        expect(cards[RX].props.isEntry).toBe(false)
      })

      it('leaves the window empty rather than pointing at a card the failed patch created', async () => {
        const { store, cards } = makeStore({ existingCards: ['patient'], cohortEntryExit: true })

        await expect(
          applyCohortPatch(store, [
            { op: 'add_card', cardConfigPath: 'patient.interactions.conditionoccurrence', ref: 'dx' },
            { op: 'set_entry_exit', card: 'dx', role: 'entry' },
            { op: 'add_constraint', card: 'ghost', attributePath: 'patient.attributes.age', value: 1 },
          ])
        ).rejects.toThrow(/Unknown card/)

        expect(cards['patient.interactions.conditionoccurrence.1']).toBeUndefined()
        expect(Object.values(cards).some((c: any) => c.props.isEntry || c.props.isExit)).toBe(false)
      })
    })
  })
})
