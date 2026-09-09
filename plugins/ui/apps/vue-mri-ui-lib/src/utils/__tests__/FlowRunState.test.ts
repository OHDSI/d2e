import { describe, expect, it } from 'vitest'
import { isFlowRunCompleted, isFlowRunInProgress } from '../FlowRunState'

// Prefect reports a flow run's state twice: `state.type` is the uppercase enum
// (RUNNING) and `state_name` is its title-case label (Running), with extra
// labels such as "Late" that have no matching type.
describe('isFlowRunInProgress', () => {
  it('treats a freshly created run as in progress', () => {
    // The reported repro: clicking the DQD button twice in quick succession.
    // Prefect has not started the run yet, so it is Scheduled, not Running.
    expect(isFlowRunInProgress({ state: { type: 'SCHEDULED' }, state_name: 'Scheduled' })).toBe(true)
  })

  it('treats a running run as in progress', () => {
    expect(isFlowRunInProgress({ state: { type: 'RUNNING' }, state_name: 'Running' })).toBe(true)
  })

  it.each(['Scheduled', 'Late', 'AwaitingRetry', 'Pending', 'Paused', 'Running', 'Retrying', 'Resuming'])(
    'treats state_name %s as in progress when no state object is present',
    stateName => {
      expect(isFlowRunInProgress({ state_name: stateName })).toBe(true)
    }
  )

  it.each(['SCHEDULED', 'PENDING', 'PAUSED', 'RUNNING'])('treats state.type %s as in progress', type => {
    expect(isFlowRunInProgress({ state: { type } })).toBe(true)
  })

  it.each([
    { state: { type: 'COMPLETED' }, state_name: 'Completed' },
    { state: { type: 'FAILED' }, state_name: 'Failed' },
    { state: { type: 'CRASHED' }, state_name: 'Crashed' },
    { state: { type: 'CANCELLED' }, state_name: 'Cancelled' },
  ])('does not treat terminal run $state_name as in progress', flowRun => {
    expect(isFlowRunInProgress(flowRun)).toBe(false)
  })

  it('handles a missing flow run', () => {
    expect(isFlowRunInProgress(null)).toBe(false)
    expect(isFlowRunInProgress(undefined)).toBe(false)
    expect(isFlowRunInProgress({})).toBe(false)
  })
})

describe('isFlowRunCompleted', () => {
  it('reads state.type', () => {
    expect(isFlowRunCompleted({ state: { type: 'COMPLETED' } })).toBe(true)
  })

  it('falls back to state_name', () => {
    expect(isFlowRunCompleted({ state_name: 'Completed' })).toBe(true)
  })

  it.each([
    { state: { type: 'RUNNING' }, state_name: 'Running' },
    { state: { type: 'FAILED' }, state_name: 'Failed' },
  ])('rejects non-completed run $state_name', flowRun => {
    expect(isFlowRunCompleted(flowRun)).toBe(false)
  })

  it('handles a missing flow run', () => {
    expect(isFlowRunCompleted(null)).toBe(false)
  })
})
