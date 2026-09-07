/**
 * Menu building and selection reconciliation for XAxisColorButton.
 *
 * This lives outside the component so it can be unit-tested without mounting: XAxisColorButton
 * calls `useTemplateRef`, and mounting anything that does is currently impossible in CI, where the
 * workspace installs two copies of Vue (see docs/duplicate-vue-runtime.md at the repo root).
 */

/** Callback to resolve a text key to its translated label */
type GetTextFn = (key: string) => string

/** Payload of a selectable dropdown entry — one colorable x axis */
export interface ColorAxisMenuItemData {
  axisIndex: number
  filterText: string
  attrText: string
}

/** Payload of the trailing entry that clears the current selection */
export interface ColorAxisClearItemData {
  action: 'clear'
}

/** One entry of the color-axis dropdown. Separator entries carry no `data`. */
export interface ColorAxisMenuItem {
  idx: number
  hasSubMenu: boolean
  isSeperator: boolean
  subMenuStyle?: Record<string, unknown>
  text?: string
  subMenu?: unknown[]
  disabled?: boolean
  data?: ColorAxisMenuItemData | ColorAxisClearItemData
}

/** The color axis the button currently holds, as read off its label */
export interface ColorAxisSelection {
  axisIndex: number
  filterText: string
  attrText: string
  filterCardId: string | null
  key: string | null
}

export interface BuildColorAxisMenuDataInput {
  allAxes: any[] | undefined
  mriFrontendConfig: any
  chartableFilterCards: any[] | undefined
  getText: GetTextFn
  /** Whether the button holds a selection: only then is the trailing "None" entry offered */
  hasSelection: boolean
}

/** Finds the entry that stands for `axisIndex`, skipping separators and the "None" entry */
export function findAxisMenuItem(menuData: ColorAxisMenuItem[], axisIndex: number): ColorAxisMenuItem | undefined {
  return menuData.find(item => item.data && (item.data as ColorAxisMenuItemData).axisIndex === axisIndex)
}

/**
 * Builds the dropdown from the first two axes: only those can carry the chart's coloring.
 * An axis is offered only when its filter card and attribute both resolve against the config —
 * anything else cannot be labelled, so it must not be selectable.
 */
export function buildColorAxisMenuData({
  allAxes,
  mriFrontendConfig,
  chartableFilterCards,
  getText,
  hasSelection,
}: BuildColorAxisMenuDataInput): ColorAxisMenuItem[] {
  const menuData: ColorAxisMenuItem[] = []
  if (!mriFrontendConfig) {
    return menuData
  }

  const axes = allAxes || []
  let menuIdx = 0
  for (let i = 0; i <= 1; i++) {
    const axis = axes[i]
    if (!axis?.props?.filterCardId || !axis?.props?.key) continue

    const filterCard = mriFrontendConfig.getFilterCardByInstanceId(axis.props.filterCardId)
    if (!filterCard) continue

    let attrName = ''
    filterCard.aAllAttributes.forEach((attribute: any) => {
      if (attribute.sConfigPath.split('.').pop() === axis.props.key) {
        attrName = attribute.oInternalConfigAttribute.name
      }
    })
    if (!attrName) continue

    let filterCardName = filterCard.oInternalConfigFilterCard.name
    if (!filterCardName || filterCardName.indexOf('undefined') > -1) {
      filterCardName = getText('MRI_PA_FILTERCARD_TITLE_BASIC_DATA')
    }
    let filterCardCode = ''
    if (chartableFilterCards) {
      chartableFilterCards.forEach((fCard: any) => {
        if (fCard.instanceId === axis.props.filterCardId) {
          filterCardCode = fCard.name.replace(filterCardName, '').trim()
        }
      })
    }
    if (filterCardCode) {
      filterCardCode = filterCardCode + ' - '
    }
    const filterText = `${filterCardCode}${filterCardName}`
    menuData.push({
      idx: menuIdx,
      subMenuStyle: {},
      text: `${filterText} - ${attrName}`,
      hasSubMenu: false,
      isSeperator: false,
      subMenu: [],
      disabled: false,
      data: { axisIndex: i, filterText, attrText: attrName },
    })
    menuIdx += 1
  }

  if (hasSelection && menuData.length > 0) {
    menuData.push({
      idx: (menuIdx += 1),
      hasSubMenu: false,
      isSeperator: true,
    })
    menuData.push({
      idx: (menuIdx += 1),
      subMenuStyle: {},
      text: getText('MRI_PA_MENUITEM_NONE'),
      hasSubMenu: false,
      isSeperator: false,
      subMenu: [],
      disabled: false,
      data: { action: 'clear' },
    })
  }

  return menuData
}

/**
 * What the button should do with the store-owned selection.
 * `clear` carries `notify`: the parent is told only when the button rejects an index the store
 * still holds, not when the store itself already cleared it.
 */
export type ColorAxisReconciliation =
  | { action: 'keep' }
  | { action: 'adopt'; selection: ColorAxisSelection }
  | { action: 'clear'; notify: boolean }

export interface ReconcileColorAxisSelectionInput {
  /** False while the frontend config is still loading — there is nothing to reconcile against yet */
  configReady: boolean
  /** The store-owned color axis index (XAxisColorButton's `selectedAxis` prop) */
  storeAxisIndex: number | null | undefined
  allAxes: any[] | undefined
  menuData: ColorAxisMenuItem[]
  /** What the button holds right now, or null when it reads as empty */
  selection: ColorAxisSelection | null
}

/**
 * Keeps the button and the store-owned selection in agreement.
 * The chart resolves the color attribute from that index at render time, so an index the button
 * silently fails to adopt would still color the bars — with the button reading as empty and the
 * user unable to clear it. Adopt what the menu can offer, reject what it cannot.
 */
export function reconcileColorAxisSelection({
  configReady,
  storeAxisIndex,
  allAxes,
  menuData,
  selection,
}: ReconcileColorAxisSelectionInput): ColorAxisReconciliation {
  if (!configReady) return { action: 'keep' }

  if (storeAxisIndex === null || storeAxisIndex === undefined) {
    // The store holds nothing, so neither should the button — but it is not news to the parent.
    return selection ? { action: 'clear', notify: false } : { action: 'keep' }
  }

  const axis = allAxes?.[storeAxisIndex]
  const menuItem = findAxisMenuItem(menuData, storeAxisIndex)
  // An already-adopted axis that now carries a different attribute is not the selection the user
  // made: the coloring must not follow the axis onto whatever was put there instead.
  const repointed =
    selection?.axisIndex === storeAxisIndex &&
    (axis?.props?.filterCardId !== selection.filterCardId || axis?.props?.key !== selection.key)

  if (!menuItem || repointed) {
    return { action: 'clear', notify: true }
  }

  if (selection?.axisIndex === storeAxisIndex) {
    return { action: 'keep' }
  }

  const { filterText, attrText } = menuItem.data as ColorAxisMenuItemData
  return {
    action: 'adopt',
    selection: {
      axisIndex: storeAxisIndex,
      filterText,
      attrText,
      filterCardId: axis?.props?.filterCardId ?? null,
      key: axis?.props?.key ?? null,
    },
  }
}
