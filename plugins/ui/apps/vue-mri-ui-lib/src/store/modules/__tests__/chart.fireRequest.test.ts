import { vi, describe, expect, it } from 'vitest'

vi.mock('axios')
vi.mock('../../stores/notifications', () => ({
  useNotificationStore: () => ({
    setToastMessage: vi.fn(),
    setAlertMessage: vi.fn(),
  }),
}))
vi.mock('@/store', () => ({
  default: {
    getters: {},
    dispatch: vi.fn(),
    commit: vi.fn(),
  },
}))

import chartModule from '../chart'
import queryModule from '../query'
import * as types from '../../mutation-types'

// setFireRequest only flips a flag that a mounted chart component watches; the count
// and chart are rewritten seconds later, when that component's analytics query
// resolves. These cover the staleness flag that marks the gap — without it a read
// landing mid-flight gets the PREVIOUS cohort's result and cannot tell. The count
// and chart themselves must be left alone: the flag is a side channel, so the UI
// keeps showing the old number exactly as it always has.
const context = ({ held = false, bookmarksData = { cards: ['c1'] } }: any = {}) => ({
  commit: vi.fn(),
  dispatch: vi.fn(),
  state: { fireRequestHeld: held },
  rootGetters: { getBookmarksData: bookmarksData },
})

describe('store - chart setFireRequest result invalidation', () => {
  it('flags the previous cohort count as stale before firing the new query', () => {
    const ctx = context()

    chartModule.actions.setFireRequest(ctx)

    expect(ctx.dispatch).toHaveBeenCalledWith('invalidateCurrentPatientCount')
    expect(ctx.commit).toHaveBeenCalledWith(types.CHART_SET_FIRE_REQUEST)
  })

  // The whole point of the side channel: what the user sees must not change. Blanking
  // the count or dropping the response is what an earlier version did, and it replaced
  // the visible number with a placeholder for 7-24s.
  it('leaves the displayed count and the chart response untouched', () => {
    const ctx = context()

    chartModule.actions.setFireRequest(ctx)

    expect(ctx.dispatch).not.toHaveBeenCalledWith('clearResponse')
    expect(ctx.dispatch).not.toHaveBeenCalledWith('setCurrentPatientCount', expect.anything())
  })

  // A held fire request fires nothing, so flagging here would strand the flag:
  // applyCohortPatch holds across every op in a patch and releases at the end.
  it('does not flag while the fire request is held', () => {
    const ctx = context({ held: true })

    chartModule.actions.setFireRequest(ctx)

    expect(ctx.dispatch).not.toHaveBeenCalled()
    expect(ctx.commit).not.toHaveBeenCalled()
  })

  // The chart components skip the request when there is no bookmark to query
  // (StackBarChart.getFireRequest), so nothing would ever write a count back and the
  // flag would stay raised, making pa_get_cohort_result wait out its full timeout.
  it.each([
    ['an empty bookmark', {}],
    ['no bookmark at all', undefined],
  ])('still fires but does not flag with %s', (_label, bookmarksData) => {
    // Built inline rather than via context(): passing an explicitly-undefined
    // property would re-trigger that helper's default bookmark.
    const ctx = {
      commit: vi.fn(),
      dispatch: vi.fn(),
      state: { fireRequestHeld: false },
      rootGetters: { getBookmarksData: bookmarksData },
    }

    chartModule.actions.setFireRequest(ctx)

    expect(ctx.dispatch).not.toHaveBeenCalled()
    expect(ctx.commit).toHaveBeenCalledWith(types.CHART_SET_FIRE_REQUEST)
  })
})

// The middle link of the chain: chart.setFireRequest raises the flag through the
// query module, and the count mutation every resolved query goes through lowers it.
// Exercised against the REAL query module, because the piece that has to hold is
// that the getter pa_get_cohort_result polls is driven by the action and mutations
// that actually run in the app — not by a mock that agrees with the tool.
describe('store - query currentPatientCount staleness flag', () => {
  const queryState = () => ({ ...(queryModule.state as any) })

  it('starts down, so a read before any edit does not block', () => {
    const state = queryState()

    expect(queryModule.getters.isCurrentPatientCountStale(state)).toBe(false)
  })

  it('invalidateCurrentPatientCount raises it without touching the count', () => {
    const state = queryState()
    state.currentPatientCount = 4102
    const commit = (type: string, payload: any) => queryModule.mutations[type](state, payload)

    queryModule.actions.invalidateCurrentPatientCount({ commit } as any)

    expect(queryModule.getters.isCurrentPatientCountStale(state)).toBe(true)
    // The whole point: the number on screen is left alone.
    expect(state.currentPatientCount).toBe(4102)
  })

  it.each([
    ['a real count', 1275],
    // '--' is what the chart components write when the query FAILS. It has to clear
    // the flag too, or pa_get_cohort_result would wait out its full 60s timeout on a
    // cohort that already has its answer (an error).
    ['a failed query', '--'],
  ])('writing %s lowers it again', (_label, currentPatientCount) => {
    const state = queryState()
    state.currentPatientCountStale = true

    queryModule.mutations[types.SET_CURRENT_PATIENT_COUNT](state, { currentPatientCount })

    expect(queryModule.getters.isCurrentPatientCountStale(state)).toBe(false)
    expect(state.currentPatientCount).toBe(currentPatientCount)
  })

  // refreshPatientCount runs right after setFireRequest in applyCohortPatch. It only
  // ever writes the TOTAL, and if it cleared the flag the tool would stop waiting
  // before the chart query it is waiting for had even come back.
  it('is not lowered by a total-count write', () => {
    const state = queryState()
    state.currentPatientCountStale = true

    queryModule.mutations[types.SET_TOTAL_PATIENT_COUNT](state, { totalPatientCount: 2694 })

    expect(queryModule.getters.isCurrentPatientCountStale(state)).toBe(true)
  })
})
