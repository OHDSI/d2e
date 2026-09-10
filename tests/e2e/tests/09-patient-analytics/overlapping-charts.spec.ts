import { Locator, Page, TestInfo } from '@playwright/test'
import { test, expect } from '../fixtures'
import { SECOND_20 } from '../const'
import { takeElementScreenshot } from '../screenshot-capture'

const TEST_NAME = 'overlapping-charts'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)

// This spec captures element screenshots rather than full-page ones: only the chart
// (and the mode dropdown) matter here, so unrelated page changes cannot invalidate them.
//
// No baselines exist yet. While this is false the screenshots are only *captured*, into
// test-results/ (uploaded as CI artifacts) — the test cannot fail on a missing baseline,
// which matters because CI runs with maxFailures: 1. Commit the captured PNGs as
// overlapping-charts.spec.ts-snapshots/<name>-linux.png and flip this to true to turn
// them into real visual assertions.
const ASSERT_SCREENSHOTS = false

// The four bar display modes declared in
// plugins/ui/apps/vue-mri-ui-lib/src/components/StackBarModes/modes.ts, keyed by the
// label the "Chart type" dropdown renders (i18n MRI_PA_CHART_MODE_* in English).
const MODE = {
  stacked: 'Stacked Bar Chart', // id: stack
  overlappingHistogram: 'Overlapping Histogram', // id: overlay
  overlappingBar: 'Overlapping Bar Chart', // id: partialOverlaySolid
  kernelDensity: 'Kernel Density Plot' // id: distribution
}

// Overlapping modes are hidden behind per-dataset config flags that ship disabled
// (chartOptions.stacked.overlappingHistogramEnabled / overlappingBarChartEnabled /
// kernelDensityPlotEnabled default to false in the seeded configs), and
// ChartController hides the whole "Chart type" button unless at least one is on.
// Patch them into the config response instead of editing the dataset's stored
// config, so this spec stays self-contained and does not make the button appear in
// every other Patient Analytics spec's screenshot baselines.
const CONFIG_ACTIONS = ['getMyConfig', 'getFrontendConfig']

async function enableOverlappingChartModes(page: Page) {
  await page.route(
    url =>
      url.pathname.includes('/analytics-svc/pa/services/analytics.xsjs') &&
      CONFIG_ACTIONS.includes(url.searchParams.get('action') ?? ''),
    async route => {
      const response = await route.fetch()
      let body: any
      try {
        body = await response.json()
      } catch {
        // Not the JSON config payload — pass it through untouched.
        return route.fulfill({ response })
      }
      const enableFlags = (config: any) => {
        const stacked = config?.config?.chartOptions?.stacked
        if (stacked) {
          stacked.overlappingHistogramEnabled = true
          stacked.overlappingBarChartEnabled = true
          stacked.kernelDensityPlotEnabled = true
        }
      }
      // getMyConfig returns an array of assigned configs, getFrontendConfig a single one.
      Array.isArray(body) ? body.forEach(enableFlags) : enableFlags(body)
      await route.fulfill({ response, json: body })
    }
  )
}

type PlotState = {
  barmode: string | null
  bargap: number | null
  xAxisType: string | null
  types: string[]
  modes: (string | null)[]
  fills: (string | null)[]
  opacity: (number | null)[]
  width: (number | null)[]
  offset: (number | null)[]
  firstX: unknown
}

// Reads the state Plotly was actually rendered with. `el.data` / `el.layout` hold what
// StackBarChart handed to Plotly.react, i.e. the output of the active mode's apply().
async function readPlot(page: Page): Promise<PlotState> {
  return page.evaluate(() => {
    const el = document.querySelector('#stacked-chart') as any
    const traces: any[] = el?.data ?? []
    return {
      barmode: el?.layout?.barmode ?? null,
      bargap: el?.layout?.bargap ?? null,
      xAxisType: el?.layout?.xaxis?.type ?? null,
      types: traces.map(trace => trace.type),
      modes: traces.map(trace => trace.mode ?? null),
      fills: traces.map(trace => trace.fill ?? null),
      opacity: traces.map(trace => trace.marker?.opacity ?? null),
      width: traces.map(trace => trace.width ?? null),
      offset: traces.map(trace => trace.offset ?? null),
      firstX: traces[0]?.x?.[0] ?? null
    }
  })
}

// Waits until the given subset of the Plotly state matches, then returns the full state.
// Switching mode can trigger a fresh chart request (Kernel Density Plot rebins the x-axis),
// so polling is more reliable than a fixed wait.
async function waitForPlot(page: Page, expected: Partial<PlotState>): Promise<PlotState> {
  const keys = Object.keys(expected) as (keyof PlotState)[]
  await expect
    .poll(
      async () => {
        const state = await readPlot(page)
        return Object.fromEntries(keys.map(key => [key, state[key]]))
      },
      { timeout: SECOND_20 }
    )
    .toEqual(expected)
  return readPlot(page)
}

const chart = (page: Page) => page.locator('.stackbar-wrapper')
const chartTypeButton = (page: Page) => page.locator('.bar-display-mode-axis-button button.axisMenuButton')
const chartTypeMenu = (page: Page) =>
  page.locator('.bar-display-mode-axis-button .dropdownmenu-container .menuWrapper:not(.closed)')
const menuItem = (page: Page, label: string) => page.getByTestId(`pa-axis-dropdown-item-${label}`)
const distributionCurveCheckbox = (page: Page) => page.locator('.bar-display-mode-axis-button__toggle input')

// The menu stays open after a selection (only an outside click or the button closes it),
// so mode switches are explicit about opening and closing it.
async function openChartTypeMenu(page: Page) {
  if (!(await chartTypeMenu(page).isVisible())) {
    await chartTypeButton(page).click()
  }
  await expect(chartTypeMenu(page)).toBeVisible()
}

async function closeChartTypeMenu(page: Page) {
  if (await chartTypeMenu(page).isVisible()) {
    await chartTypeButton(page).click()
  }
  await expect(chartTypeMenu(page)).toBeHidden()
}

async function selectMode(page: Page, label: string) {
  await openChartTypeMenu(page)
  await menuItem(page, label).click()
  await closeChartTypeMenu(page)
  await expect(chartTypeButton(page)).toContainText(label)
  await expect(page.locator('.loading-animation-component')).not.toBeVisible()
}

// Picks an attribute for one axis slot, e.g. selectAxisAttribute(page, 'x1', 'Basic Data', 'Age').
async function selectAxisAttribute(page: Page, axis: string, group: string, attribute: string) {
  await page.getByTestId(`pa-axis-menu-btn-${axis}`).click()
  const menu = page.getByTestId(`pa-dropdown-menu-${axis}`)
  await menu.locator('> .menuWrapper').getByText(group, { exact: true }).click()
  const submenu = menu.getByTestId('pa-dropdown-menu').locator('.menuWrapper:not(.closed)').first()
  await submenu.getByText(attribute, { exact: true }).click()
  await expect(page.locator('.loading-animation-component')).not.toBeVisible()
}

async function screenshot(target: Locator, testInfo: TestInfo, name: string) {
  // Let the Plotly transition settle before capturing.
  await target.page().waitForTimeout(500)
  if (ASSERT_SCREENSHOTS) {
    await expect(target).toHaveScreenshot(name)
  } else {
    await takeElementScreenshot(target, testInfo, name)
  }
}

test(TEST_NAME, async ({ page }, testInfo) => {
  test.slow()

  await test.step('open a new D2E cohort chart', async () => {
    await enableOverlappingChartModes(page)

    await page.goto('/d2e/portal')
    await page.locator('input[name="identifier"]').fill('admin')
    await page.locator('input[name="password"]').fill('Updatepassword12345')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.getByText('Demo datasetDemo datasetTotal').click()
    await page.getByRole('link', { name: 'Cohorts' }).click()
    await page.getByRole('button', { name: 'D2E' }).click()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })

  await test.step('bin the x-axis by Age and split the bars by Gender', async () => {
    // The overlapping modes only differ from a stacked chart once there is more than one
    // series, and the Kernel Density Plot needs a numeric x-axis it can place kernels on.
    await selectAxisAttribute(page, 'x1', 'Basic Data', 'Age')
    await selectAxisAttribute(page, 'stack', 'Basic Data', 'Gender')

    await expect(page.locator('.stackbar-legend-entry')).toHaveCount(2)
    await waitForPlot(page, { types: ['bar', 'bar'] })
  })

  await test.step('the chart type menu offers every enabled mode', async () => {
    await openChartTypeMenu(page)

    for (const label of Object.values(MODE)) {
      await expect(menuItem(page, label)).toBeVisible()
    }
    await expect(menuItem(page, MODE.stacked)).toHaveClass(/selected/)
    // The distribution curve only applies to the two overlapping bar modes.
    await expect(distributionCurveCheckbox(page)).toBeDisabled()

    await screenshot(chartTypeMenu(page), testInfo, 'chart-type-menu.png')
    await closeChartTypeMenu(page)
  })

  await test.step('stacked bar chart stacks solid full-width bars', async () => {
    const state = await waitForPlot(page, {
      barmode: 'stack',
      bargap: 0.3,
      types: ['bar', 'bar'],
      xAxisType: 'category'
    })
    // No mode-specific trace overrides: bars are solid, full width, un-offset.
    expect(state.opacity).toEqual([null, null])
    expect(state.width).toEqual([null, null])
    expect(state.offset).toEqual([null, null])

    await screenshot(chart(page), testInfo, 'mode-stacked.png')
  })

  await test.step('overlapping histogram overlays gapless translucent bars', async () => {
    await selectMode(page, MODE.overlappingHistogram)

    const state = await waitForPlot(page, {
      barmode: 'overlay',
      bargap: 0, // histogram bars touch
      types: ['bar', 'bar']
    })
    // OVERLAY_BAR_OPACITY — both series are translucent so the overlap stays readable.
    expect(state.opacity).toEqual([0.3, 0.3])

    await screenshot(chart(page), testInfo, 'mode-overlapping-histogram.png')
  })

  await test.step('the distribution curve adds one line trace per series', async () => {
    await openChartTypeMenu(page)
    await expect(distributionCurveCheckbox(page)).toBeEnabled()
    await distributionCurveCheckbox(page).check()
    await closeChartTypeMenu(page)

    // The bar traces are kept and a KDE line trace is appended for each of them.
    const state = await waitForPlot(page, { types: ['bar', 'bar', 'scatter', 'scatter'] })
    expect(state.modes).toEqual([null, null, 'lines', 'lines'])
    expect(state.opacity.slice(0, 2)).toEqual([0.3, 0.3])
    await expect(page.locator('.stackbar-legend-entry')).toHaveCount(4)

    await screenshot(chart(page), testInfo, 'mode-overlapping-histogram-with-curve.png')

    await openChartTypeMenu(page)
    await distributionCurveCheckbox(page).uncheck()
    await closeChartTypeMenu(page)
    await waitForPlot(page, { types: ['bar', 'bar'] })
  })

  await test.step('overlapping bar chart narrows and offsets solid bars', async () => {
    await selectMode(page, MODE.overlappingBar)

    const state = await waitForPlot(page, {
      barmode: 'overlay',
      bargap: 0.3, // unlike the histogram, the bar gap is kept
      types: ['bar', 'bar']
    })
    // Bars stay solid and are instead narrowed to an equal width and shifted apart, so
    // each series peeks out from behind the previous one.
    expect(state.opacity).toEqual([null, null])
    expect(state.width[0]).toBeCloseTo(0.476, 3) // (1 - bargap) * 0.68
    expect(state.width[1]).toBe(state.width[0])
    expect(state.offset[0]).toBeLessThan(state.offset[1] as number)

    await screenshot(chart(page), testInfo, 'mode-overlapping-bar.png')
  })

  await test.step('kernel density plot replaces the bars with filled curves', async () => {
    await selectMode(page, MODE.kernelDensity)

    const state = await waitForPlot(page, {
      types: ['scatter', 'scatter'],
      // Bins are dropped in favour of a continuous numeric axis.
      xAxisType: 'linear'
    })
    expect(state.modes).toEqual(['lines', 'lines'])
    expect(state.fills).toEqual(['tozeroy', 'tozeroy'])
    expect(typeof state.firstX).toBe('number')

    // This mode is a density curve already, so the overlay toggle does not apply.
    await openChartTypeMenu(page)
    await expect(distributionCurveCheckbox(page)).toBeDisabled()
    await closeChartTypeMenu(page)

    await screenshot(chart(page), testInfo, 'mode-kernel-density.png')
  })

  await test.step('switching back to stacked restores the binned bars', async () => {
    await selectMode(page, MODE.stacked)

    const state = await waitForPlot(page, {
      barmode: 'stack',
      bargap: 0.3,
      types: ['bar', 'bar'],
      xAxisType: 'category'
    })
    // Mode-specific trace overrides are gone and the x-axis binning is restored.
    expect(state.opacity).toEqual([null, null])
    expect(state.width).toEqual([null, null])
    expect(state.offset).toEqual([null, null])
    expect(String(state.firstX)).toMatch(/^\d+ - \d+$/)
  })
})
