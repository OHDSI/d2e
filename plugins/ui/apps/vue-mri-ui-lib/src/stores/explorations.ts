import { defineStore } from 'pinia'

// Exploration-only UI state. Deliberately Pinia, not Vuex: Vuex module state is
// shared across mounts (see the plan Appendix B), while Pinia is per-mount.
export const useExplorationsStore = defineStore('explorations', {
  state: () => ({
    selectedBookmarkIds: [] as string[],
    // True while the Analyze action's own loadbookmarkToState dispatch is
    // filling the active bookmark. PatientAnalytics.vue's getActiveBookmark
    // watcher auto-switches to the cohort builder whenever a bookmark goes
    // from unset to set; Analyze needs the active bookmark set (dashboardContext
    // reads it) without that switch firing and unmounting this page mid-click.
    analyzeInProgress: false,
  }),
  getters: {
    isSelected: state => (id: string) => state.selectedBookmarkIds.includes(id),
  },
  actions: {
    toggle(id: string, selected: boolean) {
      const set = new Set(this.selectedBookmarkIds)
      if (selected) {
        set.add(id)
      } else {
        set.delete(id)
      }
      this.selectedBookmarkIds = [...set]
    },
    clear() {
      this.selectedBookmarkIds = []
    },
  },
})
