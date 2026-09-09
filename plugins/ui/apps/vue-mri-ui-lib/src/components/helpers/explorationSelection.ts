/**
 * Bulk-selection arithmetic for the Data Exploration grid. Pure functions, no
 * Vue import, so the test does not have to load Vuetify or Pinia.
 *
 * Select-all acts on the current page only (`pageIds`); the selection itself
 * spans every page the user has visited (`selectedIds`). See
 * `docs/projects/vue-mri-ui/pr10/01-selection-store-and-toolbar.md` section 0.1.
 */

/** True when every id on the page is selected. False for an empty page. */
export function allSelected(pageIds: string[], selectedIds: string[]): boolean {
  if (pageIds.length === 0) return false
  const selected = new Set(selectedIds)
  return pageIds.every(id => selected.has(id))
}

/** True when the page holds a mix of selected and unselected cards. */
export function someSelected(pageIds: string[], selectedIds: string[]): boolean {
  if (pageIds.length === 0) return false
  const selected = new Set(selectedIds)
  const selectedCount = pageIds.filter(id => selected.has(id)).length
  return selectedCount > 0 && selectedCount < pageIds.length
}

/** Keep only the ids that are still in `visibleIds`. Returns a new array. */
export function retainIds(selectedIds: string[], visibleIds: string[]): string[] {
  const visible = new Set(visibleIds)
  return selectedIds.filter(id => visible.has(id))
}

/** Add every page id, or remove every page id. Returns a new array. */
export function applyPageSelection(selectedIds: string[], pageIds: string[], selected: boolean): string[] {
  if (selected) {
    const set = new Set(selectedIds)
    pageIds.forEach(id => set.add(id))
    return [...set]
  }
  const page = new Set(pageIds)
  return selectedIds.filter(id => !page.has(id))
}
