import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as types from '../../store/mutation-types'

const setToastMessage = vi.fn()
vi.mock('../../stores/notifications', () => ({
  useNotificationStore: () => ({ setToastMessage }),
}))

import FiltersFooter from '../FiltersFooter.vue'

// saveBookmark closes the dialog and shows the success toast before the bookmark
// list is reloaded, so the user (and Playwright) can start editing while the
// reload is still in flight. The baseline that decides "has unsaved changes"
// must therefore describe what was actually persisted, not whatever the live
// store happens to hold once the reload resolves - otherwise an edit made in
// that window is swallowed into the baseline and the Save button never
// re-enables.
describe('FiltersFooter.saveBookmark baseline', () => {
  let live: any
  let ctx: any
  let sentPayload: any

  beforeEach(() => {
    setToastMessage.mockClear()
    live = { filter: { cards: ['initial'] }, axisSelection: [] }
    sentPayload = undefined

    ctx = {
      isSavingBookmark: false,
      hasChanges: true,
      hasExceededLength: false,
      isNotUserSharedBookmark: false,
      cohortName: 'My cohort',
      shareBookmark: false,
      cohortNameValidationState: 'valid',
      getActiveBookmark: { isNew: true, bmkId: undefined },
      getBookmarks: [],
      portalContext: { username: 'admin' },
      getText: () => 'saved',
      getBookmarkByNameAndUsername: () => ({ bmkId: 'bmk-1', bookmarkname: 'My cohort' }),
      closeSaveBookmark: vi.fn(),
      fireBookmarkQuery: vi.fn(async ({ params }: any) => {
        if (params.cmd === 'insert' || params.cmd === 'update') {
          sentPayload = JSON.parse(params.bookmark)
          return
        }
        // The reload is where the user's next edit lands: it happens after the
        // dialog has closed and the toast has been shown.
        live.filter.cards.push('edited-during-reload')
      }),
      [types.SET_ACTIVE_BOOKMARK]: vi.fn(),
      [types.SET_ACTIVE_BOOKMARK_BASELINE]: vi.fn(),
    }
    // getBookmarksData is a Vuex getter that recomputes from live state on every
    // read, so model it as an accessor rather than a fixed object.
    Object.defineProperty(ctx, 'getBookmarksData', {
      get: () => JSON.parse(JSON.stringify(live)),
    })
  })

  it('records the persisted payload as the baseline, not state edited during the reload', async () => {
    await (FiltersFooter as any).methods.saveBookmark.call(ctx)

    expect(sentPayload).toEqual({ filter: { cards: ['initial'] }, axisSelection: [] })
    expect(ctx[types.SET_ACTIVE_BOOKMARK_BASELINE]).toHaveBeenCalledWith(sentPayload)
  })

  it('commits the baseline after SET_ACTIVE_BOOKMARK, which clears it', async () => {
    const order: string[] = []
    ctx[types.SET_ACTIVE_BOOKMARK] = vi.fn(() => order.push('active'))
    ctx[types.SET_ACTIVE_BOOKMARK_BASELINE] = vi.fn(() => order.push('baseline'))

    await (FiltersFooter as any).methods.saveBookmark.call(ctx)

    expect(order).toEqual(['active', 'baseline'])
  })
})
