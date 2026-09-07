// Chrome flag #enable-webmcp-testing is ON → modelContext is available natively.
// Do NOT import '@mcp-b/global' polyfill when the flag is enabled.
//
// API location by Chrome version:
//   Chrome 146–149: navigator.modelContext   (now deprecated)
//   Chrome 150+:    document.modelContext    (current spec)
// We try document first, then fall back to navigator for older builds.
import { nextTick } from 'vue'
import type { Store } from 'vuex'
import {
  applyCohortPatch,
  describeCardGroups,
  describeCohortEntryExit,
  describeTimeRelations,
  type PatchOp,
} from './cohortPatch'
import { alternateQueries, rankValues, DEFAULT_VALUE_LIMIT, MAX_VALUE_LIMIT, type MatchedVia } from './valueResolution'

export interface PaToolResult {
  content: Array<{ type: 'text'; text: string }>
}

export interface PaTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args?: any) => Promise<PaToolResult>
}

// Optional hooks the host component (PatientAnalytics.vue) hands in so a tool can
// drive component-local UI that is NOT in the Vuex store — e.g. switching the
// saved-cohort list ↔ builder view. Kept optional so createPaTools stays
// unit-testable with only a mocked store (no component, no browser).
export interface PaComponentHooks {
  // Show the cohort builder pane (vs. the saved-cohort list). Functionally
  // required for a programmatically built cohort to render and compute its
  // count/chart: the chart-query watcher (getFireRequest → fireQuery) only runs
  // while the builder — and its chart component — is mounted.
  showBuilder?: () => void
}

// Wrap a JSON payload in the MCP text-content envelope every tool returns.
const textResult = (payload: unknown): PaToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
})

// Applying a patch does NOT compute the result: it flips the fireRequest flag and
// returns, and the count/chart are only rewritten when the mounted chart component's
// analytics query resolves — 7-24s on a HANA/LEAF-sized dataset. The count on display
// stays on the PREVIOUS cohort's number for that window (the UI deliberately does not
// blank it), so reading it straight away is what handed the model a stale number as if
// it were the new answer — the original bug. setFireRequest instead raises the store's
// `isCurrentPatientCountStale` flag, which nothing renders, and we wait that out here.
//
// The ceiling is well above the worst case observed in analytics-svc logs (24s) because
// timing out is the worse outcome: the model then has no count at all. It is bounded
// rather than open-ended because the flag is not guaranteed to clear — nothing fires
// the query while the builder is unmounted, so an unbounded wait would hang.
const COHORT_RESULT_TIMEOUT_MS = 60_000
const COHORT_RESULT_POLL_MS = 250

const waitForCohortResult = async (store: Store<any>, timeoutMs = COHORT_RESULT_TIMEOUT_MS): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (store.getters.isCurrentPatientCountStale) {
    if (Date.now() >= deadline) {
      return false
    }
    await new Promise(resolve => setTimeout(resolve, COHORT_RESULT_POLL_MS))
  }
  return true
}

// Query → stored-value matching lives in ./valueResolution, the browser-side
// twin of the backend's cohortValueResolver.ts (see the note at the top of that
// file). Keeping it out of here also keeps this file about tool wiring.
const matchDomainLocally = (rows: any[], query: string): any[] => rankValues(rows, query).map(m => m.row)

// Resolve pa_search_attribute_values' `limit` at run time
const resolveValueLimit = (raw: unknown): number => {
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  const requested = Number.isFinite(parsed) ? parsed : DEFAULT_VALUE_LIMIT
  return Math.max(1, Math.min(Math.floor(requested), MAX_VALUE_LIMIT))
}

// Turn the /values result shape into an actionable hint so the model narrows the
// query or routes to a concept set, rather than picking one product token (which
// is clinically incomplete for "any form of X"), misreading TOO_MANY_RESULTS as
// "term absent", or — the failure this note set exists to close — asking the user
// to guess a synonym for a value whose complete list is sitting in the response.
// The store computes `loadedStatus` (a 204 → TOO_MANY_RESULTS) but its action
// only returns the value array, so we read it from getDomainValues.
function attributeValuesNote(opts: {
  matchedVia: MatchedVia
  total: number
  returned: number
  truncated: boolean
  loadedStatus?: string
  query: string
  matchedQuery: string
  domainTotal?: number
}): string | undefined {
  const { matchedVia, total, returned, truncated, loadedStatus, query, matchedQuery, domainTotal } = opts
  if (loadedStatus === 'TOO_MANY_RESULTS' && total === 0) {
    return (
      `The /values endpoint reported TOO_MANY_RESULTS and returned no rows for "${query}". ` +
      'Narrow the query (add strength/form/vocabulary words, or a more specific term) so it returns ' +
      'selectable tokens — do NOT conclude the term is absent from the dataset.'
    )
  }
  if (truncated) {
    return (
      `Showing the first ${returned} of ${total} ${matchedVia === 'domain' ? 'values' : 'matching tokens'}. ` +
      'A broad term can match many tokens across code systems (RxNorm/NDC/ATC/SNOMED) and every strength/form — ' +
      `picking one product token is clinically incomplete for "any form of ${query}". Prefer a concept set with ` +
      'descendants (backend d2e-mcp) when the dataset supports it, or pick the ingredient/standard-level token ' +
      '(e.g. an RxNorm ingredient), and narrow the query to disambiguate. Raise `limit` only if you genuinely ' +
      'need the full list.'
    )
  }
  if (matchedVia === 'domain-scan') {
    return (
      `The /values search for "${query}" returned no rows, but scanning this attribute's full value list ` +
      `(${domainTotal} values) matched ${total}. The endpoint's search is case- and token-sensitive, so an empty ` +
      'search result is never proof a value is absent. Use the `value` field of the row you want.'
    )
  }
  if (matchedVia === 'alternate-query') {
    return (
      `"${query}" returned nothing but "${matchedQuery}" matched — the /values search is case-sensitive and ` +
      'matches the stored token, not the word for it. Treat a rewritten query, not absence, as the default ' +
      'explanation for an empty search result. Check the rows are really what you asked for before using one.'
    )
  }
  if (matchedVia === 'domain' && query) {
    return (
      `No value matched "${query}". The rows below are this attribute's COMPLETE value list (${domainTotal} ` +
      'values), so no further search will find anything else here. Pick the row that expresses ' +
      `"${query}" — do NOT ask the user to suggest a synonym; the whole list is right here. If genuinely none ` +
      'fits, this is the wrong attribute (a card often exposes both a *source concept code* and a ' +
      '*concept-name* attribute) or the filter is not expressible on this dataset — say so explicitly.'
    )
  }
  if (matchedVia === 'none' || total === 0) {
    return (
      `No tokens matched "${query}" — not the search, not the rewritten queries — and this attribute's ` +
      'unfiltered value list came back empty too, so its domain could not be enumerated. Try a different ' +
      'attributePath: a card often exposes both a *source concept code* and a *concept-name* attribute, and ' +
      'the term may live on the other one.'
    )
  }
  return undefined
}

// Classify HOW an attribute's constraint value must be supplied, so the model
// picks the right add_constraint value shape without guessing — the crux for a
// non-OMOP (SAP HANA / LEAF) config. Such a config filters conditions/drugs/labs
// on coded *source concept code* CATALOG attributes (type "text" + useRefValue,
// resolved via pa_search_attribute_values) and on *concept set* attributes
// (type "conceptSet", taking a { conceptSetId }) — NOT on OMOP standard concept
// ids. A bare "text" type alone doesn't tell these apart, so surface the routing.
function describeAttributeValue(attr: any): string {
  const type = attr.getType?.()
  const isCatalog =
    (typeof attr.isCatalogAttribute === 'function' && attr.isCatalogAttribute()) ||
    // useRefText-only catalogs (coded columns shown by their ref text) also need /values.
    !!attr.oInternalConfigAttribute?.useRefText
  if (type === 'conceptSet') {
    return 'conceptSet'
  }
  if (type === 'num') {
    return 'numeric'
  }
  if (type === 'time' || type === 'datetime') {
    return 'date'
  }
  if (isCatalog) {
    return 'catalog'
  }
  return 'text'
}

// The valueKind → how-to-supply-the-value legend, sent ONCE per response instead
// of repeated on every attribute. A dataset can expose 170+ filter attributes, and
// inlining ~150 chars of identical prose per attribute more than doubled this
// tool's output (≈60KB → ≈27KB when hoisted). That output lands in the agent
// transcript, which /agent resends whole on every turn — so it was the single
// biggest driver of both context burn and the 413 the drawer used to hit.
const VALUE_KIND_GUIDE: Record<string, string> = {
  numeric: 'add_constraint value:<number> with operator ("<",">","=",…).',
  date:
    'add_constraint value:{ from, to } (date range) — ONLY when the user named actual calendar dates. This is ' +
    'an absolute filter that drops every patient whose record falls outside the window, and unlike every other ' +
    'valueKind it needs no lookup, so an invented range applies cleanly and narrows the cohort silently. A ' +
    'DURATION ("at least a year of prior observation", "within 90 days", "followed for 6 months") is NOT a date ' +
    'range: use set_time_relation for the gap between two interactions, or set_entry_exit for the observation ' +
    'window. A card with no date constraint means "the patient has such a record at all" — that is a complete, ' +
    'valid filter, so never fill in dates just to give a freshly added card a value.',
  conceptSet:
    'add_constraint value:{ conceptSetId } — build/find the concept set with the d2e-mcp concept tools. The ' +
    "attribute's `conceptDomain` (when present) is the OMOP domain its concepts must come from: a set built " +
    'for another domain matches nothing, so resolve each term against the domain of the card you are filtering ' +
    '(a Visit card needs a Visit concept set, not the Condition set from an earlier filter).',
  catalog:
    'Coded catalog value — resolve the EXACT stored token with pa_search_attribute_values, then pass its ' +
    'returned `value`. Dataset-specific: never hardcode or invent the token. For a small enumerated column ' +
    '(gender, race, ethnicity, status flags) call pa_search_attribute_values with NO `query` to list every ' +
    'value it can take, and pick from that — do not guess a search term.',
  text: 'add_constraint value:<string> (free text).',
}

// The valid filter-card / attribute catalog from the frontend config (SAP-MRI or
// OMOP alike). Shared by pa_list_filter_options AND used to enrich patch failures,
// so a bad path is self-correcting from the error alone — no Vue/Pinia scraping.
// Each attribute carries a `valueKind`; `valueKindGuide` says how to supply each
// kind's value, so the model routes it correctly on a non-OMOP config.
function listFilterOptions(store: Store<any>): {
  filterCards: any[]
  valueKindGuide?: Record<string, string>
  note?: string
  error?: string
} {
  const config = store.getters.getMriFrontendConfig
  if (!config?.getFilterCards) {
    return { filterCards: [], error: 'Frontend config not loaded.' }
  }
  const filterCards = (config.getFilterCards() ?? []).map((card: any) => ({
    cardConfigPath: card.getConfigPath(),
    cardName: card.getName(),
    // getFilterAttributes(), not getAllAttributes(): the latter also includes
    // measure/category-only attributes that are NOT visible in the filter card, so
    // add_constraint cannot target them. Listing them padded the payload AND
    // invited the model to pick a path that always fails.
    attributes: ((card.getFilterAttributes?.() ?? card.getAllAttributes?.() ?? []) as any[]).map((attr: any) => {
      // The OMOP domain a conceptSet attribute's concepts must come from
      // (config `domainFilter`, what the UI picker filters the vocabulary by).
      // Without it the model happily reuses a Condition set on a Visit card —
      // a cohort that computes and answers the wrong question.
      const conceptDomain = attr.getDomainFilter?.()
      return {
        attributePath: attr.getConfigPath(),
        name: attr.getName(),
        type: attr.getType(),
        valueKind: describeAttributeValue(attr),
        ...(conceptDomain ? { conceptDomain } : {}),
      }
    }),
  }))
  return {
    filterCards,
    // Per-attribute how-to lives here, keyed by valueKind — see VALUE_KIND_GUIDE.
    valueKindGuide: VALUE_KIND_GUIDE,
    note:
      'Route each add_constraint value by `valueKind`: numeric→number+operator, date→{from,to} but only for ' +
      'calendar dates the user named (a duration is set_time_relation, a window is set_entry_exit), ' +
      'conceptSet→{conceptSetId} (build via d2e-mcp), catalog→resolve the exact token with ' +
      'pa_search_attribute_values first. This dataset may be non-OMOP (SAP HANA / LEAF): its coded ' +
      'condition/drug/measurement filters use source concept codes or concept sets, not OMOP standard ' +
      'concept ids — so d2e-mcp search_concepts may return nothing; fall back to catalog/conceptSet paths. ' +
      'If a measurement/lab card exposes no numeric value attribute here, a value threshold ' +
      '(e.g. BMI < 18.5) is NOT expressible — use a diagnosis/concept-set instead.',
  }
}

// The recovery catalog attached to a FAILED patch. Deliberately NOT the whole
// catalog: a patch failure is almost always one wrong path, and re-sending every
// card's attributes on every failure duplicated ~30KB into a transcript that
// /agent resends in full each turn (two of those and the request blew the body
// limit). So: every card by path+name — enough to fix a wrong cardConfigPath —
// plus the attributes of only the card(s) the failing ops actually named, which is
// what fixes a wrong attributePath.
function recoveryFilterOptions(store: Store<any>, patchOps: PatchOp[]): any[] {
  const { filterCards } = listFilterOptions(store)
  // `card` on a constraint op is a runtime filterCardId, not a config path, so the
  // usable signal is add_card's cardConfigPath and the card prefix of an
  // attributePath ("<cardConfigPath>.attributes.<key>").
  const named = new Set<string>()
  for (const op of patchOps ?? []) {
    const cardConfigPath = (op as any).cardConfigPath
    if (typeof cardConfigPath === 'string') named.add(cardConfigPath)
    const attributePath = (op as any).attributePath
    if (typeof attributePath === 'string') named.add(attributePath.split('.attributes.')[0])
  }
  return filterCards.map((card: any) =>
    named.has(card.cardConfigPath)
      ? card
      : {
          cardConfigPath: card.cardConfigPath,
          cardName: card.cardName,
          // Attributes omitted to keep the transcript small — ask for them by name.
          attributeCount: card.attributes.length,
        }
  )
}

// Build the Patient Analytics WebMCP tool definitions against a Vuex store.
//
// Exported separately from registerPaTools (which needs a live browser
// `modelContext`) so the handlers can be unit-tested with a mocked store — no
// Chrome flag, no bridge, no Claude required. This is verification "layer B":
// handler ↔ Vuex correctness, where most real bugs live. registerPaTools below
// is a thin adapter that registers whatever this returns.
export function createPaTools(store: Store<any>, hooks: PaComponentHooks = {}): PaTool[] {
  // Saved cohorts are fetched into the store when PA mounts; be defensive in case
  // a tool runs before that has happened (or after a store reset).
  const ensureBookmarksLoaded = async () => {
    if (!store.getters.getBookmarks?.length) {
      // Match every in-app caller: the loadAll fetch is a GET (fireBookmarkQuery
      // otherwise defaults method to 'post').
      await store.dispatch('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })
    }
  }

  return [
    {
      name: 'pa_new_cohort',
      description:
        'Start a fresh, empty cohort in the PA builder (the "Create D2E cohort" button) and switch to the ' +
        'builder view so subsequent edits render live. Call this before pa_apply_cohort_patch when building a ' +
        'cohort from scratch. PA must already be open — this resets the builder, it cannot navigate to PA if unmounted.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Working name for the new cohort (default "New cohort").' },
        },
      },
      async execute({ name }: { name?: string } = {}) {
        // Mirror Bookmarks.vue addNewCohort(): a brand-new unsaved active bookmark
        // (no bmkId, isNew) + a blank IFR/chart from config defaults.
        store.commit('SET_ACTIVE_BOOKMARK', { bookmarkname: name || 'New cohort', isNew: true })
        await store.dispatch('resetChart')
        // Switch list → builder so the chart mounts and the result computes.
        hooks.showBuilder?.()
        // Snapshot the baseline last, as addNewCohort does
        await nextTick()
        store.commit('SET_ACTIVE_BOOKMARK_BASELINE', store.getters.getBookmarksData)
        return textResult({ created: true, name: name || 'New cohort' })
      },
    },
    {
      name: 'pa_get_current_cohort',
      description:
        'Return the active cohort / bookmark definition as JSON, plus `cardGroups`: the filter cards as the ' +
        'builder groups them (cards in the SAME group are OR-ed; the groups are AND-ed), `timeRelations`: ' +
        'the temporal (Advanced Time) relations between cards, and `cohortEntryExit`: the observation window ' +
        '(the Entry/Exit buttons). Read them before editing — they give you the real filterCardIds to target ' +
        'and tell you whether the cohort currently means "A and B", "A or B", or "A then B within N days", and ' +
        'over what window it is measured.',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        const cohortEntryExit = describeCohortEntryExit(store)
        return textResult({
          bookmarkData: store.getters.getBookmarksData,
          ifr: store.getters.getBookmarkFromIFR,
          cardGroups: describeCardGroups(store),
          cardGroupsNote:
            'Cards within one group are OR-ed; groups are AND-ed. To add an OR alternative use ' +
            'add_card with orWith:"<an existing filterCardId in that group>"; to change how two cards already ' +
            'on the cohort combine use set_card_join on the LATER card.',
          timeRelations: describeTimeRelations(store),
          timeRelationsNote:
            'Temporal relations between cards. An EMPTY list means the cohort has no timing at all — AND-ed ' +
            'cards only require that both interactions happened at some point ("ever diagnosed and ever ' +
            'prescribed"), never that one followed the other. Add timing with set_time_relation.',
          cohortEntryExit,
          cohortEntryExitNote: cohortEntryExit.supported
            ? "The observation window the cohort is measured over: it runs from the `entry` card's interaction " +
              "START to the `exit` card's interaction END. Both null means the window is the patient's full " +
              'observation period. Set them with set_entry_exit — it is NOT the same as set_time_relation, ' +
              'which constrains the gap between two interactions instead of re-anchoring the window.'
            : 'This dataset does not support an entry/exit window (panelOptions.cohortEntryExit is off, so the ' +
              'builder hides the buttons and the query ignores the flags). set_entry_exit will be rejected — ' +
              'do not offer to anchor the cohort to an entry or exit event here.',
        })
      },
    },
    {
      name: 'pa_list_cohorts',
      description:
        'List the saved cohorts (bookmarks) available in this dataset, as { bmkId, name }. ' +
        'Pass forceRefresh:true to reload from the server — do this right after pa_save_current_cohort so a ' +
        'just-saved cohort appears (the default path serves a cached list and can be stale).',
      inputSchema: {
        type: 'object',
        properties: {
          forceRefresh: {
            type: 'boolean',
            description: 'Reload the list from the server instead of using the cached one.',
          },
        },
      },
      async execute({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
        if (forceRefresh) {
          await store.dispatch('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })
        } else {
          await ensureBookmarksLoaded()
        }
        const cohorts = (store.getters.getBookmarks ?? []).map((b: any) => ({
          bmkId: b.bmkId,
          name: b.bookmarkname,
        }))
        return textResult({ cohorts })
      },
    },
    {
      name: 'pa_open_cohort',
      description:
        'Open a saved cohort in the PA builder by name (or exact bmkId) and render it live. ' +
        'Resolve names with pa_list_cohorts first.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Cohort/bookmark display name' },
          bmkId: { type: 'string', description: 'Exact bookmark id; takes precedence over name' },
          chartType: { type: 'string', description: 'Optional target chart type, e.g. "bar"' },
        },
      },
      async execute({ name, bmkId, chartType }: { name?: string; bmkId?: string; chartType?: string }) {
        if (!name && !bmkId) {
          return textResult({ opened: false, error: 'Provide a cohort name or bmkId.' })
        }
        await ensureBookmarksLoaded()
        const bookmarks: any[] = store.getters.getBookmarks ?? []

        if (bmkId) {
          if (!bookmarks.some(b => b.bmkId === bmkId)) {
            return textResult({ opened: false, error: `No cohort with bmkId "${bmkId}".` })
          }
        } else {
          const matches = bookmarks.filter(b => b.bookmarkname === name)
          if (matches.length === 0) {
            return textResult({ opened: false, error: `No cohort named "${name}".` })
          }
          if (matches.length > 1) {
            return textResult({
              opened: false,
              ambiguous: matches.map(b => ({ bmkId: b.bmkId, name: b.bookmarkname })),
            })
          }
          bmkId = matches[0].bmkId
        }

        await store.dispatch('loadbookmarkToState', { bmkId, chartType })
        // Ensure the builder is visible even when a cohort was already active (the
        // store's null→set view watcher only fires on the first bookmark).
        hooks.showBuilder?.()
        return textResult({ opened: true, bmkId })
      },
    },
    {
      name: 'pa_apply_cohort_patch',
      description:
        'Edit the live cohort. Preferred (and the ONLY way to add/remove a filter): pass `patchOps` — typed intent ' +
        'applied deterministically in-place (add_card / add_constraint / remove_card / remove_constraint / ' +
        'set_card_join / set_time_relation / clear_time_relation / set_entry_exit / clear_entry_exit). Discover ' +
        'valid paths with pa_list_filter_options. AND/OR: cards are AND-ed by default; to express "A OR B" add ' +
        'the second card with orWith:"<the other card>" (or regroup existing cards with set_card_join). TIMING IS ' +
        'SEPARATE FROM AND/OR: AND-ed cards mean "both happened, ever" — any "within N days", "followed by", ' +
        '"after", "before", "during" wording needs a set_time_relation op as well, or the cohort silently answers ' +
        'a wider question. "Observed FROM event A UNTIL event B" is a third, different thing — the observation ' +
        'window — and needs set_entry_exit. NEVER invent a date range to give a card a value: adding a card with ' +
        'no constraint already means "the patient has such a record", and a fabricated { from, to } silently ' +
        'drops every patient outside it. The result reports `cardGroups` (the grouping that landed), ' +
        '`timeRelations` (the timing that landed), `cohortEntryExit` (the window that landed) and `warnings` ' +
        '(date ranges that landed — act on each one) — report from those. Legacy `bookmark`: a full tree, ' +
        'accepted ONLY from a trusted builder — a hand-authored tree is validated and rejected (it silently ' +
        'loads the wrong cohort). Never hand-author one.',
      inputSchema: {
        type: 'object',
        properties: {
          patchOps: {
            type: 'array',
            description:
              'Typed patch operations. Each: ' +
              '{ op:"add_card", cardConfigPath, exclude?, ref?, orWith? } | ' +
              '{ op:"add_constraint", card, attributePath, value, operator? } | ' +
              '{ op:"remove_card", card } | { op:"remove_constraint", card, attributePath } | ' +
              '{ op:"set_card_join", card, join } | ' +
              '{ op:"set_time_relation", card, relativeTo, mode?, days?, minDays?, maxDays?, direction?, ' +
              'fromDate?, toDate? } | { op:"clear_time_relation", card, relativeTo? } | ' +
              '{ op:"set_entry_exit", card, role } | { op:"clear_entry_exit", role? }. ' +
              'The Basic Data card ("patient") always exists — constrain it directly, never add_card it. ' +
              'Separate filter cards are AND-ed; two cards are OR-ed by putting them in the same group ' +
              '(add_card orWith, or set_card_join). Neither AND nor OR carries any timing — use ' +
              'set_time_relation for that, and set_entry_exit for the observation window.',
            items: {
              type: 'object',
              properties: {
                op: {
                  type: 'string',
                  enum: [
                    'add_card',
                    'add_constraint',
                    'remove_card',
                    'remove_constraint',
                    'set_card_join',
                    'set_time_relation',
                    'clear_time_relation',
                    'set_entry_exit',
                    'clear_entry_exit',
                  ],
                },
                cardConfigPath: {
                  type: 'string',
                  description: 'add_card: the card to add, from pa_list_filter_options.',
                },
                exclude: { type: 'boolean', description: 'add_card: make it an exclusion card.' },
                ref: { type: 'string', description: 'add_card: local handle later ops can use as `card`.' },
                orWith: {
                  type: 'string',
                  description:
                    'add_card: OR the new card with this existing one (a filterCardId, or a `ref` from earlier ' +
                    'in this patch) by putting both in the same group — use it for "patients with X OR Y", one ' +
                    'condition per card. Omit for the default, which AND-s the new card with the rest. Cannot ' +
                    'reference the Basic Data card, and cannot mix an exclusion card with an inclusion one.',
                },
                card: {
                  type: 'string',
                  description:
                    'add_constraint / remove_* / set_card_join / *_time_relation / set_entry_exit: a filterCardId ' +
                    '("patient", "…conditionoccurrence.1") or an add_card `ref` from earlier in this same patch. ' +
                    'For set_time_relation this is the LATER interaction — the one whose timing is constrained. ' +
                    'For set_entry_exit it is the card whose interaction dates the window (clear_entry_exit takes ' +
                    'no card — each role is cohort-wide).',
                },
                role: {
                  type: 'string',
                  enum: ['entry', 'exit'],
                  description:
                    'set_entry_exit: which end of the observation window `card` anchors — "entry" uses its ' +
                    'interaction START date, "exit" uses its interaction END date. REQUIRED. On ' +
                    'clear_entry_exit it is optional: omit it to clear both ends and fall back to the ' +
                    "patient's full observation period.",
                },
                relativeTo: {
                  type: 'string',
                  description:
                    'set_time_relation: the card `card` is timed against (a filterCardId or an earlier `ref`) — ' +
                    'the index/anchor interaction. It must be alone in its own AND-group; you cannot time ' +
                    'against an OR group. clear_time_relation: omit to drop every relation on `card`.',
                },
                mode: {
                  type: 'string',
                  enum: ['within', 'exactly', 'at_least', 'at_most', 'between', 'overlaps'],
                  description:
                    'set_time_relation, default "within" — but the default is only right for an UPPER bound, so ' +
                    "read the user's words and pass `mode` explicitly. Each mode names the day-range expression " +
                    'written into the builder, and that expression is the mode\'s real meaning: "within" = ' +
                    '[0-N], the CLOSED window 0..N, i.e. at most N days apart ("within 90 days" / "in the 90 ' +
                    'days following" / "no later than 90 days"); "at_least" = >=N, a FLOOR with no ceiling ' +
                    '("at least 90 days", "≥90 days", "90 days or more", "no sooner than 90 days", "90 days ' +
                    'apart", "after 90 days"); "at_most" = <=N; "between" = [minDays-maxDays], a floor AND a ' +
                    'ceiling; "exactly" = the Nth day ONLY, almost never what a clinical question asks for; ' +
                    '"overlaps" = the two interactions overlap in time (days and direction are ignored). ' +
                    '[0-N] and >=N PARTITION the timeline at N days — no patient satisfies both — so choosing ' +
                    'the wrong one does not widen the cohort, it swaps it for the complement. "90 days" in the ' +
                    'request tells you nothing about the mode; the bounding word next to it does.',
                },
                days: {
                  type: 'number',
                  description:
                    'set_time_relation: whole number of days for within / exactly / at_least / at_most.',
                },
                minDays: { type: 'number', description: 'set_time_relation mode:"between": lower bound in days.' },
                maxDays: { type: 'number', description: 'set_time_relation mode:"between": upper bound in days.' },
                direction: {
                  type: 'string',
                  enum: ['after', 'before'],
                  description:
                    'set_time_relation, default "after": whether `card` happens after or before `relativeTo`. ' +
                    '"an initial diagnosis THEN a prescription within 90 days" = the prescription card, ' +
                    'relativeTo the diagnosis card, direction "after".',
                },
                fromDate: {
                  type: 'string',
                  enum: ['start', 'end'],
                  description: 'set_time_relation, default "start": which date of `card` is compared.',
                },
                toDate: {
                  type: 'string',
                  enum: ['start', 'end'],
                  description:
                    'set_time_relation, default "start": which date of `relativeTo` it is compared to. Use ' +
                    '"end" for "within 90 days of finishing …".',
                },
                join: {
                  type: 'string',
                  enum: ['AND', 'OR'],
                  description:
                    'set_card_join: how `card` combines with the card before it. "OR" merges it into the ' +
                    'preceding group, "AND" splits it into its own. Apply it to the LATER card of the pair; the ' +
                    'first card on the cohort has nothing before it to join with.',
                },
                attributePath: {
                  type: 'string',
                  description: 'add_constraint / remove_constraint: exact path from pa_list_filter_options.',
                },
                value: {
                  description:
                    'add_constraint: REQUIRED, and the concept-set id goes HERE, not beside it. ' +
                    'numeric -> a number (with `operator`); catalog/text -> the exact stored string; ' +
                    'date -> { from, to }, and ONLY when the user named those calendar dates — a duration or a ' +
                    'prior-observation requirement is set_time_relation, and an observation window is ' +
                    'set_entry_exit; conceptSet -> { conceptSetId, includeDescendants? } where ' +
                    'conceptSetId came from create_concept_set / list_concept_sets. An empty or missing ' +
                    'value is rejected — use remove_constraint to clear a filter.',
                },
                operator: { type: 'string', description: 'add_constraint: "=", "<", ">", "<=", ">=". Default "=".' },
              },
              required: ['op'],
            },
          },
          bookmark: { type: 'object', description: 'Legacy: parsed bookmark object (back-compat)' },
          chartType: { type: 'string', description: 'Target chart type, e.g. "bar"' },
        },
      },
      async execute({
        patchOps,
        bookmark,
        chartType,
      }: {
        patchOps?: PatchOp[]
        bookmark?: object
        chartType?: string
      }) {
        if (Array.isArray(patchOps)) {
          try {
            const result = await applyCohortPatch(store, patchOps)
            // Make sure the builder (and its chart) is on screen so the edit renders
            // and the count/chart query actually runs.
            hooks.showBuilder?.()
            return textResult(result)
          } catch (err) {
            // Attach the valid paths so a wrong card/attribute path is recoverable
            // straight from the error — no need to call pa_list_filter_options separately
            // or scrape the app's internals. Scoped to the cards this patch named
            // (see recoveryFilterOptions); call pa_list_filter_options({ card }) for
            // the attributes of any other card.
            return textResult({
              applied: false,
              error: err instanceof Error ? err.message : String(err),
              validFilterOptions: recoveryFilterOptions(store, patchOps),
            })
          }
        }
        if (bookmark) {
          // A hand-authored bookmark tree is the #1 footgun here: loadBookmarkDataToState
          // clobbers the active bookmark with a "Linked Cohort" stub BEFORE it parses, so
          // a malformed tree (e.g. a filter card missing `attributes`) throws in
          // convertBM2IFR and leaves the builder pointing at a broken cohort that then
          // crashes the chart — while the caller may still think it succeeded.
          // The parse throws before any IFR mutation, so on failure only the active
          // bookmark is dirty: snapshot it and restore, leaving state untouched, and
          // surface the error so the caller uses patchOps instead.
          const prevActiveBookmark = store.getters.getActiveBookmark
          try {
            await store.dispatch('loadBookmarkDataToState', { bookmark, chartType })
            return textResult({ applied: true })
          } catch (err) {
            store.commit('SET_ACTIVE_BOOKMARK', prevActiveBookmark)
            const detail = err instanceof Error ? err.message || err.name : String(err)
            return textResult({
              applied: false,
              error:
                `Rejected malformed bookmark (${detail}). Do not hand-author bookmark trees — ` +
                'edit the live cohort with patchOps (add_card / add_constraint) instead.',
            })
          }
        }
        return textResult({ applied: false, error: 'Provide patchOps (preferred) or a bookmark object.' })
      },
    },
    {
      name: 'pa_list_filter_options',
      description:
        'List the valid filter cards and attributes for the current dataset as ' +
        '{ cardConfigPath, cardName, attributes: [{ attributePath, name, type, valueKind, conceptDomain? }] }, plus a ' +
        '`valueKindGuide` map and a routing `note`. `valueKind` (numeric | date | conceptSet | catalog | text) ' +
        'keys into valueKindGuide, which says how to supply that add_constraint value — essential on non-OMOP ' +
        '(SAP HANA / LEAF) datasets whose coded filters use source concept codes/concept sets, not OMOP standard ' +
        "concept ids. Pass `card` (a cardConfigPath) to get just that card's attributes; the full catalog is " +
        'large, so prefer the scoped call once you know the card. ' +
        'Use these exact paths in pa_apply_cohort_patch patchOps — never invent paths.',
      inputSchema: {
        type: 'object',
        properties: {
          card: {
            type: 'string',
            description:
              'Optional cardConfigPath (e.g. "patient.interactions.priDiag") — return only this card, with its ' +
              'attributes. Omit for the whole catalog.',
          },
        },
      },
      async execute({ card }: { card?: string } = {}) {
        const options = listFilterOptions(store)
        if (!card || options.error) {
          return textResult(options)
        }
        const match = options.filterCards.find((c: any) => c.cardConfigPath === card)
        if (!match) {
          // A wrong path is the common case here, so answer it with the thing that
          // fixes it (the valid paths) rather than an error the model must chase.
          return textResult({
            filterCards: [],
            error: `Unknown card "${card}".`,
            validCardConfigPaths: options.filterCards.map((c: any) => c.cardConfigPath),
          })
        }
        return textResult({ ...options, filterCards: [match] })
      },
    },
    {
      name: 'pa_search_attribute_values',
      description:
        "Resolve the EXACT stored value token for any categorical/text attribute via the app's /values " +
        'endpoint — no auth/token handling needed. Use it for demographics too: gender/race/etc. tokens are ' +
        'dataset-specific (e.g. "FEMALE" vs "Female" vs "F"), so NEVER hardcode them — look them up here. ' +
        'Also resolves a term like "sinusitis" to selectable diagnosis values. OMIT `query` to list the ' +
        "attribute's COMPLETE value list — the fastest and most reliable route for a low-cardinality column " +
        '(gender, race, ethnicity, status flags). Returns { matchedVia, total, returned, truncated, loadedStatus, ' +
        'domainTotal?, values:[{ value, text, display_value }], note }; pass a returned `value` as an ' +
        'add_constraint value in pa_apply_cohort_patch. `matchedVia` says what you are looking at: "search"/' +
        '"domain-scan"/"alternate-query" = matches for your query (the last one via a rewritten query — check ' +
        'the rows are really what you asked for); "domain" = the attribute\'s whole value list (returned when ' +
        'nothing matched, so you can pick from it); "none" = the column could not be read at all, so try a ' +
        'different attributePath. A zero-result search is NEVER proof the value is absent — this tool already ' +
        'rechecked the full domain, retried the term\'s casings and its expansions ("ER visit" → "Emergency ' +
        'Room Visit"), so read `note` and decide from the rows returned instead of asking the user for a ' +
        'synonym or spelling. The list is CAPPED (default 50, `limit` to ' +
        'change) — when `truncated` or loadedStatus is "TOO_MANY_RESULTS", NARROW the query rather than paging: ' +
        'a broad drug/condition term matches thousands of tokens across code systems and strengths, and one ' +
        'product token is clinically incomplete. For "any form of X", prefer a concept set with descendants ' +
        '(backend d2e-mcp). attributePath comes from pa_list_filter_options. This returns raw attribute values, ' +
        'not a concept-set id.',
      inputSchema: {
        type: 'object',
        properties: {
          attributePath: {
            type: 'string',
            description:
              'Attribute config path from pa_list_filter_options, e.g. "patient.interactions.priDiag.attributes.icd10".',
          },
          query: {
            type: 'string',
            description:
              'Search text, e.g. "sinusitis". OMIT it to list every value the attribute can take — do that for ' +
              'demographics and other small enumerated columns instead of guessing a search term.',
          },
          attributeType: {
            type: 'string',
            description: 'Optional value-type hint: "text" (default) or "conceptSet".',
          },
          limit: {
            type: 'number',
            description:
              `Max values to return (default ${DEFAULT_VALUE_LIMIT}, max ${MAX_VALUE_LIMIT}). Narrow the query ` +
              'instead of raising this when results span many code systems/strengths.',
          },
        },
        required: ['attributePath'],
      },
      async execute({
        attributePath,
        query,
        attributeType,
        limit,
      }: {
        attributePath: string
        query?: string
        attributeType?: string
        // Typed `unknown`, not `number`: this crosses an unvalidated tool boundary,
        // so resolveValueLimit — not the declared schema — is what makes it a number.
        limit?: unknown
      }) {
        if (!attributePath) {
          return textResult({ values: [], error: 'Provide an attributePath (from pa_list_filter_options).' })
        }
        const trimmedQuery = typeof query === 'string' ? query.trim() : ''
        const cap = resolveValueLimit(limit)

        const fetchValues = async (searchQuery: string): Promise<{ rows?: any[]; loadedStatus?: string }> => {
          if (!searchQuery) {
            // Bust the store's "already loaded" short-circuit before every
            // unfiltered read. Any earlier search on this attributePath left it
            // cached as loaded — with that search's (possibly empty) rows — and the
            // action would serve exactly those back instead of fetching the domain,
            // turning the fallback below into a no-op that confirms its own miss.
            store.commit('DOMAIN_SET_VALUES', {
              attributePath,
              data: { values: [], isLoaded: false, isLoading: false },
            })
          }
          const rows = await store.dispatch('loadValuesForAttributePath', {
            attributePathUid: attributePath,
            searchQuery,
            attributeType: attributeType ?? 'text',
          })
          // The store's action returns only the value array, but it records WHY a
          // list is empty/short as `loadedStatus` (a 204 → "TOO_MANY_RESULTS").
          // Read it from the getter so the model can tell "no such token" from
          // "narrow the query".
          const loadedStatus: string | undefined = store.getters.getDomainValues?.(attributePath)?.loadedStatus
          return { rows: Array.isArray(rows) ? rows : undefined, loadedStatus }
        }

        // The store resolves `undefined` when a newer request for the same
        // attributePath superseded this one (it cancels the in-flight call and
        // drops the late response). That is a race, not an empty domain, and
        // reporting it as "no values" is another way the assistant ends up telling
        // the user a value doesn't exist. Retry once — the retry is uncontended.
        const fetchValuesRetrying = async (searchQuery: string) => {
          const first = await fetchValues(searchQuery)
          return first.rows ? first : fetchValues(searchQuery)
        }

        let matchedVia: MatchedVia = trimmedQuery ? 'search' : 'domain'
        let matchedQuery = trimmedQuery
        const searched = await fetchValuesRetrying(trimmedQuery)
        let all: any[] = searched.rows ?? []
        let loadedStatus = searched.loadedStatus
        let domainTotal: number | undefined = trimmedQuery ? undefined : all.length

        if (trimmedQuery && all.length === 0 && loadedStatus !== 'TOO_MANY_RESULTS') {
          const domain = await fetchValuesRetrying('')
          const domainRows = domain.rows ?? []
          domainTotal = domainRows.length
          const localMatches = matchDomainLocally(domainRows, trimmedQuery)
          if (localMatches.length > 0) {
            all = localMatches
            loadedStatus = domain.loadedStatus
            matchedVia = 'domain-scan'
          } else if (domainRows.length > 0) {
            // Hand back the COMPLETE list rather than "not found", so the model can
            // pick a value (or rule the attribute out) in this same step instead of
            // asking the user to guess a spelling.
            all = domainRows
            loadedStatus = domain.loadedStatus
            matchedVia = 'domain'
          } else {
            // The domain isn't enumerable (too large, or the endpoint only answers
            // searches), so the scan above can't decide it. Retry the search with the
            // rewritten queries: every casing (a backend LIKE is case-sensitive, so
            // "female" misses a stored "Female"), then the term's expansions and its
            // distinctive words — searching "emergency" is what reaches a value that
            // the user's phrase ("ER visit") is not even a substring of.
            for (const variant of alternateQueries(trimmedQuery)) {
              const alt = await fetchValuesRetrying(variant)
              if ((alt.rows?.length ?? 0) > 0) {
                all = alt.rows as any[]
                loadedStatus = alt.loadedStatus
                matchedVia = 'alternate-query'
                matchedQuery = variant
                break
              }
            }
            if (matchedVia === 'search') {
              matchedVia = 'none'
              loadedStatus = domain.loadedStatus ?? loadedStatus
            }
          }
        }

        const total = all.length
        const values = all.slice(0, cap)
        const truncated = total > values.length
        const note = attributeValuesNote({
          matchedVia,
          total,
          returned: values.length,
          truncated,
          loadedStatus,
          query: trimmedQuery,
          matchedQuery,
          domainTotal,
        })
        return textResult({
          attributePath,
          ...(trimmedQuery ? { query: trimmedQuery } : {}),
          matchedVia,
          total,
          returned: values.length,
          truncated,
          loadedStatus,
          ...(domainTotal !== undefined ? { domainTotal } : {}),
          values,
          ...(note ? { note } : {}),
        })
      },
    },
    {
      name: 'pa_get_cohort_result',
      description:
        'Return the LIVE computed RESULT of the current cohort: matched patient count, total, active chart type, ' +
        'and the binned chart data (categories, measures, per-bin patient counts). Use this to verify what actually ' +
        'rendered after building/editing — pa_get_current_cohort returns only the definition, not the result. ' +
        'Requires the builder to be open (pa_new_cohort / pa_open_cohort switch to it) so the chart query has run. ' +
        'An edit does not compute its own result, so this BLOCKS until the recompute lands (tens of seconds on a ' +
        'large dataset) — that wait is the point, do not skip the call or race it. If it returns `pending:true` the ' +
        'result never arrived: the counts in that response are NOT an answer, so report the cohort as not yet ' +
        'computed rather than quoting them.',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        // Blocks while the store flags the count as stale — i.e. an edit fired a new
        // query and the numbers on screen are still the previous cohort's.
        const settled = await waitForCohortResult(store)
        const g = store.getters
        // getResponse is a getter that returns a function; call it for the raw response.
        const resp = typeof g.getResponse === 'function' ? g.getResponse() : g.getResponse
        const chartData = resp?.data
        const chart = chartData
          ? {
              totalPatientCount: chartData.totalPatientCount,
              categories: chartData.categories,
              measures: chartData.measures,
              data: chartData.data,
              noDataReason: chartData.noDataReason,
              // Set when the last chart query errored (see fireQuery). Without it a
              // failed query reads as an empty cohort and the count "--" has no cause.
              ...(chartData.error ? { error: chartData.error } : {}),
            }
          : null
        return textResult({
          currentPatientCount: g.getCurrentPatientCount,
          totalPatientCount: g.getDisplayTotalGuardedPatientCount ? g.getTotalPatientListCount : g.getTotalPatientCount,
          chartType: g.getActiveChart,
          chart,
          // Timed out with the query still in flight. Say so as loudly as the failed-query
          // case: the counts below are the PREVIOUS cohort's, not this one's, and
          // reporting them as a result is the exact bug this wait exists to prevent.
          ...(settled
            ? {}
            : {
                pending: true,
                error:
                  `The cohort is still computing after ${Math.round(COHORT_RESULT_TIMEOUT_MS / 1000)}s, so there is ` +
                  'no count to report yet — the counts in this response are the PREVIOUS cohort\'s, so do NOT ' +
                  'read them as a result. The chart query ' +
                  'only runs while the builder is on screen: check it is open (pa_new_cohort / pa_open_cohort), ' +
                  'then call pa_get_cohort_result again.',
              }),
          ...(chartData?.error
            ? {
                error: `The last chart query failed, so the count is not a real result: ${chartData.error}`,
              }
            : {}),
        })
      },
    },
    {
      name: 'pa_save_current_cohort',
      description:
        'Persist the current cohort to bookmark-svc and refresh the saved-cohort list. ' +
        'New cohort → pass { name } (inserts). Overwrite an existing one → pass { bookmarkId } or method:"put" (updates). ' +
        'The save payload (cmd / bookmark body / shareBookmark) is built from live store state — you do not construct it. ' +
        'Advanced/back-compat: a raw `params` object, if provided, is forwarded to fireBookmarkQuery verbatim.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name for a NEW cohort (insert). Required to insert unless updating or passing raw params.',
          },
          share: { type: 'boolean', description: 'Share the cohort with other users (default false).' },
          bookmarkId: { type: 'string', description: 'Existing cohort id to overwrite (update). Omit to insert.' },
          method: { type: 'string', enum: ['post', 'put'], description: 'post = insert (default), put = update.' },
          params: {
            type: 'object',
            description: 'Advanced/back-compat: raw fireBookmarkQuery params, forwarded verbatim.',
          },
        },
      },
      async execute({
        name,
        share = false,
        bookmarkId,
        method,
        params,
      }: {
        name?: string
        share?: boolean
        bookmarkId?: string
        method?: string
        params?: any
      } = {}) {
        // Reload the list after a write so pa_list_cohorts (and the UI) reflect it —
        // fireBookmarkQuery does NOT refetch after insert/update on its own.
        const refreshList = () => store.dispatch('fireBookmarkQuery', { method: 'get', params: { cmd: 'loadAll' } })

        // Back-compat: forward a hand-built params object verbatim.
        if (params) {
          const res = await store.dispatch('fireBookmarkQuery', { method: method ?? 'post', params, bookmarkId })
          await refreshList()
          return textResult({ saved: true, bookmarkId: res?.bmkId ?? bookmarkId })
        }

        const bookmarkData = store.getters.getBookmarksData
        if (!bookmarkData || Object.keys(bookmarkData).length === 0) {
          return textResult({ saved: false, error: 'Current cohort is empty — build filters before saving.' })
        }

        const active = store.getters.getActiveBookmark
        const targetId = bookmarkId ?? (method === 'put' ? active?.bmkId : undefined)
        const isUpdate = method === 'put' || !!targetId

        let builtParams: Record<string, unknown>
        let httpMethod: string
        if (isUpdate) {
          if (!targetId) {
            return textResult({
              saved: false,
              error: 'Update requested but no bookmarkId (and no active saved cohort) to update.',
            })
          }
          builtParams = { cmd: 'update', bookmark: JSON.stringify(bookmarkData), shareBookmark: share }
          httpMethod = 'put'
        } else {
          const cohortName = name ?? (active && !active.isNew ? active.bookmarkname : undefined)
          if (!cohortName) {
            return textResult({ saved: false, error: 'Provide a name to save a new cohort.' })
          }
          builtParams = {
            cmd: 'insert',
            bookmarkname: cohortName,
            bookmark: JSON.stringify(bookmarkData),
            shareBookmark: share,
          }
          httpMethod = 'post'
        }

        const res = await store.dispatch('fireBookmarkQuery', {
          method: httpMethod,
          params: builtParams,
          bookmarkId: targetId,
        })
        const savedId = res?.bmkId ?? targetId

        // Mirror the in-app dialogs: reload the list so the row is visible, then
        // adopt the saved record as the active bookmark so a follow-up save updates
        // it instead of inserting a duplicate.
        await refreshList()
        if (savedId) {
          const saved = (store.getters.getBookmarks ?? []).find((b: any) => b.bmkId === savedId)
          if (saved) store.commit('SET_ACTIVE_BOOKMARK', saved)
        }

        return textResult({ saved: true, bookmarkId: savedId })
      },
    },
  ]
}

// Where the live registration parks its teardown, on the browser's own registry
// object rather than in module state: the registry outlives PA (and outlives this
// module, which a re-imported bundle would re-instantiate), so the handle has to
// live with the thing it releases.
const REGISTRATION_KEY = '__d2ePaToolRegistration'

export function registerPaTools(store: Store<any>, hooks: PaComponentHooks = {}): () => void {
  const mc = (document as any).modelContext ?? (navigator as any).modelContext
  if (!mc) {
    console.warn('[WebMCP] modelContext API not available. Enable chrome://flags/#enable-webmcp-testing (Chrome 146+)')
    return () => {}
  }

  // Release whatever a previous mount left behind before claiming the names again.
  // PA mounts, unmounts and mounts again without a page load (single-spa
  // re-registers the app each time the user returns to the cohort route), and a
  // browser that hands back no unregister handle — or a teardown that never ran —
  // leaves the names taken, which makes the *second* registerTool call throw.
  try {
    ;(mc[REGISTRATION_KEY] as (() => void) | undefined)?.()
  } catch (err) {
    console.warn('[WebMCP] Failed to release the previous tool registration', err)
  }

  const regs: Array<{ unregister?: () => void }> = []
  for (const tool of createPaTools(store, hooks)) {
    try {
      regs.push(mc.registerTool(tool))
    } catch (err) {
      // One rejected tool must cost neither the other eight nor the caller: this
      // runs from PatientAnalytics.vue's mounted(), where a throw skips the rest
      // of the hook — including the in-page registry the assistant drawer reads.
      console.warn(`[WebMCP] Failed to register ${tool.name}`, err)
    }
  }

  // Cleanup for beforeUnmount.
  const teardown = () => {
    // Only disown the slot if it is still ours; a remount may already have
    // claimed it (its registration is the live one and must survive this call).
    if (mc[REGISTRATION_KEY] === teardown) delete mc[REGISTRATION_KEY]
    regs.forEach(r => {
      try {
        r?.unregister?.()
      } catch (err) {
        console.warn('[WebMCP] Failed to unregister a tool', err)
      }
    })
  }

  mc[REGISTRATION_KEY] = teardown
  return teardown
}
