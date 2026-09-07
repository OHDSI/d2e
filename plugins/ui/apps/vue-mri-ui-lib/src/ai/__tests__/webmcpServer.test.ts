import { vi } from 'vitest'
import { createPaTools, registerPaTools, PaTool } from '../webmcpServer'

// A minimal Vuex-store stand-in. Only the surface the handlers touch is mocked:
// a few getters and dispatch. This is verification "layer B" — handler ↔ Vuex
// correctness — with no browser / modelContext in play.
//
// `bookmarks` seeds getters.getBookmarks (saved-cohort records shaped like the
// real store: { bmkId, bookmarkname, ... }). `loadAllResult`, when set, is what
// getBookmarks becomes after a `fireBookmarkQuery({cmd:'loadAll'})` dispatch —
// so we can exercise the "list not loaded yet" branch realistically.
const makeStore = ({ bookmarks = [], loadAllResult }: { bookmarks?: any[]; loadAllResult?: any[] } = {}) => {
  const store: any = {
    getters: {
      getBookmarksData: { name: 'Elderly Diabetics', cards: ['c1'] },
      getBookmarkFromIFR: { filter: { age: { min: 65 } } },
      getBookmarks: bookmarks,
      getActiveBookmark: null,
    },
    dispatch: vi.fn(),
    commit: vi.fn(),
  }
  store.dispatch.mockImplementation((type: string, payload: any) => {
    if (type === 'fireBookmarkQuery' && payload?.params?.cmd === 'loadAll' && loadAllResult) {
      store.getters.getBookmarks = loadAllResult
    }
    return Promise.resolve(undefined)
  })
  return store
}

const byName = (tools: PaTool[], name: string): PaTool => {
  const tool = tools.find(t => t.name === name)
  if (!tool) throw new Error(`tool ${name} not registered`)
  return tool
}

// Every handler returns { content: [{ type: 'text', text: <json> }] }.
const parse = (res: { content: Array<{ text: string }> }) => JSON.parse(res.content[0].text)

describe('createPaTools', () => {
  it('declares a required arg only where a tool genuinely has one', () => {
    const tools = createPaTools(makeStore())

    // pa_save_current_cohort has no unconditionally-required input: it builds the
    // payload from live store state given { name } (insert) or { bookmarkId } (update),
    // and still accepts a raw `params` escape hatch — the handler validates the combo.
    expect((byName(tools, 'pa_save_current_cohort').inputSchema as any).required).toBeUndefined()
    // pa_search_attribute_values requires only the attribute: omitting `query`
    // lists the column's complete value domain, which is the reliable route for a
    // low-cardinality attribute (gender/race) where a word search can false-negative.
    expect((byName(tools, 'pa_search_attribute_values').inputSchema as any).required).toEqual(['attributePath'])
  })

  describe('pa_get_current_cohort', () => {
    it('serializes the live bookmark getters — the value only the running store has', async () => {
      const store = makeStore()
      const res = await byName(createPaTools(store), 'pa_get_current_cohort').execute()

      expect(parse(res)).toMatchObject({
        bookmarkData: store.getters.getBookmarksData,
        ifr: store.getters.getBookmarkFromIFR,
        // The AND/OR grouping: cards within a group are OR-ed, groups AND-ed.
        // Empty here because this store has no bool-container tree.
        cardGroups: [],
      })
      expect(store.dispatch).not.toHaveBeenCalled()
    })
  })

  describe('pa_list_cohorts', () => {
    it('returns the saved cohorts as { bmkId, name } without refetching when already loaded', async () => {
      const store = makeStore({
        bookmarks: [
          { bmkId: 'b1', bookmarkname: 'Elderly Diabetics', bookmark: '{}' },
          { bmkId: 'b2', bookmarkname: 'Young Smokers', bookmark: '{}' },
        ],
      })
      const res = await byName(createPaTools(store), 'pa_list_cohorts').execute()

      expect(parse(res)).toEqual({
        cohorts: [
          { bmkId: 'b1', name: 'Elderly Diabetics' },
          { bmkId: 'b2', name: 'Young Smokers' },
        ],
      })
      expect(store.dispatch).not.toHaveBeenCalledWith('fireBookmarkQuery', expect.anything())
    })

    it('fetches the list via fireBookmarkQuery(loadAll) when the store is empty', async () => {
      const store = makeStore({
        bookmarks: [],
        loadAllResult: [{ bmkId: 'b9', bookmarkname: 'Loaded Later', bookmark: '{}' }],
      })
      const res = await byName(createPaTools(store), 'pa_list_cohorts').execute()

      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })
      expect(parse(res)).toEqual({ cohorts: [{ bmkId: 'b9', name: 'Loaded Later' }] })
    })

    it('forceRefresh reloads via loadAll even when the list is already populated (fixes staleness)', async () => {
      const store = makeStore({
        bookmarks: [{ bmkId: 'b1', bookmarkname: 'Old', bookmark: '{}' }],
        loadAllResult: [
          { bmkId: 'b1', bookmarkname: 'Old', bookmark: '{}' },
          { bmkId: 'b2', bookmarkname: 'Just Saved', bookmark: '{}' },
        ],
      })
      const res = await byName(createPaTools(store), 'pa_list_cohorts').execute({ forceRefresh: true })

      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })
      expect(parse(res)).toEqual({
        cohorts: [
          { bmkId: 'b1', name: 'Old' },
          { bmkId: 'b2', name: 'Just Saved' },
        ],
      })
    })
  })

  describe('pa_open_cohort', () => {
    const cohorts = [
      { bmkId: 'b1', bookmarkname: 'Elderly Diabetics', bookmark: '{}' },
      { bmkId: 'b2', bookmarkname: 'Young Smokers', bookmark: '{}' },
      { bmkId: 'b3', bookmarkname: 'Dupe', bookmark: '{}' },
      { bmkId: 'b4', bookmarkname: 'Dupe', bookmark: '{}' },
    ]

    it('resolves a unique name to its bmkId and loads it into the builder', async () => {
      const store = makeStore({ bookmarks: cohorts })
      const res = await byName(createPaTools(store), 'pa_open_cohort').execute({ name: 'Young Smokers' })

      expect(store.dispatch).toHaveBeenCalledWith('loadbookmarkToState', { bmkId: 'b2', chartType: undefined })
      expect(parse(res)).toEqual({ opened: true, bmkId: 'b2' })
    })

    it('opens by explicit bmkId (with chartType) when provided', async () => {
      const store = makeStore({ bookmarks: cohorts })
      const res = await byName(createPaTools(store), 'pa_open_cohort').execute({ bmkId: 'b1', chartType: 'bar' })

      expect(store.dispatch).toHaveBeenCalledWith('loadbookmarkToState', { bmkId: 'b1', chartType: 'bar' })
      expect(parse(res)).toEqual({ opened: true, bmkId: 'b1' })
    })

    it('returns an error and does not load when the name is unknown', async () => {
      const store = makeStore({ bookmarks: cohorts })
      const res = await byName(createPaTools(store), 'pa_open_cohort').execute({ name: 'Nonexistent' })

      expect(parse(res)).toEqual({ opened: false, error: 'No cohort named "Nonexistent".' })
      expect(store.dispatch).not.toHaveBeenCalledWith('loadbookmarkToState', expect.anything())
    })

    it('returns the candidates (and does not load) when a name is ambiguous', async () => {
      const store = makeStore({ bookmarks: cohorts })
      const res = await byName(createPaTools(store), 'pa_open_cohort').execute({ name: 'Dupe' })

      expect(parse(res)).toEqual({
        opened: false,
        ambiguous: [
          { bmkId: 'b3', name: 'Dupe' },
          { bmkId: 'b4', name: 'Dupe' },
        ],
      })
      expect(store.dispatch).not.toHaveBeenCalledWith('loadbookmarkToState', expect.anything())
    })

    it('errors when a bmkId does not exist', async () => {
      const store = makeStore({ bookmarks: cohorts })
      const res = await byName(createPaTools(store), 'pa_open_cohort').execute({ bmkId: 'nope' })

      expect(parse(res)).toEqual({ opened: false, error: 'No cohort with bmkId "nope".' })
      expect(store.dispatch).not.toHaveBeenCalledWith('loadbookmarkToState', expect.anything())
    })

    it('errors when neither name nor bmkId is given', async () => {
      const store = makeStore({ bookmarks: cohorts })
      const res = await byName(createPaTools(store), 'pa_open_cohort').execute({})

      expect(parse(res)).toEqual({ opened: false, error: 'Provide a cohort name or bmkId.' })
      expect(store.dispatch).not.toHaveBeenCalled()
    })
  })

  describe('pa_apply_cohort_patch', () => {
    it('dispatches loadBookmarkDataToState with the bookmark + chartType', async () => {
      const store = makeStore()
      const bookmark = { filter: { some: 'filter' } }
      const res = await byName(createPaTools(store), 'pa_apply_cohort_patch').execute({ bookmark, chartType: 'bar' })

      expect(store.dispatch).toHaveBeenCalledWith('loadBookmarkDataToState', { bookmark, chartType: 'bar' })
      expect(parse(res)).toEqual({ applied: true })
    })

    it('routes patchOps through the deterministic applier (no legacy bookmark dispatch)', async () => {
      const store = makeStore()
      // Minimal store surface applyCohortPatch touches for a single add_card.
      store.getters.getFilterCards = () => ({ fc1: {} })
      store.dispatch.mockImplementation((type: string) => {
        if (type === 'addFilterCard') return Promise.resolve('fc1')
        return Promise.resolve(undefined)
      })

      const patchOps = [{ op: 'add_card', cardConfigPath: 'patient.interactions.priDiag' }]
      const res = await byName(createPaTools(store), 'pa_apply_cohort_patch').execute({ patchOps })

      expect(store.dispatch).toHaveBeenCalledWith('addFilterCard', {
        configPath: 'patient.interactions.priDiag',
        isExclusion: false,
      })
      expect(store.dispatch).not.toHaveBeenCalledWith('loadBookmarkDataToState', expect.anything())
      expect(parse(res)).toEqual({
        applied: true,
        createdCards: ['fc1'],
        appliedConstraints: [],
        // No bool-container tree on this minimal store, so nothing to group.
        cardGroups: [],
        // Reported on every patch: an empty list is the caller's signal that the
        // cohort carries no timing at all.
        timeRelations: [],
      })
    })

    it('returns applied:false with an error when neither patchOps nor bookmark is given', async () => {
      const store = makeStore()
      const res = await byName(createPaTools(store), 'pa_apply_cohort_patch').execute({})

      expect(parse(res)).toEqual({ applied: false, error: 'Provide patchOps (preferred) or a bookmark object.' })
      expect(store.dispatch).not.toHaveBeenCalled()
    })

    it('attaches the valid filter catalog when a patch fails, so a bad path is self-correcting', async () => {
      const store = makeStore()
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [
          { getConfigPath: () => 'patient', getName: () => 'Basic Data', getFilterAttributes: () => [] },
        ],
      }
      // Force the applier to throw (addFilterCard rejects).
      store.dispatch.mockImplementation((type: string) =>
        type === 'addFilterCard' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
      )

      const res = await byName(createPaTools(store), 'pa_apply_cohort_patch').execute({
        patchOps: [{ op: 'add_card', cardConfigPath: 'patient' }],
      })

      const parsed = parse(res)
      expect(parsed.applied).toBe(false)
      expect(parsed.validFilterOptions).toEqual([{ cardConfigPath: 'patient', cardName: 'Basic Data', attributes: [] }])
    })

    it('scopes the failure catalog to the cards the patch named, listing the rest by path only', async () => {
      const store = makeStore()
      const card = (path: string, name: string) => ({
        getConfigPath: () => path,
        getName: () => name,
        getFilterAttributes: () => [
          { getConfigPath: () => `${path}.attributes.a`, getName: () => 'A', getType: () => 'text' },
        ],
      })
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [card('patient', 'Basic Data'), card('patient.interactions.priDiag', 'Diagnoses')],
      }
      store.dispatch.mockImplementation((type: string) =>
        type === 'addFilterCardConstraint' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
      )
      store.getters.getFilterCards = () => ({ fc1: {} })

      const res = await byName(createPaTools(store), 'pa_apply_cohort_patch').execute({
        patchOps: [
          { op: 'add_constraint', card: 'fc1', attributePath: 'patient.interactions.priDiag.attributes.a', value: 'x' },
        ],
      })

      const parsed = parse(res)
      expect(parsed.applied).toBe(false)
      // The named card keeps its attributes (that's what fixes a bad attributePath);
      // every other card is path + name + a count, so the whole catalog is not
      // duplicated into the transcript on every failed patch.
      expect(parsed.validFilterOptions).toEqual([
        { cardConfigPath: 'patient', cardName: 'Basic Data', attributeCount: 1 },
        {
          cardConfigPath: 'patient.interactions.priDiag',
          cardName: 'Diagnoses',
          attributes: [
            { attributePath: 'patient.interactions.priDiag.attributes.a', name: 'A', type: 'text', valueKind: 'text' },
          ],
        },
      ])
    })

    it('rejects a malformed bookmark, restores the active cohort, and steers to patchOps', async () => {
      const store = makeStore()
      const prevActive = { bmkId: 'test-1', bookmarkname: 'test', isNew: false }
      store.getters.getActiveBookmark = prevActive
      // loadBookmarkDataToState clobbers the active bookmark, then rejects on the bad tree.
      store.dispatch.mockImplementation((type: string) => {
        if (type === 'loadBookmarkDataToState') {
          const e: any = new Error('')
          e.name = 'InvalidArgumentException'
          return Promise.reject(e)
        }
        return Promise.resolve(undefined)
      })

      const res = await byName(createPaTools(store), 'pa_apply_cohort_patch').execute({
        // filter card missing `attributes` — the shape that threw in the wild
        bookmark: { filter: { cards: { type: 'FilterCard' } } },
      })

      const parsed = parse(res)
      expect(parsed.applied).toBe(false)
      expect(parsed.error).toContain('patchOps')
      // the failed load left a broken active bookmark; the tool restores the prior one
      expect(store.commit).toHaveBeenCalledWith('SET_ACTIVE_BOOKMARK', prevActive)
    })
  })

  describe('pa_list_filter_options', () => {
    it('maps the frontend config filter cards + attributes to a flat catalog', async () => {
      const store = makeStore()
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [
          {
            getConfigPath: () => 'patient',
            getName: () => 'Basic Data',
            getFilterAttributes: () => [
              { getConfigPath: () => 'patient.attributes.age', getName: () => 'Age', getType: () => 'num' },
            ],
          },
        ],
      }

      const res = await byName(createPaTools(store), 'pa_list_filter_options').execute()

      const parsed = parse(res)
      expect(parsed.filterCards).toEqual([
        {
          cardConfigPath: 'patient',
          cardName: 'Basic Data',
          attributes: [
            {
              attributePath: 'patient.attributes.age',
              name: 'Age',
              type: 'num',
              valueKind: 'numeric',
            },
          ],
        },
      ])
      // How-to prose is hoisted into a single guide keyed by valueKind rather than
      // repeated per attribute — the catalog is resent in the agent transcript on
      // every turn, and inlining it doubled the payload.
      expect(parsed.valueKindGuide.numeric).toContain('operator')
      // the routing note steers value shape on non-OMOP configs
      expect(parsed.note).toContain('valueKind')
    })

    it('lists only filter-card attributes, not measure/category-only ones', async () => {
      const store = makeStore()
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [
          {
            getConfigPath: () => 'patient',
            getName: () => 'Basic Data',
            // getAllAttributes() would also include pcount, which add_constraint
            // cannot target — a path the model would only ever fail on.
            getFilterAttributes: () => [
              { getConfigPath: () => 'patient.attributes.age', getName: () => 'Age', getType: () => 'num' },
            ],
            getAllAttributes: () => [
              { getConfigPath: () => 'patient.attributes.age', getName: () => 'Age', getType: () => 'num' },
              {
                getConfigPath: () => 'patient.attributes.pcount',
                getName: () => 'Patient Count',
                getType: () => 'num',
              },
            ],
          },
        ],
      }

      const attrs = parse(await byName(createPaTools(store), 'pa_list_filter_options').execute()).filterCards[0]
        .attributes
      expect(attrs.map((a: any) => a.attributePath)).toEqual(['patient.attributes.age'])
    })

    it('classifies a coded catalog attribute (useRefValue) as valueKind "catalog"', async () => {
      const store = makeStore()
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [
          {
            getConfigPath: () => 'patient.interactions.conditionoccurrence',
            getName: () => 'Conditions',
            getFilterAttributes: () => [
              {
                getConfigPath: () => 'patient.interactions.conditionoccurrence.attributes.condsourcecode',
                getName: () => 'Condition Source concept code',
                getType: () => 'text',
                isCatalogAttribute: () => true,
              },
              {
                getConfigPath: () => 'patient.interactions.conditionoccurrence.attributes.condsourceconceptset',
                getName: () => 'Condition Source concept set',
                getType: () => 'conceptSet',
                isCatalogAttribute: () => false,
              },
            ],
          },
        ],
      }

      const parsed = parse(await byName(createPaTools(store), 'pa_list_filter_options').execute())
      const attrs = parsed.filterCards[0].attributes
      expect(attrs[0].valueKind).toBe('catalog')
      expect(attrs[1].valueKind).toBe('conceptSet')
      expect(parsed.valueKindGuide.catalog).toContain('pa_search_attribute_values')
      expect(parsed.valueKindGuide.conceptSet).toContain('conceptSetId')
    })

    it('classifies a useRefText coded column as "catalog" and a time attribute as "date"', async () => {
      const store = makeStore()
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [
          {
            getConfigPath: () => 'patient.interactions.priDiag',
            getName: () => 'Diagnoses',
            getFilterAttributes: () => [
              {
                // No isCatalogAttribute(): an older config marks a coded column by
                // displaying its ref text, and that one needs /values just the same.
                getConfigPath: () => 'patient.interactions.priDiag.attributes.icd10',
                getName: () => 'ICD-10',
                getType: () => 'text',
                oInternalConfigAttribute: { useRefText: true },
              },
              {
                getConfigPath: () => 'patient.interactions.priDiag.attributes.startdate',
                getName: () => 'Start date',
                getType: () => 'time',
              },
            ],
          },
        ],
      }

      const parsed = parse(await byName(createPaTools(store), 'pa_list_filter_options').execute())
      expect(parsed.filterCards[0].attributes.map((a: any) => a.valueKind)).toEqual(['catalog', 'date'])
      expect(parsed.valueKindGuide.date).toContain('from, to')
    })

    it('reports the OMOP domain a concept-set attribute takes, and omits it when unset', async () => {
      // Without conceptDomain the model reuses whatever concept-set id it is
      // already holding: an Alzheimer's (Condition) set on a Visit card builds a
      // cohort that computes and answers the wrong question.
      const store = makeStore()
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [
          {
            getConfigPath: () => 'patient.interactions.visit',
            getName: () => 'Visit',
            getFilterAttributes: () => [
              {
                getConfigPath: () => 'patient.interactions.visit.attributes.visitconceptset',
                getName: () => 'Encounter Concept set',
                getType: () => 'conceptSet',
                getDomainFilter: () => 'Visit',
              },
              {
                getConfigPath: () => 'patient.interactions.visit.attributes.startdate',
                getName: () => 'Start date',
                getType: () => 'time',
                getDomainFilter: () => '',
              },
            ],
          },
        ],
      }

      const attrs = parse(await byName(createPaTools(store), 'pa_list_filter_options').execute()).filterCards[0]
        .attributes
      expect(attrs[0]).toMatchObject({ valueKind: 'conceptSet', conceptDomain: 'Visit' })
      expect(attrs[1]).not.toHaveProperty('conceptDomain')
      expect(
        parse(await byName(createPaTools(store), 'pa_list_filter_options').execute()).valueKindGuide.conceptSet
      ).toContain('conceptDomain')
    })

    it('returns just one card when `card` is given, and the valid paths when it is unknown', async () => {
      const store = makeStore()
      const card = (path: string, name: string) => ({
        getConfigPath: () => path,
        getName: () => name,
        getFilterAttributes: () => [
          { getConfigPath: () => `${path}.attributes.a`, getName: () => 'A', getType: () => 'text' },
        ],
      })
      store.getters.getMriFrontendConfig = {
        getFilterCards: () => [card('patient', 'Basic Data'), card('patient.interactions.priDiag', 'Diagnoses')],
      }
      const tool = byName(createPaTools(store), 'pa_list_filter_options')

      const scoped = parse(await tool.execute({ card: 'patient.interactions.priDiag' }))
      expect(scoped.filterCards).toHaveLength(1)
      expect(scoped.filterCards[0].cardConfigPath).toBe('patient.interactions.priDiag')

      const unknown = parse(await tool.execute({ card: 'patient.interactions.nope' }))
      expect(unknown.filterCards).toEqual([])
      expect(unknown.error).toContain('patient.interactions.nope')
      expect(unknown.validCardConfigPaths).toEqual(['patient', 'patient.interactions.priDiag'])
    })

    it('degrades gracefully when the frontend config is not loaded', async () => {
      const store = makeStore()
      store.getters.getMriFrontendConfig = undefined
      const res = await byName(createPaTools(store), 'pa_list_filter_options').execute()
      expect(parse(res)).toEqual({ filterCards: [], error: 'Frontend config not loaded.' })
    })
  })

  describe('pa_save_current_cohort', () => {
    // The raw `params` back-compat hatch: forwarded verbatim, method defaults to
    // post, and the saved id comes from the response or falls back to the argument.
    it('forwards raw params verbatim and resolves the bookmarkId from result or argument', async () => {
      const store = makeStore()
      store.dispatch.mockResolvedValue({ bmkId: 'srv-generated-42' })
      const params = { name: 'x' }
      const tool = byName(createPaTools(store), 'pa_save_current_cohort')

      expect(parse(await tool.execute({ params }))).toEqual({ saved: true, bookmarkId: 'srv-generated-42' })
      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', {
        method: 'post',
        params,
        bookmarkId: undefined,
      })
      // Every write refreshes the list, or pa_list_cohorts serves a stale one.
      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })

      // put/update: the endpoint returns no bmkId, so the passed one stands in.
      store.dispatch.mockResolvedValue(undefined)
      const res = await tool.execute({ params, bookmarkId: 'existing-7', method: 'put' })

      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', {
        method: 'put',
        params,
        bookmarkId: 'existing-7',
      })
      expect(parse(res)).toEqual({ saved: true, bookmarkId: 'existing-7' })
    })

    it('builds an insert payload from live state, refreshes the list, and adopts the saved bookmark', async () => {
      const savedRecord = { bmkId: 'new-1', bookmarkname: 'Female Sinusitis', bookmark: '{}' }
      const store = makeStore()
      store.getters.getActiveBookmark = { bookmarkname: 'New cohort', isNew: true }
      store.dispatch.mockImplementation((type: string, payload: any) => {
        if (type === 'fireBookmarkQuery' && payload?.params?.cmd === 'insert')
          return Promise.resolve({ bmkId: 'new-1' })
        if (type === 'fireBookmarkQuery' && payload?.params?.cmd === 'loadAll') {
          store.getters.getBookmarks = [savedRecord]
        }
        return Promise.resolve(undefined)
      })

      const res = await byName(createPaTools(store), 'pa_save_current_cohort').execute({ name: 'Female Sinusitis' })

      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', {
        method: 'post',
        params: {
          cmd: 'insert',
          bookmarkname: 'Female Sinusitis',
          bookmark: JSON.stringify(store.getters.getBookmarksData),
          shareBookmark: false,
        },
        bookmarkId: undefined,
      })
      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })
      expect(store.commit).toHaveBeenCalledWith('SET_ACTIVE_BOOKMARK', savedRecord)
      expect(parse(res)).toEqual({ saved: true, bookmarkId: 'new-1' })
    })

    it('builds an update payload (cmd:update) when a bookmarkId is given', async () => {
      const store = makeStore()
      store.dispatch.mockResolvedValue(undefined)
      const res = await byName(createPaTools(store), 'pa_save_current_cohort').execute({
        bookmarkId: 'existing-9',
        share: true,
      })

      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', {
        method: 'put',
        params: { cmd: 'update', bookmark: JSON.stringify(store.getters.getBookmarksData), shareBookmark: true },
        bookmarkId: 'existing-9',
      })
      expect(parse(res)).toEqual({ saved: true, bookmarkId: 'existing-9' })
    })

    it('refuses to save an empty cohort without dispatching', async () => {
      const store = makeStore()
      store.getters.getBookmarksData = {}
      const res = await byName(createPaTools(store), 'pa_save_current_cohort').execute({ name: 'Empty' })

      expect(parse(res)).toEqual({ saved: false, error: 'Current cohort is empty — build filters before saving.' })
      expect(store.dispatch).not.toHaveBeenCalled()
    })

    it('requires a name to insert a brand-new cohort', async () => {
      const store = makeStore()
      store.getters.getActiveBookmark = { bookmarkname: 'New cohort', isNew: true }
      const res = await byName(createPaTools(store), 'pa_save_current_cohort').execute({})

      expect(parse(res)).toEqual({ saved: false, error: 'Provide a name to save a new cohort.' })
    })

    it('refuses an update when there is neither a bookmarkId nor an active saved cohort', async () => {
      const store = makeStore() // getActiveBookmark is null
      const res = await byName(createPaTools(store), 'pa_save_current_cohort').execute({ method: 'put' })

      expect(parse(res)).toEqual({
        saved: false,
        error: 'Update requested but no bookmarkId (and no active saved cohort) to update.',
      })
      expect(store.dispatch).not.toHaveBeenCalled()
    })

    // Current behaviour, pinned: with an already-saved cohort active and no args,
    // this INSERTS a second cohort under the same name rather than updating it —
    // overwriting requires an explicit bookmarkId or method:"put" (as documented
    // on the tool). Worth revisiting if a duplicate row ever shows up in the wild.
    it('falls back to the active cohort name when saving without one', async () => {
      const store = makeStore()
      store.getters.getActiveBookmark = { bmkId: 'b1', bookmarkname: 'Elderly Diabetics', isNew: false }
      store.dispatch.mockResolvedValue(undefined)

      const res = await byName(createPaTools(store), 'pa_save_current_cohort').execute({})

      expect(store.dispatch).toHaveBeenCalledWith('fireBookmarkQuery', {
        method: 'post',
        params: {
          cmd: 'insert',
          bookmarkname: 'Elderly Diabetics',
          bookmark: JSON.stringify(store.getters.getBookmarksData),
          shareBookmark: false,
        },
        bookmarkId: undefined,
      })
      expect(parse(res)).toEqual({ saved: true })
    })
  })

  describe('pa_new_cohort', () => {
    it('resets the active bookmark + chart and switches to the builder view', async () => {
      const store = makeStore()
      const showBuilder = vi.fn()
      const res = await byName(createPaTools(store, { showBuilder }), 'pa_new_cohort').execute({ name: 'My Cohort' })

      expect(store.commit).toHaveBeenCalledWith('SET_ACTIVE_BOOKMARK', { bookmarkname: 'My Cohort', isNew: true })
      expect(store.dispatch).toHaveBeenCalledWith('resetChart')
      expect(showBuilder).toHaveBeenCalledOnce()
      expect(parse(res)).toEqual({ created: true, name: 'My Cohort' })

      // No args and no showBuilder hook: the name defaults and the optional hook
      // is genuinely optional (createPaTools is used without one in tests/bridge).
      const bare = makeStore()
      const bareRes = await byName(createPaTools(bare), 'pa_new_cohort').execute()

      expect(bare.commit).toHaveBeenCalledWith('SET_ACTIVE_BOOKMARK', { bookmarkname: 'New cohort', isNew: true })
      expect(parse(bareRes)).toEqual({ created: true, name: 'New cohort' })
    })

    it('captures the post-reset baseline so an untouched new cohort reports clean', async () => {
      const store = makeStore()
      // resetChart replaces the live cohort definition, so the baseline has to be the
      // RESET state and not the cohort that was open before — which is why
      // Bookmarks.vue addNewCohort() snapshots after `await this.reset()` + $nextTick.
      store.dispatch.mockImplementation((type: string) => {
        if (type === 'resetChart') store.getters.getBookmarksData = { name: 'New cohort', cards: [] }
        return Promise.resolve(undefined)
      })

      await byName(createPaTools(store), 'pa_new_cohort').execute({ name: 'New cohort' })

      expect(store.commit).toHaveBeenCalledWith('SET_ACTIVE_BOOKMARK_BASELINE', { name: 'New cohort', cards: [] })
      // Order matters: SET_ACTIVE_BOOKMARK clears activeBookmarkBaseline, and a new
      // cohort has no saved `.bookmark` JSON to fall back on — so a baseline captured
      // first (or not at all) leaves getCurrentBookmarkHasChanges reporting a
      // zero-edit cohort as dirty, firing the unsaved-changes navigation guard.
      expect(store.commit.mock.calls.map((c: any[]) => c[0])).toEqual([
        'SET_ACTIVE_BOOKMARK',
        'SET_ACTIVE_BOOKMARK_BASELINE',
      ])
    })
  })

  describe('pa_search_attribute_values', () => {
    it('delegates to loadValuesForAttributePath and returns the values with counts', async () => {
      const store = makeStore()
      const values = [{ value: '461', text: 'Acute sinusitis', display_value: 'Acute sinusitis (461)' }]
      store.dispatch.mockImplementation((type: string) =>
        type === 'loadValuesForAttributePath' ? Promise.resolve(values) : Promise.resolve(undefined)
      )
      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: 'patient.interactions.priDiag.attributes.icd10',
        query: 'sinusitis',
      })

      expect(store.dispatch).toHaveBeenCalledWith('loadValuesForAttributePath', {
        attributePathUid: 'patient.interactions.priDiag.attributes.icd10',
        searchQuery: 'sinusitis',
        attributeType: 'text',
      })
      // A small clean result: no truncation, no note, counts reported.
      expect(parse(res)).toEqual({
        attributePath: 'patient.interactions.priDiag.attributes.icd10',
        query: 'sinusitis',
        matchedVia: 'search',
        total: 1,
        returned: 1,
        truncated: false,
        values,
      })
      // The search hit, so the domain is never re-read.
      expect(store.dispatch).toHaveBeenCalledOnce()
    })

    it('caps a large result to `limit`, flags truncation, and returns a routing note', async () => {
      const store = makeStore()
      // 1,602 tokens (the gemfibrozil case) — the flood the cap protects against.
      const values = Array.from({ length: 1602 }, (_, i) => ({ value: String(i), text: `gemfibrozil ${i}` }))
      store.dispatch.mockImplementation((type: string) =>
        type === 'loadValuesForAttributePath' ? Promise.resolve(values) : Promise.resolve(undefined)
      )
      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: 'patient.interactions.drugexposure.attributes.drugconceptcode',
        query: 'gemfibrozil',
        limit: 25,
      })

      const parsed = parse(res)
      expect(parsed.total).toBe(1602)
      expect(parsed.returned).toBe(25)
      expect(parsed.values).toHaveLength(25)
      expect(parsed.truncated).toBe(true)
      expect(parsed.note).toContain('concept set with descendants')
    })

    it('clamps limit to MAX_VALUE_LIMIT (200)', async () => {
      const store = makeStore()
      const values = Array.from({ length: 500 }, (_, i) => ({ value: String(i), text: `t${i}` }))
      store.dispatch.mockImplementation((type: string) =>
        type === 'loadValuesForAttributePath' ? Promise.resolve(values) : Promise.resolve(undefined)
      )
      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: 'p.attr',
        query: 'x',
        limit: 10000,
      })
      expect(parse(res).returned).toBe(200)
    })

    // inputSchema says `limit` is a number, but nothing enforces that at run time:
    // neither registerTool nor paToolBridge.call() validates arguments against the
    // schema, so whatever the model emitted arrives verbatim. A quoted number must
    // still cap, and a non-numeric one must fall back — the old
    // `Math.min(limit ?? DEFAULT, MAX)` made the cap NaN, and `slice(0, NaN)` is [],
    // so the tool reported "returned: 0" for a search that had 500 matches.
    it.each([
      ['a numeric string', '25', 25],
      ['a non-numeric string', 'twenty', 50],
      ['a blank string', '   ', 50],
      ['null', null, 50],
      ['a NaN-y object', {}, 50],
    ])('coerces %s limit rather than capping to zero rows', async (_label, limit, expected) => {
      const store = makeStore()
      const values = Array.from({ length: 500 }, (_, i) => ({ value: String(i), text: `t${i}` }))
      store.dispatch.mockImplementation((type: string) =>
        type === 'loadValuesForAttributePath' ? Promise.resolve(values) : Promise.resolve(undefined)
      )
      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: 'p.attr',
        query: 'x',
        limit,
      })

      const parsed = parse(res)
      expect(parsed.returned).toBe(expected)
      expect(parsed.values).toHaveLength(expected)
      expect(parsed.total).toBe(500)
    })

    it('surfaces loadedStatus TOO_MANY_RESULTS so the model narrows instead of concluding "absent"', async () => {
      const store = makeStore()
      store.dispatch.mockImplementation((type: string) =>
        // 204 → the store records TOO_MANY_RESULTS and returns an empty list.
        type === 'loadValuesForAttributePath' ? Promise.resolve([]) : Promise.resolve(undefined)
      )
      store.getters.getDomainValues = () => ({ loadedStatus: 'TOO_MANY_RESULTS', values: [] })

      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: 'p.attr',
        query: 'aspirin',
      })
      const parsed = parse(res)
      expect(parsed.loadedStatus).toBe('TOO_MANY_RESULTS')
      expect(parsed.total).toBe(0)
      expect(parsed.note).toContain('TOO_MANY_RESULTS')
      expect(parsed.note).toContain('Narrow the query')
    })

    it('errors without dispatching when attributePath is missing', async () => {
      const store = makeStore()
      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: '',
        query: '',
      })

      expect(parse(res)).toEqual({
        values: [],
        error: 'Provide an attributePath (from pa_list_filter_options).',
      })
      expect(store.dispatch).not.toHaveBeenCalled()
    })

    // The "build me a cohort of women…" regression. The /values search runs in the
    // database (case- and token-sensitive), so the English word misses the stored
    // token and the assistant used to report the value as absent and ask the user
    // for a synonym. A miss now costs one extra request and resolves itself.
    describe('a zero-hit search falls back to the attribute domain', () => {
      // Mock /values the way the backend behaves: an exact, case-sensitive token
      // match, and the full list when searchQuery is empty.
      const makeValuesStore = (domain: any[]) => {
        const store = makeStore()
        store.getters.getDomainValues = () => ({ loadedStatus: 'HAS_RESULTS', values: [] })
        store.dispatch.mockImplementation((type: string, payload: any) => {
          if (type !== 'loadValuesForAttributePath') return Promise.resolve(undefined)
          const q = payload.searchQuery
          if (!q) return Promise.resolve(domain)
          return Promise.resolve(domain.filter(v => v.text.includes(q) || v.value.includes(q)))
        })
        return store
      }
      const GENDER = [
        { value: '8532', text: 'Female', display_value: 'Female' },
        { value: '8507', text: 'Male', display_value: 'Male' },
      ]

      it('matches case-insensitively against the full list when the search misses', async () => {
        const store = makeValuesStore(GENDER)
        const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
          attributePath: 'patient.attributes.gender',
          query: 'female',
        })

        const parsed = parse(res)
        expect(parsed.matchedVia).toBe('domain-scan')
        expect(parsed.values).toEqual([GENDER[0]])
        expect(parsed.domainTotal).toBe(2)
        expect(parsed.note).toContain('never proof a value is absent')
        // The stale "loaded with zero values" cache is busted before re-reading,
        // or the store would serve it back instead of fetching the full domain.
        expect(store.commit).toHaveBeenCalledWith('DOMAIN_SET_VALUES', {
          attributePath: 'patient.attributes.gender',
          data: { values: [], isLoaded: false, isLoading: false },
        })
      })

      it('resolves a demographic synonym ("women" → the stored "F") on exact tokens only', async () => {
        const store = makeValuesStore([
          { value: 'F', text: 'F', display_value: 'F' },
          { value: 'M', text: 'M', display_value: 'M' },
          // Would be a false positive if synonyms matched as substrings ("f").
          { value: 'UNK', text: 'Info not available', display_value: 'Info not available' },
        ])
        const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
          attributePath: 'patient.attributes.gender',
          query: 'women',
        })

        const parsed = parse(res)
        expect(parsed.matchedVia).toBe('domain-scan')
        expect(parsed.values).toEqual([{ value: 'F', text: 'F', display_value: 'F' }])
      })

      it('returns the COMPLETE value list when nothing matches, instead of "not found"', async () => {
        const store = makeValuesStore(GENDER)
        const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
          attributePath: 'patient.attributes.gender',
          query: 'nonbinary',
        })

        const parsed = parse(res)
        expect(parsed.matchedVia).toBe('domain')
        expect(parsed.values).toEqual(GENDER)
        expect(parsed.domainTotal).toBe(2)
        expect(parsed.note).toContain('COMPLETE value list')
        expect(parsed.note).toContain('do NOT ask the user to suggest a synonym')
      })

      it('retries rewritten queries when the domain is too large to enumerate', async () => {
        const store = makeStore()
        const hit = [{ value: '461', text: 'Sinusitis' }]
        store.getters.getDomainValues = () => ({ loadedStatus: 'HAS_RESULTS', values: [] })
        store.dispatch.mockImplementation((type: string, payload: any) =>
          type === 'loadValuesForAttributePath'
            ? // Only the title-cased term matches; the unfiltered call returns nothing,
              // as a /values endpoint that refuses to dump a huge catalog does.
              Promise.resolve(payload.searchQuery === 'Sinusitis' ? hit : [])
            : Promise.resolve(undefined)
        )
        const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
          attributePath: 'p.attr',
          query: 'sinusitis',
        })

        const parsed = parse(res)
        expect(parsed.matchedVia).toBe('alternate-query')
        expect(parsed.values).toEqual(hit)
        expect(parsed.note).toContain('case-sensitive')
      })

      // The retry sweep is not casing-only: "ER visit" is not a substring of the
      // stored "Emergency Room Visit" in ANY casing, so the term's expansions and
      // its distinctive words have to be searched too. This is the case the
      // backend resolver handled and this surface did not.
      it('retries an expanded term, not just other casings', async () => {
        const store = makeStore()
        const hit = [{ value: '9203', text: 'Emergency Room Visit' }]
        store.getters.getDomainValues = () => ({ loadedStatus: 'HAS_RESULTS', values: [] })
        store.dispatch.mockImplementation((type: string, payload: any) =>
          type === 'loadValuesForAttributePath'
            ? Promise.resolve(payload.searchQuery === 'Emergency Room Visit' ? hit : [])
            : Promise.resolve(undefined)
        )

        const parsed = parse(
          await byName(createPaTools(store), 'pa_search_attribute_values').execute({
            attributePath: 'p.attr',
            query: 'ER visit',
          })
        )

        expect(parsed.matchedVia).toBe('alternate-query')
        expect(parsed.values).toEqual(hit)
      })

      it('reports matchedVia "none" when neither the search nor any retry matched', async () => {
        const store = makeStore()
        store.getters.getDomainValues = () => ({ loadedStatus: 'HAS_RESULTS', values: [] })
        store.dispatch.mockImplementation((type: string) =>
          type === 'loadValuesForAttributePath' ? Promise.resolve([]) : Promise.resolve(undefined)
        )

        const parsed = parse(
          await byName(createPaTools(store), 'pa_search_attribute_values').execute({
            attributePath: 'p.attr',
            query: 'telehealth',
          })
        )

        // Distinct from "the whole column is below, pick one": nothing could be read
        // at all, so the next move is a different attributePath.
        expect(parsed.matchedVia).toBe('none')
        expect(parsed.note).toContain('different attributePath')
      })

      it('does not re-read the domain when the search was merely TOO_MANY_RESULTS', async () => {
        const store = makeStore()
        store.dispatch.mockImplementation((type: string) =>
          type === 'loadValuesForAttributePath' ? Promise.resolve([]) : Promise.resolve(undefined)
        )
        store.getters.getDomainValues = () => ({ loadedStatus: 'TOO_MANY_RESULTS', values: [] })

        await byName(createPaTools(store), 'pa_search_attribute_values').execute({
          attributePath: 'p.attr',
          query: 'aspirin',
        })
        // "Narrow the query" is already the right answer — enumerating a domain the
        // endpoint just refused to return would only burn a request.
        expect(store.dispatch).toHaveBeenCalledOnce()
      })
    })

    it('lists the whole domain when `query` is omitted', async () => {
      const store = makeStore()
      const domain = [
        { value: '8532', text: 'Female' },
        { value: '8507', text: 'Male' },
      ]
      store.dispatch.mockImplementation((type: string) =>
        type === 'loadValuesForAttributePath' ? Promise.resolve(domain) : Promise.resolve(undefined)
      )
      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: 'patient.attributes.gender',
      })

      expect(store.dispatch).toHaveBeenCalledWith('loadValuesForAttributePath', {
        attributePathUid: 'patient.attributes.gender',
        searchQuery: '',
        attributeType: 'text',
      })
      // Every unfiltered read busts the cache first: a previous search on this
      // attribute leaves it cached as loaded-with-its-own-rows, and the store would
      // serve those back instead of the domain.
      expect(store.commit).toHaveBeenCalledWith('DOMAIN_SET_VALUES', {
        attributePath: 'patient.attributes.gender',
        data: { values: [], isLoaded: false, isLoading: false },
      })
      const parsed = parse(res)
      expect(parsed.matchedVia).toBe('domain')
      expect(parsed.domainTotal).toBe(2)
      expect(parsed.values).toEqual(domain)
      expect(parsed.query).toBeUndefined()
    })

    // The store cancels an in-flight /values call when a newer one targets the same
    // attributePath and resolves the loser with `undefined`. Read as "no values",
    // that is another route to telling the user a value doesn't exist.
    it('retries once when the store resolves undefined (a superseded request)', async () => {
      const store = makeStore()
      const values = [{ value: '8532', text: 'Female' }]
      let calls = 0
      store.dispatch.mockImplementation((type: string) => {
        if (type !== 'loadValuesForAttributePath') return Promise.resolve(undefined)
        calls += 1
        return Promise.resolve(calls === 1 ? undefined : values)
      })
      const res = await byName(createPaTools(store), 'pa_search_attribute_values').execute({
        attributePath: 'patient.attributes.gender',
        query: 'Female',
      })

      expect(calls).toBe(2)
      expect(parse(res).values).toEqual(values)
    })
  })

  describe('pa_get_cohort_result', () => {
    it('returns the matched count, total, chart type and binned chart data', async () => {
      const store = makeStore()
      const chartData = {
        totalPatientCount: 2694,
        categories: [{ id: 'patient.attributes.age', name: 'Age', binsize: 10 }],
        measures: [{ id: 'patient.attributes.pcount', name: 'Patient Count' }],
        data: [{ 'patient.attributes.age': 0, 'patient.attributes.pcount': 12 }],
      }
      Object.assign(store.getters, {
        getCurrentPatientCount: 1275,
        getTotalPatientCount: 2694,
        getTotalPatientListCount: 0,
        getDisplayTotalGuardedPatientCount: false,
        getActiveChart: 'vb',
        getResponse: () => ({ data: chartData }),
      })

      const res = await byName(createPaTools(store), 'pa_get_cohort_result').execute()

      expect(parse(res)).toEqual({
        currentPatientCount: 1275,
        totalPatientCount: 2694,
        chartType: 'vb',
        chart: {
          totalPatientCount: 2694,
          categories: chartData.categories,
          measures: chartData.measures,
          data: chartData.data,
        },
      })
    })

    it('uses the guarded total for list/custom charts and null chart when no response data', async () => {
      const store = makeStore()
      Object.assign(store.getters, {
        getCurrentPatientCount: 5,
        getTotalPatientCount: 99,
        getTotalPatientListCount: 42,
        getDisplayTotalGuardedPatientCount: true,
        getActiveChart: 'list',
        getResponse: () => ({}),
      })

      const res = await byName(createPaTools(store), 'pa_get_cohort_result').execute()

      expect(parse(res)).toEqual({ currentPatientCount: 5, totalPatientCount: 42, chartType: 'list', chart: null })
    })

    // Without the error surfaced, a failed chart query is indistinguishable from a
    // cohort that legitimately matched nobody — and the model reports "0 patients".
    it('surfaces a failed chart query instead of letting it read as an empty cohort', async () => {
      const store = makeStore()
      Object.assign(store.getters, {
        getCurrentPatientCount: 0,
        getTotalPatientCount: 0,
        getTotalPatientListCount: 0,
        getDisplayTotalGuardedPatientCount: false,
        getActiveChart: 'vb',
        getResponse: () => ({
          data: { totalPatientCount: 0, noDataReason: 'NO_DATA', error: 'Request failed with status code 500' },
        }),
      })

      const parsed = parse(await byName(createPaTools(store), 'pa_get_cohort_result').execute())

      expect(parsed.chart.error).toBe('Request failed with status code 500')
      expect(parsed.chart.noDataReason).toBe('NO_DATA')
      expect(parsed.error).toContain('not a real result')
      expect(parsed.error).toContain('Request failed with status code 500')
    })
  })
})

describe('registerPaTools', () => {
  afterEach(() => {
    delete (document as any).modelContext
    delete (navigator as any).modelContext
    vi.restoreAllMocks()
  })

  it('returns a no-op and warns when modelContext is unavailable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cleanup = registerPaTools(makeStore())

    expect(typeof cleanup).toBe('function')
    expect(warn).toHaveBeenCalledOnce()
    expect(() => cleanup()).not.toThrow()
  })

  it('registers every createPaTools tool on document.modelContext and unregisters on cleanup', () => {
    const unregister = vi.fn()
    const registerTool = vi.fn((_tool: PaTool) => ({ unregister }))
    ;(document as any).modelContext = { registerTool }
    const store = makeStore()
    const toolCount = createPaTools(store).length

    const cleanup = registerPaTools(store)

    const registeredNames = registerTool.mock.calls.map(c => (c[0] as PaTool).name)
    expect(registeredNames).toEqual(createPaTools(store).map(t => t.name))
    expect(registerTool).toHaveBeenCalledTimes(toolCount)

    cleanup()
    expect(unregister).toHaveBeenCalledTimes(toolCount)
  })

  it('falls back to navigator.modelContext when document.modelContext is absent', () => {
    const registerTool = vi.fn(() => ({ unregister: vi.fn() }))
    ;(navigator as any).modelContext = { registerTool }
    const store = makeStore()

    registerPaTools(store)

    expect(registerTool).toHaveBeenCalledTimes(createPaTools(store).length)
  })
})
