// Deterministic cohort patch applier for the WebMCP `pa_apply_cohort_patch` tool.
//
// The LLM emits typed *intent* (PatchOp[]) — never a hand-built bookmark tree —
// and this applier mutates the IFR already in the Vuex store via the app's own
// query actions. That reuses the exact validation/normalization the UI uses, so
// AI-driven edits behave identically to wizard-driven ones.
import type { Store } from 'vuex'
import { getFieldAttrKey } from '../utils/dashboardFlowUtils'
import { applyConstraintValue } from '../utils/applyConstraintValue'
import {
  restoreConstraintValue,
  snapshotConstraintValue,
  type ConstraintValueSnapshot,
} from '../utils/constraintValueSnapshot'

export type ConstraintValue =
  | number
  | string
  | { from?: string; to?: string }
  // conceptSetId may arrive as a number — d2e-mcp create_concept_set returns numeric ids.
  | { conceptSetId: string | number; includeDescendants?: boolean; displayValue?: string }

/** Which date of an interaction a temporal relation is measured from. */
export type TimeAnchor = 'start' | 'end'

/**
 * How the day count is interpreted. `within` is the one clinical questions
 * almost always mean ("a prescription within 90 days of the diagnosis") and is
 * the default — see buildDaysExpression for why it is NOT the same as `exactly`.
 */
export type TimeRelationMode = 'within' | 'exactly' | 'at_least' | 'at_most' | 'between' | 'overlaps'

export interface SetTimeRelationOp {
  op: 'set_time_relation'
  /** The card the relation is attached to — the "this" side of the comparison. */
  card: string
  /** The card it is measured against. Must be alone in its own AND-group. */
  relativeTo: string
  /** Default 'within'. */
  mode?: TimeRelationMode
  /** Day count for within / exactly / at_least / at_most. */
  days?: number
  /** Lower/upper bound for mode:"between". */
  minDays?: number
  maxDays?: number
  /** Whether `card` happens after or before `relativeTo`. Default 'after'. */
  direction?: 'after' | 'before'
  /** Which date of `card` is compared. Default 'start'. */
  fromDate?: TimeAnchor
  /** Which date of `relativeTo` it is compared to. Default 'start'. */
  toDate?: TimeAnchor
}

/** Which end of the observation window a card anchors. */
export type EntryExitRole = 'entry' | 'exit'

export type PatchOp =
  | { op: 'add_card'; cardConfigPath: string; exclude?: boolean; ref?: string; orWith?: string }
  | { op: 'add_constraint'; card: string; attributePath: string; value: ConstraintValue; operator?: string }
  | { op: 'remove_card'; card: string }
  | { op: 'remove_constraint'; card: string; attributePath: string }
  | { op: 'set_card_join'; card: string; join: 'AND' | 'OR' }
  | SetTimeRelationOp
  | { op: 'clear_time_relation'; card: string; relativeTo?: string }
  | { op: 'set_entry_exit'; card: string; role: EntryExitRole }
  | { op: 'clear_entry_exit'; role?: EntryExitRole }

/** One OR-group of filter cards. Groups are AND-ed with each other. */
export interface CardGroup {
  cards: Array<{ filterCardId: string; name: string; exclude?: boolean }>
}

/** A temporal relation as it stands on the cohort, read back from the store. */
export interface TimeRelationSummary {
  card: string
  relativeTo: string
  /** Plain English, for the caller to report to the user. */
  description: string
}

/** The cohort's observation window, as the Entry/Exit buttons express it. */
export interface CohortEntryExit {
  /**
   * False when this dataset's PA config has `panelOptions.cohortEntryExit` off —
   * the buttons are hidden and the query ignores the flags entirely, so an
   * entry/exit window cannot be expressed here at all.
   */
  supported: boolean
  /** The card whose interaction START opens the window, or null for none. */
  entry: { filterCardId: string; name: string } | null
  /** The card whose interaction END closes the window, or null for none. */
  exit: { filterCardId: string; name: string } | null
}

export interface ApplyCohortPatchResult {
  applied: boolean
  createdCards: string[]
  /**
   * What each add_constraint actually put on the cohort, read back from the store.
   * The caller is an LLM that has to report the filters it applied — give it the
   * committed state to report rather than its own intent.
   */
  appliedConstraints?: Array<{ card: string; attributePath: string; value: any }>
  /** The resulting AND/OR structure: cards within a group are OR-ed, groups AND-ed. */
  cardGroups?: CardGroup[]
  /**
   * Every temporal (Advanced Time) relation on the cohort after the patch. Like
   * cardGroups this is read back from the store, not echoed from the ops: a
   * relation whose target went away is silently dropped from the query, so the
   * caller must report what is actually there.
   */
  timeRelations?: TimeRelationSummary[]
  /**
   * The observation window (Entry/Exit) after the patch, read back from the
   * store. Omitted on a dataset that neither supports entry/exit nor has a flag
   * left over from one that did — there is nothing to report and every byte here
   * is resent on each agent turn.
   */
  cohortEntryExit?: CohortEntryExit
  /**
   * Things the patch DID apply that the caller has to justify or undo — currently
   * every date range it landed. See describeDateRangeWarning: an invented date
   * range is a filter the user never asked for, and nothing else in the result
   * makes it stand out from the filters they did ask for.
   */
  warnings?: string[]
  error?: string
}

// A concept-set value is any object carrying a conceptSetId. Accept string OR number:
// d2e-mcp returns numeric concept-set ids, and a number that slips through to the
// generic text path gets String()'d into "[object Object]" (a broken filter → count "--").
const isConceptSetValue = (
  v: any
): v is { conceptSetId: string | number; includeDescendants?: boolean; displayValue?: string } =>
  !!v && typeof v === 'object' && (typeof v.conceptSetId === 'string' || typeof v.conceptSetId === 'number')

// Rollback bookkeeping: created cards are deleted, removed constraints re-created,
// prior constraint values and the chart's axis selection restored, grouping changes
// undone. Cards removed by remove_card are the one thing revert cannot put back —
// see applyCohortPatch.
interface Rollback {
  createdCardIds: string[]
  priorConstraintValues: ConstraintValueSnapshot[]
  createdConstraints: Array<{ filterCardId: string; constraintId: string }>
  /**
   * Constraints this patch DELETED (remove_constraint). Keyed by card + attribute
   * key rather than by constraint id: the id dies with the constraint, so revert
   * re-adds it and restores the snapshot onto whatever id the store hands back.
   */
  removedConstraints: Array<{ filterCardId: string; key: string; snapshot: ConstraintValueSnapshot }>
  /** Cards this patch DELETED (remove_card). Not undone; see applyCohortPatch. */
  removedCardIds: string[]
  priorAxes: AxisSnapshot[]
  /**
   * Grouping (AND/OR) changes, newest last. Undone by applying the inverse
   * toggle — the same pair of store actions the AND/OR buttons use — because the
   * container ids change as containers are merged/split, so a recorded id would
   * be stale by the time revert runs. `card` is the card the toggle acted on;
   * finding its container again at revert time is what makes the inverse exact.
   */
  joinChanges: Array<{ card: string; undo: 'split' | 'merge' }>
  /**
   * Advanced-time filter arrays as they were before this patch touched them,
   * newest last. Deep-copied on capture: the store holds the array by reference,
   * so a shallow snapshot would track the very edit it is meant to undo.
   */
  priorTimeFilters: Array<{ filterCardId: string; timeFilters: StoredTimeFilter[] }>
  /**
   * Which card held each entry/exit role before this patch touched it, newest
   * last. A whole-cohort snapshot rather than a per-card one because each role is
   * single-valued: setting entry on B clears it from A, so undoing the write on B
   * alone would leave the cohort with NO entry event — a different observation
   * window from the one the user had.
   */
  priorEntryExit: EntryExitSnapshot[]
}

interface AxisSnapshot {
  id: number
  props: { attributeId: string; filterCardId: string; key: string; binsize?: any }
}

// The store's deleteFilterCard clears every axis bound to the card id it is given,
// so a rolled-back add_card takes the chart's axis selection with it. An axis-less
// cohort is not a cosmetic problem: the bar-chart query then goes out with an empty
// axisSelection and analytics-svc generates `MeasurePopulation AS (SELECT  FROM …)`,
// which the DB rejects ("SELECT clause without selection list") — the cohort renders
// "--" for every later edit until the builder is reset. Snapshot before, restore after.
const snapshotAxes = (store: Store<any>): AxisSnapshot[] =>
  ((store.getters.getAllAxes as any[]) ?? []).map((axis, id) => ({
    id,
    props: {
      attributeId: axis?.props?.attributeId ?? '',
      filterCardId: axis?.props?.filterCardId ?? '',
      key: axis?.props?.key ?? '',
      ...(typeof axis?.props?.binsize === 'undefined' ? {} : { binsize: axis.props.binsize }),
    },
  }))

// ---------------------------------------------------------------------------
// AND / OR grouping
//
// There is no "operator" field on a filter card. The builder expresses the
// boolean structure through the SHAPE of the tree (see getIFR in
// store/modules/query.ts): the cards inside one boolFilterContainer become
// `BooleanContainers.Or(cards)`, and the containers themselves become
// `BooleanContainers.And(containers)`. So:
//
//   same container   → OR   ("had Alzheimer's OR had sinusitis")
//   separate containers → AND ("had Alzheimer's AND had sinusitis")
//
// `addFilterCard` with no boolFilterContainerId always opens a NEW container,
// which is why an unqualified add_card is always an AND. To OR two cards they
// must share a container — that is what add_card's `orWith` and `set_card_join`
// do, via the same store actions the AND/OR buttons in the UI dispatch.
// ---------------------------------------------------------------------------

/** The Basic Data card's instance id is its config path (see createFilterCard). */
const BASIC_DATA_CARD = 'patient'

interface CardLocation {
  containerId: string
  /** Position of the container among the root container's children. */
  containerIndex: number
  /** Position of the card within its container (0 = first, i.e. no OR before it). */
  indexInContainer: number
  cards: string[]
}

const containerIdsOf = (store: Store<any>): string[] => {
  const rootId = store.getters.getBoolContainerRoot?.()
  return store.getters.getBoolContainer?.(rootId)?.props?.boolfiltercontainers ?? []
}

const cardsInContainer = (store: Store<any>, containerId: string): string[] =>
  store.getters.getBoolFilterContainer?.(containerId)?.props?.filterCards ?? []

function locateCard(store: Store<any>, filterCardId: string): CardLocation | undefined {
  const containerIds = containerIdsOf(store)
  for (let containerIndex = 0; containerIndex < containerIds.length; containerIndex += 1) {
    const containerId = containerIds[containerIndex]
    const cards = cardsInContainer(store, containerId)
    const indexInContainer = cards.indexOf(filterCardId)
    if (indexInContainer > -1) {
      return { containerId, containerIndex, indexInContainer, cards }
    }
  }
  return undefined
}

const isExclusionCard = (store: Store<any>, filterCardId: string): boolean =>
  !!store.getters.getFilterCard?.(filterCardId)?.props?.excludeFilter

/**
 * The container a merge would fold into — the store's own rule: the nearest
 * PRECEDING container of the same inclusion/exclusion kind
 * (toggleFilterContainerBooleanCondition). Undefined when there is none.
 */
function previousContainerFor(store: Store<any>, loc: CardLocation): { id: string; cards: string[] } | undefined {
  const containerIds = containerIdsOf(store)
  const wantsExclusion = loc.cards.some(id => isExclusionCard(store, id))
  for (let i = loc.containerIndex - 1; i >= 0; i -= 1) {
    const cards = cardsInContainer(store, containerIds[i])
    if (cards.some(id => isExclusionCard(store, id)) === wantsExclusion) {
      return { id: containerIds[i], cards }
    }
  }
  return undefined
}

/**
 * Guard the one grouping that is always wrong: OR-ing anything with Basic Data.
 * Basic Data holds the demographics every cohort starts from, so
 * `Or(patient, conditionOccurrence)` matches every patient the demographics
 * alone match — the filter silently stops filtering. The UI can't express it
 * either (BoolFilterContainer hides the 'patient' card from the OR list).
 */
function assertNotBasicData(cards: string[], what: string): void {
  if (cards.includes(BASIC_DATA_CARD)) {
    throw new Error(
      `${what} would OR it with the Basic Data card, which matches every patient the demographics match — ` +
        'the filter would stop filtering. OR interaction cards (Condition Occurrence, Drug Exposure, …) with ' +
        'each other; demographics stay on Basic Data, which is always AND-ed with the rest.'
    )
  }
}

// ---------------------------------------------------------------------------
// Temporal relations (the builder's "Advanced Time" panel)
//
// AND/OR says WHETHER two interactions must both be present; it says nothing
// about WHEN. "A T2D diagnosis followed by a statin within 90 days" is two
// AND-ed cards PLUS a temporal relation — without the relation the cohort is
// "ever diagnosed and ever prescribed", a materially wider and different cohort.
//
// The relation lives on the filter card, not on a constraint:
//
//   filterCard.props.layout.advancedTimeLayout.props.timeFilterModel.timeFilters
//     [{ originSelection, targetSelection, targetInteraction, days }]
//
// and getIFR (store/modules/query.ts) turns it into the card's
// `advanceTimeFilter`. Two things about that conversion drive the design here:
//
//  1. `days` is a small expression language, not a number, and a BARE NUMBER
//     MEANS "EXACTLY N DAYS" (AdvancedTimeFilterModel.getRequest emits
//     `>= n AND <= n`). "within 90 days" is the range `[0-90]`. Handing the
//     model a raw string field would make that the default mistake, so this op
//     takes `mode` + `days` and builds the expression here.
//  2. A time filter whose `targetInteraction` is empty — or whose `days` fails
//     validateText — is SKIPPED by getIFR without an error. A relation that
//     never reaches the query is exactly the failure this op exists to prevent,
//     so everything is validated up front and read back afterwards.
// ---------------------------------------------------------------------------

/** One entry of `timeFilterModel.timeFilters`, in the store's own vocabulary. */
interface StoredTimeFilter {
  originSelection: 'startdate' | 'enddate' | 'overlap'
  targetSelection: 'before_startdate' | 'after_startdate' | 'before_enddate' | 'after_enddate'
  targetInteraction: string
  days: string
}

const timeFiltersOf = (store: Store<any>, filterCardId: string): StoredTimeFilter[] =>
  store.getters.getFilterCard?.(filterCardId)?.props?.layout?.advancedTimeLayout?.props?.timeFilterModel
    ?.timeFilters ?? []

const cloneTimeFilters = (filters: StoredTimeFilter[]): StoredTimeFilter[] => filters.map(f => ({ ...f }))

const cardName = (store: Store<any>, filterCardId: string): string =>
  store.getters.getFilterCard?.(filterCardId)?.props?.name ?? filterCardId

const anchorField = (anchor: TimeAnchor): 'startdate' | 'enddate' => (anchor === 'end' ? 'enddate' : 'startdate')

/**
 * Build the `days` expression from the op's intent.
 *
 * The mapping is AdvancedTimeFilterModel.getRequest read backwards:
 *   "[a-b]" -> a <= diff <= b      "n" -> diff == n
 *   ">=n"   -> diff >= n           "<=n" -> diff <= n
 * `within` is a RANGE from zero, which is why it cannot be expressed as the
 * bare number a caller would naturally reach for.
 */
function buildDaysExpression(op: SetTimeRelationOp, mode: TimeRelationMode): string {
  const whole = (label: string, n: unknown): number => {
    if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new Error(
        `set_time_relation: ${label} must be a whole number of days (0 or more), got ${JSON.stringify(n)}.`
      )
    }
    return n
  }
  switch (mode) {
    case 'within':
      return `[0-${whole('days', op.days)}]`
    case 'exactly':
      return `${whole('days', op.days)}`
    case 'at_least':
      return `>=${whole('days', op.days)}`
    case 'at_most':
      return `<=${whole('days', op.days)}`
    case 'between': {
      const min = whole('minDays', op.minDays)
      const max = whole('maxDays', op.maxDays)
      if (min > max) {
        throw new Error(`set_time_relation: minDays (${min}) must not be greater than maxDays (${max}).`)
      }
      return `[${min}-${max}]`
    }
    default:
      throw new Error(
        `set_time_relation: unknown mode ${JSON.stringify(mode)}. Use within | exactly | at_least | at_most | ` +
          'between | overlaps.'
      )
  }
}

/**
 * Reject a relation the builder itself could not express, before anything is
 * written. Mirrors the target list AdvancedTime.vue offers (getList /
 * getFilteredList) plus the cards it renders the panel on at all.
 */
function assertTimeRelationIsExpressible(store: Store<any>, cardId: string, targetId: string): void {
  if (cardId === targetId) {
    throw new Error('set_time_relation: a card cannot be timed against itself — pass the OTHER card as relativeTo.')
  }
  for (const [id, role] of [
    [cardId, 'card'],
    [targetId, 'relativeTo'],
  ] as const) {
    if (id === BASIC_DATA_CARD) {
      throw new Error(
        `set_time_relation: ${role} "${id}" is the Basic Data card, which has no start/end dates to compare — ` +
          'temporal relations connect interaction cards (Condition Occurrence, Drug Exposure, …). Put the ' +
          'relation on the interaction cards and leave demographics on Basic Data.'
      )
    }
    if (isExclusionCard(store, id)) {
      throw new Error(
        `set_time_relation: ${role} "${id}" is an exclusion card. The builder does not offer Advanced Time on ` +
          'excluded cards, so this relation would never reach the query. Express the timing between the ' +
          'included cards.'
      )
    }
  }

  const targetProps = store.getters.getFilterCard?.(targetId)?.props ?? {}
  if (targetProps.allowAdvancedTimeFilter === false && targetProps.allowSuccessorConstraint === false) {
    throw new Error(
      `set_time_relation: card "${targetId}" cannot be the target of a temporal relation on this dataset.`
    )
  }

  const cardLoc = locateCard(store, cardId)
  if (!cardLoc) {
    throw new Error(`set_time_relation: card "${cardId}" is not in the cohort's filter tree.`)
  }
  const targetLoc = locateCard(store, targetId)
  if (!targetLoc) {
    throw new Error(`set_time_relation: relativeTo "${targetId}" is not in the cohort's filter tree.`)
  }
  if (targetLoc.containerId === cardLoc.containerId) {
    throw new Error(
      `set_time_relation: "${cardId}" and "${targetId}" are OR-ed together in the same group, so there is no ` +
        '"one then the other" to time — the cohort only requires that ONE of them matched. Split them with ' +
        'set_card_join { card, join:"AND" } first, then set the relation.'
    )
  }
  if (targetLoc.cards.length > 1) {
    throw new Error(
      `set_time_relation: relativeTo "${targetId}" is OR-ed with ${targetLoc.cards
        .filter(id => id !== targetId)
        .map(id => `"${id}"`)
        .join(', ')}, and the builder cannot time against an OR group (which interaction would the days be ` +
        'measured from?). Time against a card that is alone in its group.'
    )
  }
}

/** Render a stored time filter as the sentence the caller should report. */
function describeTimeFilter(store: Store<any>, cardId: string, filter: StoredTimeFilter): string {
  const self = cardName(store, cardId)
  const other = cardName(store, filter.targetInteraction)
  if (filter.originSelection === 'overlap') {
    return `${self} overlaps in time with ${other}`
  }
  const selfDate = filter.originSelection === 'enddate' ? 'end' : 'start'
  const otherDate = filter.targetSelection.endsWith('enddate') ? 'end' : 'start'
  const direction = filter.targetSelection.startsWith('after') ? 'after' : 'before'
  const range = /^\[(\d+)-(\d+)\]$/.exec(filter.days)
  const bound = /^(>=|<=|>|<|=)(\d+)$/.exec(filter.days)
  const window = range
    ? range[1] === '0'
      ? `within ${range[2]} days`
      : `${range[1]}–${range[2]} days`
    : bound
      ? `${{ '>=': 'at least', '>': 'more than', '<=': 'at most', '<': 'less than', '=': 'exactly' }[bound[1]]} ${
          bound[2]
        } days`
      : /^\d+$/.test(filter.days)
        ? `exactly ${filter.days} days`
        : `${filter.days} days`
  return `${self} ${selfDate}s ${window} ${direction} ${other} ${otherDate}s`
}

/**
 * Every temporal relation currently on the cohort. Relations whose target card
 * is gone are reported with `relativeTo: ""` rather than dropped — getIFR skips
 * them, so the caller needs to see that the timing it asked for is not in force.
 */
export function describeTimeRelations(store: Store<any>): TimeRelationSummary[] {
  const summaries: TimeRelationSummary[] = []
  for (const cardId of Object.keys(store.getters.getFilterCards?.() ?? {})) {
    for (const filter of timeFiltersOf(store, cardId)) {
      if (!filter?.targetInteraction) continue
      summaries.push({
        card: cardId,
        relativeTo: filter.targetInteraction,
        description: describeTimeFilter(store, cardId, filter),
      })
    }
  }
  return summaries
}

// ---------------------------------------------------------------------------
// Cohort entry / exit (the chart toolbar's "Entry" and "Exit" buttons —
// CohortEntryExit.vue / CohortEntryExitButton.vue)
//
// Entry/exit does not decide WHO is in the cohort; it defines the OBSERVATION
// WINDOW the query measures over. query-gen-svc builds a separate
// PatientRequestEntryExit ("PEE") request whose window runs from the entry
// card's interaction *startdate* to the exit card's interaction *enddate*; with
// neither set, both default to `obsperiod` — the patient's whole observation
// period (createEntryExitCriteria, query-gen-svc InternalFilterRepresentation).
// So it is a different tool from set_time_relation: that constrains the gap
// BETWEEN two interactions, this re-anchors the window everything is observed in.
//
// Three properties make it worth typed ops rather than prose:
//
//  1. It is GATED PER DATASET (`panelOptions.cohortEntryExit`). With the flag off
//     the buttons are not rendered and the backend skips the override entirely,
//     so the flags would round-trip through the bookmark and change nothing about
//     the result. Every seeded D2E config currently ships the flag OFF, which
//     makes "unsupported" the common path, not an edge case.
//  2. Each role is SINGLE-VALUED. The button resets the role on every card before
//     flagging the chosen one (CohortEntryExitButton.handleClick), so "make B the
//     entry" also means "A is no longer the entry".
//  3. Only a CHARTABLE card can carry it: the menu lists getChartableFilterCards
//     minus Basic Data, and BMGetChartableCards drops exclusion cards, inactive
//     cards, and every card that shares an OR group. A flag on any of those is
//     written to the store, ignored by the query, and displayed nowhere.
// ---------------------------------------------------------------------------

/** The store prop / mutation key behind each role (Constants.CohortEntryExit). */
const ENTRY_EXIT_KEY: Record<EntryExitRole, 'isEntry' | 'isExit'> = {
  entry: 'isEntry',
  exit: 'isExit',
}

/** Which card holds each role, or null. Cohort-wide: both roles are single-valued. */
interface EntryExitSnapshot {
  entry: string | null
  exit: string | null
}

function normalizeEntryExitRole(role: unknown, opName: string): EntryExitRole {
  const normalized = String(role ?? '').toLowerCase()
  if (normalized === 'entry' || normalized === 'exit') return normalized
  throw new Error(
    `${opName}: role must be "entry" (the card that OPENS the observation window) or "exit" (the card that ` +
      `CLOSES it), got ${JSON.stringify(role)}.`
  )
}

const entryExitCardFor = (store: Store<any>, key: 'isEntry' | 'isExit'): string | null => {
  const cards = store.getters.getFilterCards?.() ?? {}
  return Object.keys(cards).find(id => cards[id]?.props?.[key]) ?? null
}

const snapshotEntryExit = (store: Store<any>): EntryExitSnapshot => ({
  entry: entryExitCardFor(store, 'isEntry'),
  exit: entryExitCardFor(store, 'isExit'),
})

/**
 * Whether this dataset exposes entry/exit at all — read from the same config the
 * toolbar reads (ChartController.vue's displayShowCohortEntryExit), so the op is
 * available exactly when the buttons are.
 */
function cohortEntryExitSupported(store: Store<any>): boolean {
  const config = store.getters.getMriFrontendConfig
  if (!config) return false
  try {
    if (typeof config.getPanelOptions === 'function') {
      return !!config.getPanelOptions('cohortEntryExit')
    }
  } catch {
    // getPanelOptions indexes panelOptions unguarded, so it throws on a
    // partially-loaded config. Fall through to the raw read the toolbar uses.
  }
  return !!config._internalConfig?.panelOptions?.cohortEntryExit
}

/**
 * Refuse to write a flag the query will ignore. Failing closed is the point: the
 * alternative is a cohort that reports an observation window it does not have,
 * which computes and renders exactly like a correct one.
 */
function assertCohortEntryExitSupported(store: Store<any>, opName: string): void {
  if (cohortEntryExitSupported(store)) return
  const reason = store.getters.getMriFrontendConfig
    ? "its PA config has panelOptions.cohortEntryExit off, so the builder's Entry/Exit buttons are hidden"
    : 'the PA frontend config is not loaded yet, so support cannot be confirmed'
  throw new Error(
    `${opName}: this dataset does not support cohort entry/exit — ${reason}. query-gen-svc only applies the ` +
      "override when that flag is on, so the observation window would stay the patient's full observation " +
      'period no matter what this op wrote. Tell the user the cohort cannot be anchored to an entry/exit event ' +
      'on this dataset rather than reporting a window that is not in force. If they want the TIMING BETWEEN two ' +
      'interactions, that is set_time_relation and it works here; if they want a fixed calendar window, put a ' +
      'date-range constraint on the card.'
  )
}

/**
 * Reject a card the builder's own Entry/Exit menu would not offer, before
 * anything is written. Mirrors CohortEntryExitButton's menu (getChartableFilterCards
 * minus Basic Data, with cards already holding the other role disabled) plus the
 * cards BMGetChartableCards drops on the way to that list.
 */
function assertEntryExitIsExpressible(store: Store<any>, filterCardId: string, role: EntryExitRole): void {
  if (filterCardId === BASIC_DATA_CARD) {
    throw new Error(
      'set_entry_exit: the Basic Data card cannot be the entry or exit event — it holds demographics, not an ' +
        'interaction with start/end dates, and the builder leaves it out of the Entry/Exit menu. Anchor the ' +
        'window to an interaction card (Condition Occurrence, Drug Exposure, …).'
    )
  }
  const props = store.getters.getFilterCard?.(filterCardId)?.props ?? {}
  if (props.excludeFilter) {
    throw new Error(
      `set_entry_exit: card "${filterCardId}" is an exclusion card. An event the cohort requires NOT to have ` +
        'cannot date the observation window, and the builder does not offer it — anchor the window to an ' +
        'included card.'
    )
  }
  if (props.inactive) {
    throw new Error(
      `set_entry_exit: card "${filterCardId}" is inactive, so it is not part of the query and cannot date the ` +
        'observation window. Activate it first, or anchor the window to an active card.'
    )
  }
  const loc = locateCard(store, filterCardId)
  if (!loc) {
    throw new Error(`set_entry_exit: card "${filterCardId}" is not in the cohort's filter tree.`)
  }
  if (loc.cards.length > 1) {
    throw new Error(
      `set_entry_exit: card "${filterCardId}" is OR-ed with ${loc.cards
        .filter(id => id !== filterCardId)
        .map(id => `"${id}"`)
        .join(', ')}, and an OR group cannot date the window (which interaction's date would it use?). The ` +
        'builder only offers cards that are alone in their group — split it out with set_card_join ' +
        '{ card, join:"AND" } first.'
    )
  }
  const otherRole: EntryExitRole = role === 'entry' ? 'exit' : 'entry'
  if (props[ENTRY_EXIT_KEY[otherRole]]) {
    throw new Error(
      `set_entry_exit: card "${filterCardId}" is already the cohort ${otherRole} event, and the builder disables ` +
        `a card that already holds a role. Use two different cards, or clear_entry_exit { role:"${otherRole}" } ` +
        'first if the window really should start and end on the same interaction.'
    )
  }
}

/**
 * The observation window as it stands, read back from the store.
 *
 * Reported alongside cardGroups/timeRelations for the same reason: the caller is
 * an LLM that has to tell the user what the cohort now means, and a window
 * anchored to an event is invisible in the constraint list.
 */
export function describeCohortEntryExit(store: Store<any>): CohortEntryExit {
  const flagged = (role: EntryExitRole) => {
    const id = entryExitCardFor(store, ENTRY_EXIT_KEY[role])
    return id ? { filterCardId: id, name: cardName(store, id) } : null
  }
  return {
    supported: cohortEntryExitSupported(store),
    entry: flagged('entry'),
    exit: flagged('exit'),
  }
}

// ---------------------------------------------------------------------------
// Concept-set domain check
//
// Every `conceptSet` attribute is configured with the OMOP domain its concepts
// must come from (`domainFilter`: "Condition", "Visit", "Drug", …) — that is what
// the UI's concept-set picker filters the vocabulary by. A set built for one
// domain matches nothing in another, so the same concept-set id cannot be
// correct on two attributes whose domains differ.
//
// The failure this closes: asked to widen a cohort to "Alzheimer's OR an ER
// visit", the model added the Visit card correctly and then filled its concept
// set with the ALZHEIMER'S set it already had in context — it never resolved
// "ER visit" at all. The cohort still computes, so nothing looks broken; it just
// answers a different question. Same-domain reuse stays legal (the same
// Condition set on a primary- and a secondary-diagnosis card is a real cohort).
// ---------------------------------------------------------------------------

function attributeDomain(store: Store<any>, attributePath: string): string {
  try {
    return store.getters.getMriFrontendConfig?.getAttributeByPath?.(attributePath)?.getDomainFilter?.() ?? ''
  } catch {
    // A path the config doesn't know is add_constraint's problem to report, not
    // this check's — an unknown domain simply skips the comparison.
    return ''
  }
}

/**
 * The first place this concept-set id is already filtered on under a DIFFERENT
 * domain, or undefined when there is none. Same-domain reuse is legal, and an
 * attribute whose domain the config doesn't state can't be judged either way.
 */
function findConceptSetDomainConflict(
  store: Store<any>,
  conceptSetId: string,
  targetDomain: string
): { card: string; attributePath: string; domain: string } | undefined {
  for (const cardId of Object.keys(store.getters.getFilterCards?.() ?? {})) {
    const constraints: any[] = store.getters.getFilterCardConstraints?.(cardId) ?? []
    for (const constraint of constraints) {
      if (constraint?.props?.type !== 'conceptSet') continue
      const values: any[] = Array.isArray(constraint.props.value) ? constraint.props.value : []
      if (!values.some(v => String(v?.value) === conceptSetId)) continue
      const attributePath = constraint.props.attributePath
      const domain = attributeDomain(store, attributePath)
      if (domain && domain !== targetDomain) return { card: cardId, attributePath, domain }
    }
  }
  return undefined
}

function assertConceptSetDomain(store: Store<any>, op: AddConstraintOp, conceptSetId: string): void {
  const targetDomain = attributeDomain(store, op.attributePath)
  if (!targetDomain) return
  const conflict = findConceptSetDomainConflict(store, conceptSetId, targetDomain)
  if (!conflict) return
  throw new Error(
    `Concept set ${conceptSetId} is already filtered on "${conflict.attributePath}" (card "${conflict.card}"), ` +
      `whose concepts are ${conflict.domain}-domain, but "${op.attributePath}" takes ${targetDomain}-domain ` +
      `concepts — one concept set cannot be both, so this would filter on the wrong term and match nothing. ` +
      `Resolve what the user asked for on THIS card into its own value: list_concept_sets / search_concepts for ` +
      `a ${targetDomain} concept set, or pa_search_attribute_values for a catalog attribute on this card. ` +
      'Never carry a concept-set id over from a different filter.'
  )
}

type AddConstraintOp = Extract<PatchOp, { op: 'add_constraint' }>

// Fields that carry a constraint value but are only meaningful INSIDE `value`.
// Seeing one at the top level of the op is the tell for the mistake below.
const MISPLACED_VALUE_KEYS = ['conceptSetId', 'conceptSetIds', 'conceptId', 'conceptIds', 'from', 'to', 'values']

const VALUE_SHAPE_HELP =
  'Pass value: <number|string> for a basic attribute, { from, to } for a date range, or ' +
  '{ conceptSetId, includeDescendants? } for a conceptSet attribute. ' +
  'To clear a filter use remove_constraint, not an empty value.'

/**
 * Reject an add_constraint that carries nothing to set.
 *
 * This is the single most dangerous op shape in the applier: applyConstraintValue
 * reads an empty value on a text/conceptSet attribute as "clear this filter", so
 * the patch reports success and leaves a filter card with no constraint — the
 * cohort then silently keeps every patient the filter was supposed to exclude.
 * That is a clinical error dressed as a working cohort, so fail loudly instead.
 */
function assertHasValue(op: AddConstraintOp): void {
  const v: any = op.value
  const isEmpty =
    typeof v === 'undefined' ||
    v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  if (!isEmpty) return

  const misplaced = MISPLACED_VALUE_KEYS.filter(k => k in (op as any))
  throw new Error(
    `add_constraint for "${op.attributePath}" has no value. ` +
      (misplaced.length
        ? `Found ${misplaced.join(', ')} at the top level of the op — ${
            misplaced.length > 1 ? 'they belong' : 'it belongs'
          } inside \`value\`. `
        : '') +
      VALUE_SHAPE_HELP
  )
}

/**
 * Post-condition for add_constraint: the value is really on the constraint now.
 *
 * The input check above catches the shapes we know about; this catches the rest.
 * Any normalization that quietly resolves to "no value" must fail the patch rather
 * than leave an empty filter behind and report success.
 */
function assertValueLanded(store: Store<any>, filterCardId: string, key: string, op: AddConstraintOp): any {
  const props = store.getters.getConstraintForAttribute?.({ filterCardId, key })?.props
  // Date constraints live in fromDate/toDate, everything else in a value array.
  if (Array.isArray(props?.value) && props.value.length > 0) {
    return props.value
  }
  if (typeof props?.fromDate?.value !== 'undefined' || typeof props?.toDate?.value !== 'undefined') {
    return { from: props?.fromDate?.value, to: props?.toDate?.value }
  }
  throw new Error(
    `Constraint for "${op.attributePath}" ended up empty after applying ${JSON.stringify(op.value)}. ` +
      VALUE_SHAPE_HELP
  )
}

// ---------------------------------------------------------------------------
// Date-range warnings
//
// A date range is the one constraint the model can fabricate out of nothing. Every
// other value has to come from a lookup — a concept set from list_concept_sets, a
// catalog token from pa_search_attribute_values, a number the user said — and a
// wrong one usually fails the patch or matches nothing. Dates need no lookup, so
// "2010-01-01 → 2015-12-31" applies cleanly, computes, renders, and quietly drops
// every patient outside a window nobody asked for.
//
// The failure this closes: asked for a prior-observation or follow-up requirement,
// the model adds the Observation Period card (right) and then puts an invented
// range on its start date (wrong) — the duration it was asked for belongs in
// set_time_relation, and the window in set_entry_exit. Neither is a calendar filter.
//
// The applier cannot know what the user said, so this does not reject: it makes
// the range impossible to leave unmentioned. Keyed on the constraint's DATE SLOT
// (props.fromDate/toDate — the { from, to } assertValueLanded reads back), not on
// any card or attribute path, so it holds on every dataset config.
// ---------------------------------------------------------------------------

/** A value that landed in the constraint's date slot — see assertValueLanded. */
const isDateRangeValue = (value: any): value is { from?: unknown; to?: unknown } =>
  !!value && typeof value === 'object' && !Array.isArray(value) && ('from' in value || 'to' in value)

// The bounds the OP asked for, not the Date objects read back from the store. The
// store deliberately shifts a date by the local timezone offset so that it
// SERIALISES to the intended calendar day (DateUtils.toUTCDate), which means
// formatting one back gives the neighbouring day in a negative-offset timezone —
// and a warning that misquotes the window is worse than none. The op's own strings
// are also what the model has to justify, so they are what it should see.
function requestedBounds(op: AddConstraintOp): { from: string; to: string } {
  const asText = (value: unknown): string => {
    const text = value == null ? '' : String(value)
    return text.trim() || 'unset'
  }
  const value: any = op.value
  if (isDateRangeValue(value)) {
    // applyConstraintValue falls back to the populated bound when only one is given.
    return { from: asText(value.from ?? value.to), to: asText(value.to ?? value.from) }
  }
  // A scalar date pins both ends of the range to the same day.
  const single = asText(typeof value === 'object' ? value?.value : value)
  return { from: single, to: single }
}

const attributeName = (store: Store<any>, attributePath: string): string => {
  try {
    return store.getters.getMriFrontendConfig?.getAttributeByPath?.(attributePath)?.getName?.() || attributePath
  } catch {
    return attributePath
  }
}

function describeDateRangeWarning(store: Store<any>, filterCardId: string, op: AddConstraintOp): string {
  const { from, to } = requestedBounds(op)
  return (
    `Date range ${from} → ${to} is now filtering "${attributeName(store, op.attributePath)}" (${
      op.attributePath
    }) on card "${cardName(store, filterCardId)}". That is an ABSOLUTE calendar filter: every patient whose ` +
    'record falls outside those dates is dropped from the cohort. Keep it ONLY if the user named those dates. ' +
    'If you added it to express a DURATION ("at least a year of prior observation", "within 90 days", ' +
    '"followed up for 6 months") or a vague period ("recent", "historical"), it is wrong and it is silently ' +
    'narrowing the cohort — remove it with remove_constraint and use set_time_relation for the gap between two ' +
    'interactions, or set_entry_exit for the observation window. Adding the card with NO date constraint is ' +
    'the correct way to say "the patient has such a record at all". If you do keep it, state the exact dates ' +
    'in your reply so the user can see the window you applied.'
  )
}

// ---------------------------------------------------------------------------
// Bounded-window warnings
//
// `within` is the second value the model can get wrong without anything stopping
// it, and for the same reason dates are the first: the op applies cleanly and the
// cohort computes. `mode` is optional and defaults to `within`, every worked
// example in the tool schema and the agent prompts reads `mode:"within",
// days:90`, and the readback renders `[0-90]` as "within 90 days" — which looks
// like a faithful echo of a user who said "90 days".
//
// The failure this closes: "two eGFR values, the 2nd at least 90 days after the
// 1st" becomes `[0-90]` — the exact COMPLEMENT of the request. Every patient the
// user wanted (gap of 90 days or more) is dropped, and every patient they
// excluded (the two labs drawn a week apart) is kept. "≥", "at least", "or
// more", "apart" are all `at_least`; only an upper bound is `within`.
//
// Like the date warning this does not reject — the applier cannot know what the
// user said, so it makes the bound impossible to leave unmentioned.
// ---------------------------------------------------------------------------

function describeBoundedWindowWarning(
  store: Store<any>,
  filterCardId: string,
  targetId: string,
  days: number,
  modeWasDefaulted: boolean
): string {
  return (
    `Time relation "${cardName(store, filterCardId)}" → "${cardName(store, targetId)}" landed as the CLOSED ` +
    `window 0–${days} days${modeWasDefaulted ? ' (no `mode` was given, so it defaulted to "within")' : ''}. ` +
    `It requires the two interactions to be AT MOST ${days} days apart: a patient whose gap is ${days + 1} days ` +
    'or more is DROPPED. That is the right reading of "within N days" / "in the N days following" and nothing ' +
    'else. If the user said "at least", "≥", "or more", "no sooner than", "N days apart" or "after N days", ' +
    `this is the COMPLEMENT of what they asked for — re-issue the op with mode:"at_least", days:${days}. For a ` +
    'floor AND a ceiling use mode:"between" with minDays/maxDays. If 0–' +
    `${days} really is the window they described, say "within ${days} days" in your reply so they can see the ` +
    'bound you applied.'
  )
}

/**
 * Apply a list of typed patch ops to the live cohort in `store`.
 *
 * Atomic, with one documented exception: if any op fails, everything this patch
 * added (cards, constraints, values) or regrouped is undone, a constraint it
 * removed is put back, and the error is rethrown. A card removed by `remove_card`
 * is NOT restored — re-adding it would mint a new instance id and lose the
 * constraints that hung off it, and a half-restored card is a worse lie than a
 * missing one. So put `remove_card` last in a patch, or send it on its own.
 */
export async function applyCohortPatch(store: Store<any>, patchOps: PatchOp[]): Promise<ApplyCohortPatchResult> {
  if (!Array.isArray(patchOps) || patchOps.length === 0) {
    throw new Error('patchOps must be a non-empty array')
  }
  const dispatch = (action: string, payload?: unknown) => store.dispatch(action, payload)

  // ref (local handle from add_card) -> real filterCardId, so later ops can
  // target a card created earlier in the same patch.
  const refMap = new Map<string, string>()
  const rollback: Rollback = {
    createdCardIds: [],
    priorConstraintValues: [],
    createdConstraints: [],
    removedConstraints: [],
    removedCardIds: [],
    priorAxes: snapshotAxes(store),
    joinChanges: [],
    priorTimeFilters: [],
    priorEntryExit: [],
  }

  const resolveCard = (card: string): string => {
    const id = refMap.get(card) ?? card
    const cards = store.getters.getFilterCards?.() ?? {}
    if (!cards[id]) {
      throw new Error(`Unknown card "${card}". Create it with add_card or pass a real filterCardId.`)
    }
    return id
  }

  const appliedConstraints: NonNullable<ApplyCohortPatchResult['appliedConstraints']> = []
  const warnings: string[] = []

  await dispatch('holdFireRequest')
  try {
    for (const rawOp of patchOps) {
      await applyOne(dispatch, store, rawOp, refMap, rollback, resolveCard, appliedConstraints, warnings)
    }
  } catch (err) {
    await revert(dispatch, rollback, store)
    await dispatch('releaseFireRequest')
    throw err instanceof Error ? err : new Error(String(err))
  }

  // Grouping cards together runs the store's resetAxes, which clears every axis
  // bound to a card in a container that now holds more than one card. That is
  // fine when the user clicks the OR button (they can re-pick), but here it
  // would leave the cohort with an empty axisSelection — analytics-svc then
  // emits `SELECT  FROM …` and the DB rejects it, so the count reads "--".
  // Put back only the axes whose card still exists.
  await restoreClearedAxes(dispatch, store, rollback.priorAxes)

  await dispatch('releaseFireRequest')
  await dispatch('setFireRequest')
  await dispatch('refreshPatientCount')
  const cohortEntryExit = describeCohortEntryExit(store)
  // Report the window when there is something to say — see ApplyCohortPatchResult.
  // `priorEntryExit` is part of that test, not just the current state: a patch that
  // CLEARED the last flag on an unsupported dataset ends with nothing set, and the
  // caller still needs to see that its op landed.
  const reportEntryExit =
    cohortEntryExit.supported || !!cohortEntryExit.entry || !!cohortEntryExit.exit || rollback.priorEntryExit.length > 0
  return {
    applied: true,
    createdCards: [...rollback.createdCardIds],
    appliedConstraints,
    cardGroups: describeCardGroups(store),
    timeRelations: describeTimeRelations(store),
    ...(reportEntryExit ? { cohortEntryExit } : {}),
    // Omitted when there is nothing to warn about — this result is resent on
    // every agent turn, so an always-present empty array is pure context burn.
    ...(warnings.length ? { warnings } : {}),
  }
}

/**
 * The current AND/OR structure, read back from the store after the patch.
 *
 * The caller is an LLM that has to tell the user what the cohort now means, and
 * "OR" is not visible anywhere in `appliedConstraints` — it lives in how the
 * cards are grouped. Reporting it here is also what lets a follow-up patch
 * target the right card without re-reading the whole cohort.
 */
export function describeCardGroups(store: Store<any>): CardGroup[] {
  return containerIdsOf(store)
    .map(containerId => ({
      // Cards within a group are OR-ed; the groups themselves are AND-ed.
      cards: cardsInContainer(store, containerId).map(id => ({
        filterCardId: id,
        name: store.getters.getFilterCard?.(id)?.props?.name ?? id,
        ...(isExclusionCard(store, id) ? { exclude: true } : {}),
      })),
    }))
    .filter(group => group.cards.length > 0)
}

async function restoreClearedAxes(
  dispatch: (a: string, p?: unknown) => Promise<any>,
  store: Store<any>,
  priorAxes: AxisSnapshot[]
): Promise<void> {
  const cards = store.getters.getFilterCards?.() ?? {}
  const current = snapshotAxes(store)
  for (const axis of priorAxes) {
    const stillBound = current[axis.id]?.props?.attributeId
    if (stillBound || !axis.props.attributeId || !cards[axis.props.filterCardId]) continue
    try {
      await dispatch('setAxisValue', { id: axis.id, props: axis.props })
    } catch (e) {
      console.error('[cohortPatch] restoring axis after grouping change failed', e)
    }
  }
}

async function applyOne(
  dispatch: (a: string, p?: unknown) => Promise<any>,
  store: Store<any>,
  op: PatchOp,
  refMap: Map<string, string>,
  rollback: Rollback,
  resolveCard: (card: string) => string,
  applied: NonNullable<ApplyCohortPatchResult['appliedConstraints']>,
  warnings: string[]
): Promise<void> {
  switch (op.op) {
    case 'add_card': {
      // Fail fast on a bad path with a recoverable message, instead of a generic
      // store error (or a silently-malformed card). Skip when config isn't loaded.
      const config = store.getters.getMriFrontendConfig
      if (config?.getFilterCards) {
        const validPaths: string[] = (config.getFilterCards() ?? []).map((c: any) => c.getConfigPath())
        if (!validPaths.includes(op.cardConfigPath)) {
          throw new Error(
            `Unknown cardConfigPath "${op.cardConfigPath}". Use pa_list_filter_options (or the ` +
              'validFilterOptions returned on this error) for the valid card paths.'
          )
        }
      }
      // Single-instance cards (Basic Data) must never be added twice. An indexed
      // card gets an instance id with a trailing number
      // ("…conditionoccurrence.1"), so a card whose instance id IS the config path
      // is the singleton — and the store would happily create a SECOND card under
      // that same id. The IFR then carries "patient" in two bool containers, so
      // every constraint on it is emitted twice (`age < 100 AND age < 100`) and
      // deleting either copy clears the chart axes bound to the id that survives.
      // A model that adds Basic Data before constraining Age/Gender is doing the
      // reasonable thing; reuse what is already there.
      const existing = store.getters.getFilterCards?.() ?? {}
      if (existing[op.cardConfigPath]) {
        if (op.ref) refMap.set(op.ref, op.cardConfigPath)
        return
      }
      // `orWith` puts the new card in the SAME bool container as an existing one,
      // which is how the builder represents OR. Without it the store opens a new
      // container and the card is AND-ed (the default, and the right one for
      // "sinusitis AND a drug exposure").
      let boolFilterContainerId: string | undefined
      if (op.orWith) {
        const target = resolveCard(op.orWith)
        assertNotBasicData([target], `add_card orWith:"${op.orWith}"`)
        const loc = locateCard(store, target)
        if (!loc) {
          throw new Error(
            `add_card orWith:"${op.orWith}" — card "${target}" is not in the cohort's filter tree, so there is ` +
              'no group to join. Pass the filterCardId of a card that is on the cohort, or an add_card `ref` ' +
              'created earlier in this same patch.'
          )
        }
        // Not just the target: joining its GROUP ORs the new card with every card
        // in it, so Basic Data sharing that group is the same silent widening.
        assertNotBasicData(loc.cards, `add_card orWith:"${op.orWith}"`)
        if ((op.exclude ?? false) !== isExclusionCard(store, target)) {
          throw new Error(
            `add_card orWith:"${op.orWith}" cannot OR an ${op.exclude ? 'exclusion' : 'inclusion'} card with an ` +
              `${op.exclude ? 'inclusion' : 'exclusion'} one — they are separate sections of the builder. ` +
              'OR cards of the same kind.'
          )
        }
        boolFilterContainerId = loc.containerId
      }
      const filterCardId = (await dispatch('addFilterCard', {
        configPath: op.cardConfigPath,
        isExclusion: op.exclude ?? false,
        ...(boolFilterContainerId ? { boolFilterContainerId } : {}),
      })) as string
      rollback.createdCardIds.push(filterCardId)
      if (op.ref) refMap.set(op.ref, filterCardId)
      return
    }
    case 'set_card_join': {
      // Change how a card ALREADY on the cohort combines with the card before it.
      // Both branches dispatch exactly what the AND/OR buttons dispatch, so an
      // AI-driven regroup and a click produce the same tree.
      const join = String((op as any).join ?? '').toUpperCase()
      if (join !== 'AND' && join !== 'OR') {
        throw new Error(`set_card_join: join must be "AND" or "OR" (got ${JSON.stringify((op as any).join)}).`)
      }
      const filterCardId = resolveCard(op.card)
      if (filterCardId === BASIC_DATA_CARD) {
        throw new Error(
          'set_card_join: the Basic Data card is always AND-ed with the rest of the cohort — its demographics ' +
            'apply to every patient the other cards match. Regroup the interaction cards instead.'
        )
      }
      const loc = locateCard(store, filterCardId)
      if (!loc) {
        throw new Error(`set_card_join: card "${op.card}" is not in the cohort's filter tree.`)
      }
      if (join === 'OR') {
        // Already OR-ed with the card before it in the same group: nothing to do.
        if (loc.indexInContainer > 0) return
        const prev = previousContainerFor(store, loc)
        if (!prev) {
          throw new Error(
            `set_card_join: "${filterCardId}" is the first filter card, so there is nothing before it to OR it ` +
              'with. Set the join on the LATER card of the pair.'
          )
        }
        assertNotBasicData(prev.cards, `set_card_join OR on "${filterCardId}"`)
        // Merges this card's container into the previous one → they share a
        // container → Or(...) in the IFR.
        await dispatch('toggleFilterContainerBooleanCondition', {
          filterContainerId: loc.containerId,
          parentId: store.getters.getBoolContainerRoot?.(),
        })
        rollback.joinChanges.push({ card: filterCardId, undo: 'split' })
        return
      }
      // AND: already the first card of its own group → already AND-ed.
      if (loc.indexInContainer === 0) return
      // Splits this card (and any card after it in the group) into a new
      // container → AND with what precedes it.
      await dispatch('toggleFilterBooleanCondition', { filterCardId, parentId: loc.containerId })
      rollback.joinChanges.push({ card: filterCardId, undo: 'merge' })
      return
    }
    case 'add_constraint': {
      assertHasValue(op)
      // Before anything is mutated: a concept set that belongs to another
      // domain is a wrong-cohort bug, not a rendering one.
      if (isConceptSetValue(op.value)) {
        assertConceptSetDomain(store, op, String(op.value.conceptSetId))
      }
      const filterCardId = resolveCard(op.card)
      const key = getFieldAttrKey(op.attributePath)
      let constraint = store.getters.getConstraintForAttribute?.({ filterCardId, key })
      if (constraint) {
        // Snapshots the date slot as well as `value` — see ConstraintValueSnapshot.
        rollback.priorConstraintValues.push(snapshotConstraintValue(constraint))
      } else {
        const constraintId = (await dispatch('addFilterCardConstraint', { filterCardId, key })) as string
        rollback.createdConstraints.push({ filterCardId, constraintId })
        constraint = store.getters.getConstraintForAttribute?.({ filterCardId, key })
      }
      if (!constraint) {
        throw new Error(`Could not create constraint for "${op.attributePath}" on card "${op.card}".`)
      }
      if (isConceptSetValue(op.value)) {
        await dispatch('updateConstraintValue', {
          constraintId: constraint.id,
          value: [
            {
              value: String(op.value.conceptSetId),
              text: op.value.displayValue ?? String(op.value.conceptSetId),
              display_value: op.value.displayValue ?? String(op.value.conceptSetId),
              includeDescendants: op.value.includeDescendants ?? false,
            },
          ],
        })
      } else {
        await applyConstraintValue(dispatch, constraint, op.value, op.operator ?? '=')
      }
      const landed = assertValueLanded(store, filterCardId, key, op)
      applied.push({ card: filterCardId, attributePath: op.attributePath, value: landed })
      // Read the KIND off what landed (the date slot), not off the op — a scalar
      // date and a { from, to } both end up here, and neither the card nor the
      // attribute path is a reliable tell across dataset configs.
      if (isDateRangeValue(landed)) {
        warnings.push(describeDateRangeWarning(store, filterCardId, op))
      }
      return
    }
    case 'remove_constraint': {
      const filterCardId = resolveCard(op.card)
      const key = getFieldAttrKey(op.attributePath)
      const constraint = store.getters.getConstraintForAttribute?.({ filterCardId, key })
      if (constraint) {
        // Snapshot before deleting: a later op can still fail the patch, and atomic
        // has to mean the filter the user had comes back — not merely that nothing
        // new was added. A dropped filter that survives a failed patch leaves the
        // cohort permanently wider than the user was told it is.
        rollback.removedConstraints.push({ filterCardId, key, snapshot: snapshotConstraintValue(constraint) })
        await dispatch('deleteFilterCardConstraint', { filterCardId, constraintId: constraint.id })
      }
      return
    }
    case 'set_time_relation': {
      if (!op.relativeTo) {
        throw new Error(
          'set_time_relation needs `relativeTo`: the card the timing is measured against. `card` is the later ' +
            'interaction, `relativeTo` the index one — e.g. card: the prescription, relativeTo: the diagnosis.'
        )
      }
      const filterCardId = resolveCard(op.card)
      const targetId = resolveCard(op.relativeTo)
      assertTimeRelationIsExpressible(store, filterCardId, targetId)

      const modeWasDefaulted = op.mode == null
      const mode = (op.mode ?? 'within') as TimeRelationMode
      const direction = op.direction ?? 'after'
      if (direction !== 'after' && direction !== 'before') {
        throw new Error(`set_time_relation: direction must be "after" or "before" (got ${JSON.stringify(direction)}).`)
      }
      const isOverlap = mode === 'overlaps'
      const next: StoredTimeFilter = {
        originSelection: isOverlap ? 'overlap' : anchorField(op.fromDate ?? 'start'),
        // Overlap ignores the target anchor, but the field must still hold a
        // value the panel can look up: AdvancedTime.vue resolves it against its
        // option list on mount and throws on an unknown key. This is the same
        // placeholder AdvancedTimeFilterModel.createAdvancedTimeFilterModel uses.
        targetSelection: isOverlap
          ? 'before_startdate'
          : (`${direction}_${anchorField(op.toDate ?? 'start')}` as StoredTimeFilter['targetSelection']),
        targetInteraction: targetId,
        days: isOverlap ? '' : buildDaysExpression(op, mode),
      }

      const current = timeFiltersOf(store, filterCardId)
      rollback.priorTimeFilters.push({ filterCardId, timeFilters: cloneTimeFilters(current) })
      // Replace the relation to THIS target and keep the others: a card can be
      // timed against several interactions, and each op should only speak for
      // the pair it names. Entries the panel left half-filled (no target) are
      // dropped — getIFR ignores them anyway.
      const timeFilters = current
        .filter(f => f?.targetInteraction && f.targetInteraction !== targetId)
        .map(f => ({ ...f }))
      timeFilters.push(next)
      await dispatch('updateFilterCardTimeFilter', { filterCardId, timeFilters })

      // Post-condition: getIFR drops a relation with an empty target or an
      // unparseable `days` silently, so confirm it is really on the card.
      const landed = timeFiltersOf(store, filterCardId).find(f => f?.targetInteraction === targetId)
      if (!landed) {
        throw new Error(
          `set_time_relation: the relation between "${filterCardId}" and "${targetId}" did not land on the card.`
        )
      }
      if (mode === 'within') {
        warnings.push(
          describeBoundedWindowWarning(store, filterCardId, targetId, op.days as number, modeWasDefaulted)
        )
      }
      return
    }
    case 'clear_time_relation': {
      const filterCardId = resolveCard(op.card)
      const current = timeFiltersOf(store, filterCardId)
      if (current.length === 0) return
      const targetId = op.relativeTo ? resolveCard(op.relativeTo) : undefined
      rollback.priorTimeFilters.push({ filterCardId, timeFilters: cloneTimeFilters(current) })
      const timeFilters = targetId
        ? current.filter(f => f?.targetInteraction !== targetId).map(f => ({ ...f }))
        : []
      await dispatch('updateFilterCardTimeFilter', { filterCardId, timeFilters })
      return
    }
    case 'set_entry_exit': {
      // Support first: on a dataset with the flag off this is the only outcome,
      // and it costs nothing to reach before touching the store.
      assertCohortEntryExitSupported(store, 'set_entry_exit')
      const role = normalizeEntryExitRole((op as any).role, 'set_entry_exit')
      const filterCardId = resolveCard(op.card)
      assertEntryExitIsExpressible(store, filterCardId, role)
      const key = ENTRY_EXIT_KEY[role]

      rollback.priorEntryExit.push(snapshotEntryExit(store))
      // Exactly what the menu dispatches (CohortEntryExitButton.handleClick):
      // clear the role everywhere, then flag the chosen card. The reset is not
      // redundant — the role is single-valued, and skipping it would leave two
      // cards claiming it, which the query resolves by whichever it walks last.
      await dispatch('resetAllFilterCardEntryExit', { key })
      await dispatch('updateCohortEntryExit', { filterCardId, key, toggle: true })

      // Post-condition, as for set_time_relation: a flag that did not land would
      // otherwise be reported as an observation window the cohort does not have.
      if (!store.getters.getFilterCard?.(filterCardId)?.props?.[key]) {
        throw new Error(`set_entry_exit: the ${role} flag did not land on card "${filterCardId}".`)
      }
      return
    }
    case 'clear_entry_exit': {
      // Deliberately NOT gated on dataset support: clearing can only remove a
      // window, never assert one that isn't in force, and a bookmark saved while
      // the flag was on still carries the flags after it is turned off.
      const role =
        (op as any).role === undefined ? undefined : normalizeEntryExitRole((op as any).role, 'clear_entry_exit')
      const before = snapshotEntryExit(store)
      if (role ? !before[role] : !before.entry && !before.exit) return
      rollback.priorEntryExit.push(before)
      // key:null is the store's "clear both" (FILTERCARD_RESET_ALL_ENTRY_EXIT),
      // the same call BoolFilterContainer makes when the tree is rebuilt.
      await dispatch('resetAllFilterCardEntryExit', { key: role ? ENTRY_EXIT_KEY[role] : null })
      return
    }
    case 'remove_card': {
      const filterCardId = resolveCard(op.card)
      await dispatch('deleteFilterCard', { filterCardId })
      rollback.removedCardIds.push(filterCardId)
      return
    }
    default:
      throw new Error(`Unknown patch op: ${JSON.stringify((op as any).op)}`)
  }
}

// Undo a partially-applied patch, mirroring revertFieldChanges in
// useDashboardFlow: restore prior constraint values, drop constraints and cards
// created during this patch, and put the chart's axis selection back the way it
// was. Best-effort — individual failures are swallowed so one bad undo can't
// mask the original error.
async function revert(
  dispatch: (a: string, p?: unknown) => Promise<any>,
  rollback: Rollback,
  store: Store<any>
): Promise<void> {
  // Grouping first, while the cards this patch created are still present: a
  // merge/split is expressed in terms of a card's CURRENT container, so undoing
  // it after the card is gone would have nothing to locate.
  for (const { card, undo } of rollback.joinChanges.reverse()) {
    try {
      const loc = locateCard(store, card)
      if (!loc) continue
      if (undo === 'split' && loc.indexInContainer > 0) {
        await dispatch('toggleFilterBooleanCondition', { filterCardId: card, parentId: loc.containerId })
      } else if (undo === 'merge' && loc.indexInContainer === 0 && previousContainerFor(store, loc)) {
        await dispatch('toggleFilterContainerBooleanCondition', {
          filterContainerId: loc.containerId,
          parentId: store.getters.getBoolContainerRoot?.(),
        })
      }
    } catch (e) {
      console.error('[cohortPatch] revert join change failed', e)
    }
  }
  // Temporal relations before the cards they point at are torn down: restoring
  // in reverse leaves the OLDEST snapshot applied last, i.e. the state this
  // patch found.
  for (const { filterCardId, timeFilters } of rollback.priorTimeFilters.reverse()) {
    try {
      await dispatch('updateFilterCardTimeFilter', { filterCardId, timeFilters: cloneTimeFilters(timeFilters) })
    } catch (e) {
      console.error('[cohortPatch] revert updateFilterCardTimeFilter failed', e)
    }
  }
  // Entry/exit likewise before the cards are torn down, and oldest-snapshot-last
  // so the cohort ends on the window this patch found. Each restore rewrites both
  // roles from scratch (clear, then re-flag) because a role is single-valued: a
  // partial restore would silently leave the window open at one end.
  for (const { entry, exit } of rollback.priorEntryExit.reverse()) {
    try {
      await dispatch('resetAllFilterCardEntryExit', { key: null })
      for (const [filterCardId, key] of [
        [entry, 'isEntry'],
        [exit, 'isExit'],
      ] as const) {
        // Skip a card this patch created (revert deletes it below) or removed:
        // flagging a card that is about to vanish leaves no window at all, which
        // is the same state as not restoring it.
        if (!filterCardId || !(store.getters.getFilterCards?.() ?? {})[filterCardId]) continue
        await dispatch('updateCohortEntryExit', { filterCardId, key, toggle: true })
      }
    } catch (e) {
      console.error('[cohortPatch] revert entry/exit failed', e)
    }
  }
  for (const snapshot of rollback.priorConstraintValues.reverse()) {
    await restoreConstraintValue(dispatch, snapshot)
  }
  // Drop what the patch created BEFORE putting back what it removed.
  for (const { filterCardId, constraintId } of rollback.createdConstraints.reverse()) {
    try {
      await dispatch('deleteFilterCardConstraint', { filterCardId, constraintId })
    } catch (e) {
      console.error('[cohortPatch] revert deleteFilterCardConstraint failed', e)
    }
  }
  // Put back what remove_constraint took. Before the created cards are deleted
  // below, so the card a constraint belongs to is still there to re-add it to.
  for (const { filterCardId, key, snapshot } of rollback.removedConstraints.reverse()) {
    try {
      await dispatch('addFilterCardConstraint', { filterCardId, key })
      const recreated = store.getters.getConstraintForAttribute?.({ filterCardId, key })
      if (recreated) {
        await restoreConstraintValue(dispatch, { ...snapshot, constraintId: recreated.id })
      }
    } catch (e) {
      console.error('[cohortPatch] revert remove_constraint failed', e)
    }
  }
  for (const filterCardId of rollback.createdCardIds.reverse()) {
    try {
      await dispatch('deleteFilterCard', { filterCardId })
    } catch (e) {
      console.error('[cohortPatch] revert deleteFilterCard failed', e)
    }
  }
  // Last: deleteFilterCard above cleared any axis pointing at a card it removed,
  // so the axis selection is restored after the cards, not before.
  for (const { id, props } of rollback.priorAxes) {
    // Except an axis bound to a card remove_card deleted: that card is gone for
    // good (see applyCohortPatch), and re-pointing the chart at it would send the
    // query out with a filterCardId the IFR no longer contains.
    if (props.filterCardId && rollback.removedCardIds.includes(props.filterCardId)) continue
    try {
      await dispatch('setAxisValue', { id, props })
    } catch (e) {
      console.error('[cohortPatch] revert setAxisValue failed', e)
    }
  }
}
