import { describe, expect, it } from 'vitest'
import {
  buildColorAxisMenuData,
  reconcileColorAxisSelection,
  type ColorAxisMenuItem,
  type ColorAxisMenuItemData,
  type ColorAxisSelection,
} from '../colorAxisSelection'

// --- fixture helpers ---

const genderAttribute = {
  sConfigPath: 'patient.attributes.gender',
  oInternalConfigAttribute: { name: 'Gender' },
}

const conditionAttribute = {
  sConfigPath: 'patient.attributes.condition',
  oInternalConfigAttribute: { name: 'Condition' },
}

const buildConfig = (attributes: any[] = [genderAttribute], filterCardName = 'Basic Data') => ({
  getFilterCardByInstanceId: (instanceId: string) =>
    instanceId === 'patient'
      ? {
          aAllAttributes: attributes,
          oInternalConfigFilterCard: { name: filterCardName },
        }
      : undefined,
})

const getText = (key: string) => key

/** An axis pointed at one of the configured patient attributes */
const axisFor = (key: string, filterCardId = 'patient') => ({
  props: { filterCardId, key, attributeId: `patient.attributes.${key}` },
})

/** An x axis slot the user has not filled in */
const emptyAxis = { props: {} }

const menuFor = (
  allAxes: any[],
  options: { mriFrontendConfig?: any; chartableFilterCards?: any[]; hasSelection?: boolean } = {}
) =>
  buildColorAxisMenuData({
    allAxes,
    // A test that passes mriFrontendConfig: undefined means it — the config is still loading.
    mriFrontendConfig: 'mriFrontendConfig' in options ? options.mriFrontendConfig : buildConfig(),
    chartableFilterCards: options.chartableFilterCards ?? [],
    getText,
    hasSelection: options.hasSelection ?? false,
  })

const reconcileFor = ({
  allAxes,
  menuData,
  selection = null,
  storeAxisIndex,
  configReady = true,
}: {
  allAxes: any[]
  menuData: ColorAxisMenuItem[]
  selection?: ColorAxisSelection | null
  storeAxisIndex: number | null | undefined
  configReady?: boolean
}) => reconcileColorAxisSelection({ configReady, storeAxisIndex, allAxes, menuData, selection })

const genderSelection: ColorAxisSelection = {
  axisIndex: 0,
  filterText: 'Basic Data',
  attrText: 'Gender',
  filterCardId: 'patient',
  key: 'gender',
}

describe('buildColorAxisMenuData', () => {
  it('offers an axis that resolves to a configured attribute', () => {
    const menuData = menuFor([axisFor('gender'), emptyAxis])

    expect(menuData).toHaveLength(1)
    expect(menuData[0].text).toBe('Basic Data - Gender')
    expect(menuData[0].data).toEqual({ axisIndex: 0, filterText: 'Basic Data', attrText: 'Gender' })
  })

  it('skips an axis whose attribute the filter card does not carry', () => {
    // The axis points at patient.attributes.condition, but only gender is configured.
    expect(menuFor([axisFor('condition'), emptyAxis])).toEqual([])
  })

  it('skips an axis whose filter card cannot be resolved', () => {
    expect(menuFor([axisFor('gender', 'unknown-card'), emptyAxis])).toEqual([])
  })

  it('offers only the first two axes, the ones that can carry the coloring', () => {
    const menuData = menuFor([emptyAxis, axisFor('gender'), axisFor('gender')])

    expect(menuData).toHaveLength(1)
    expect((menuData[0].data as ColorAxisMenuItemData).axisIndex).toBe(1)
  })

  it('prefixes the filter card code when the chartable card is named apart from its config', () => {
    const menuData = menuFor([axisFor('gender'), emptyAxis], {
      chartableFilterCards: [{ instanceId: 'patient', name: 'Basic Data 2' }],
    })

    expect(menuData[0].text).toBe('2 - Basic Data - Gender')
    expect((menuData[0].data as ColorAxisMenuItemData).filterText).toBe('2 - Basic Data')
  })

  it('falls back to the basic data label when the filter card name is unusable', () => {
    const menuData = menuFor([axisFor('gender'), emptyAxis], {
      mriFrontendConfig: buildConfig([genderAttribute], 'undefined filter card'),
    })

    expect(menuData[0].text).toBe('MRI_PA_FILTERCARD_TITLE_BASIC_DATA - Gender')
  })

  it('offers a way to clear only once something is selected', () => {
    const withoutSelection = menuFor([axisFor('gender'), emptyAxis])
    const withSelection = menuFor([axisFor('gender'), emptyAxis], { hasSelection: true })

    expect(withoutSelection.map(item => item.data)).toEqual([
      { axisIndex: 0, filterText: 'Basic Data', attrText: 'Gender' },
    ])
    expect(withSelection).toHaveLength(3)
    expect(withSelection[1].isSeperator).toBe(true)
    expect(withSelection[2].data).toEqual({ action: 'clear' })
    expect(withSelection[2].text).toBe('MRI_PA_MENUITEM_NONE')
  })

  it('offers nothing to clear when there is nothing to select either', () => {
    expect(menuFor([emptyAxis, emptyAxis], { hasSelection: true })).toEqual([])
  })

  it('stays empty while the frontend config is still loading', () => {
    expect(menuFor([axisFor('gender'), emptyAxis], { mriFrontendConfig: undefined })).toEqual([])
  })
})

describe('reconcileColorAxisSelection', () => {
  it('rejects a color axis it cannot offer instead of holding it silently', () => {
    // Both x axis slots are empty, so the menu has no item for index 0.
    const allAxes = [emptyAxis, emptyAxis]

    const decision = reconcileFor({ allAxes, menuData: menuFor(allAxes), storeAxisIndex: 0 })

    expect(decision).toEqual({ action: 'clear', notify: true })
  })

  it('adopts a color axis that maps to a selectable attribute', () => {
    const allAxes = [axisFor('gender'), emptyAxis]

    const decision = reconcileFor({ allAxes, menuData: menuFor(allAxes), storeAxisIndex: 0 })

    expect(decision).toEqual({ action: 'adopt', selection: genderSelection })
  })

  it('adopts a selection the store already holds when reconciling into a loaded cohort', () => {
    // First reconcile after mount: the menu exists, the button holds nothing yet.
    const allAxes = [emptyAxis, axisFor('gender')]

    const decision = reconcileFor({ allAxes, menuData: menuFor(allAxes), storeAxisIndex: 1 })

    expect(decision).toEqual({
      action: 'adopt',
      selection: { ...genderSelection, axisIndex: 1 },
    })
  })

  it('leaves a selection it already holds alone', () => {
    const allAxes = [axisFor('gender'), emptyAxis]

    const decision = reconcileFor({
      allAxes,
      menuData: menuFor(allAxes, { hasSelection: true }),
      selection: genderSelection,
      storeAxisIndex: 0,
    })

    expect(decision).toEqual({ action: 'keep' })
  })

  it('clears the selection when its axis is repointed at another configured attribute', () => {
    // The axis still resolves — to Condition now — so the menu keeps offering index 0. The button
    // must not let the coloring follow the axis onto an attribute the user never picked.
    const allAxes = [axisFor('condition'), emptyAxis]
    const mriFrontendConfig = buildConfig([genderAttribute, conditionAttribute])

    const decision = reconcileFor({
      allAxes,
      menuData: menuFor(allAxes, { mriFrontendConfig, hasSelection: true }),
      selection: genderSelection,
      storeAxisIndex: 0,
    })

    expect(decision).toEqual({ action: 'clear', notify: true })
  })

  it('clears the selection when its axis is repointed at something unchartable', () => {
    const allAxes = [axisFor('condition'), emptyAxis]

    const decision = reconcileFor({
      allAxes,
      menuData: menuFor(allAxes, { hasSelection: true }),
      selection: genderSelection,
      storeAxisIndex: 0,
    })

    expect(decision).toEqual({ action: 'clear', notify: true })
  })

  it('drops its selection without notifying when the store already dropped it', () => {
    const allAxes = [axisFor('gender'), emptyAxis]

    const decision = reconcileFor({
      allAxes,
      menuData: menuFor(allAxes, { hasSelection: true }),
      selection: genderSelection,
      storeAxisIndex: null,
    })

    expect(decision).toEqual({ action: 'clear', notify: false })
  })

  it('stays put when neither the store nor the button holds a color axis', () => {
    const allAxes = [axisFor('gender'), emptyAxis]

    expect(reconcileFor({ allAxes, menuData: menuFor(allAxes), storeAxisIndex: null })).toEqual({ action: 'keep' })
    expect(reconcileFor({ allAxes, menuData: menuFor(allAxes), storeAxisIndex: undefined })).toEqual({ action: 'keep' })
  })

  it('holds a selection while the frontend config is still loading', () => {
    // Reconciling against a menu that cannot be built yet would clear a restored bookmark.
    const decision = reconcileFor({
      allAxes: [],
      menuData: [],
      selection: genderSelection,
      storeAxisIndex: 0,
      configReady: false,
    })

    expect(decision).toEqual({ action: 'keep' })
  })
})
