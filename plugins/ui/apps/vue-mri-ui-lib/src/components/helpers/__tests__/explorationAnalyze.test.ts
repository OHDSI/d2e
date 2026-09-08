import { describe, expect, it } from 'vitest'
import {
  analyzeBookmarkId,
  isDashboardFlowOpen,
  shouldResetDashboardFlow,
} from '../explorationAnalyze'

describe('analyzeBookmarkId', () => {
  it('returns the bookmark id from the card view model', () => {
    expect(analyzeBookmarkId({ source: { bookmark: { id: 'bmk-1' } } })).toBe('bmk-1')
  })

  it('refuses a cohort-definition or Atlas record, which have no bookmark id', () => {
    // Those ids come from other tables and can collide with a bookmark id;
    // getBookmarkById would throw or address a different exploration.
    expect(analyzeBookmarkId({ source: { cohortDefinition: { id: 'cd-1' } } })).toBeNull()
    expect(analyzeBookmarkId({ source: { atlasCohortDefinition: { id: 'atlas-1' } } })).toBeNull()
  })

  it('reads source, not the flat view model, which has no bookmark', () => {
    // The grid maps each record into { id, source, name, bmkId, ... }.
    expect(analyzeBookmarkId({ bookmark: { id: 'bmk-1' } })).toBeNull()
  })

  it('is null for an empty id, a missing source and a missing card', () => {
    expect(analyzeBookmarkId({ source: { bookmark: { id: '' } } })).toBeNull()
    expect(analyzeBookmarkId({ source: {} })).toBeNull()
    expect(analyzeBookmarkId({})).toBeNull()
    expect(analyzeBookmarkId(null)).toBeNull()
    expect(analyzeBookmarkId(undefined)).toBeNull()
  })

  it('is null for a non-string id rather than passing it through', () => {
    expect(analyzeBookmarkId({ source: { bookmark: { id: 42 } } })).toBeNull()
  })
})

describe('isDashboardFlowOpen', () => {
  const none = {
    showDashboardSelectionModal: false,
    showRequiredFiltersModal: false,
    showTable1ConfigModal: false,
    showDashboardModal: false,
    showSaveCohortModal: false,
  }

  it('is false when every modal is closed', () => {
    expect(isDashboardFlowOpen(none)).toBe(false)
  })

  it('is true for each modal on its own', () => {
    for (const key of Object.keys(none) as (keyof typeof none)[]) {
      expect(isDashboardFlowOpen({ ...none, [key]: true })).toBe(true)
    }
  })

  it('is false for absent flags, so a half-built flow object cannot mount the modals', () => {
    expect(isDashboardFlowOpen({})).toBe(false)
    expect(isDashboardFlowOpen(null)).toBe(false)
    expect(isDashboardFlowOpen(undefined)).toBe(false)
  })

  it('depends on nothing but the flags, so it cannot be left stuck on', () => {
    // The regression this guards: the mount condition used to OR in a sticky
    // "analyze in progress" flag. Flow paths that end with no modal open left
    // it set, the modals stayed mounted, and unmounting the page then tore
    // down a teleport whose target was being removed — silently aborting the
    // switch to the cohort builder until a reload.
    expect(isDashboardFlowOpen(none)).toBe(false)
  })
})

describe('shouldResetDashboardFlow', () => {
  it('resets on the true-to-false edge when the flow is idle', () => {
    expect(shouldResetDashboardFlow({ isOpen: false, wasOpen: true, isProcessing: false })).toBe(true)
  })

  it('does not reset while a modal is open', () => {
    expect(shouldResetDashboardFlow({ isOpen: true, wasOpen: false, isProcessing: false })).toBe(false)
    expect(shouldResetDashboardFlow({ isOpen: true, wasOpen: true, isProcessing: false })).toBe(false)
  })

  it('does not reset on the first evaluation, when nothing was open before', () => {
    expect(shouldResetDashboardFlow({ isOpen: false, wasOpen: false, isProcessing: false })).toBe(false)
  })

  it('does not reset in the gap between two modals', () => {
    // The flow closes one modal and opens the next across an await; resetting
    // in that window breaks the wizard.
    expect(shouldResetDashboardFlow({ isOpen: false, wasOpen: true, isProcessing: true })).toBe(false)
  })
})
