import { test, expect } from '../fixtures'

const TEST_NAME = 'inclusion-report'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)

test(TEST_NAME, async ({ page }) => {
  test.slow()

  // Sign in
  await page.goto('/d2e/portal')
  await page.locator('input[name="identifier"]').fill('admin')
  await page.locator('input[name="password"]').fill('Updatepassword12345')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await test.step('Open Demo dataset and start a new D2E cohort', async () => {
    await page.getByText('Demo dataset').first().click()
    await page.getByRole('link', { name: 'Cohorts' }).click()
    await page.getByRole('button', { name: 'D2E' }).click()
    await expect(page.getByText('2,694 / 2,694')).toBeVisible()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })

  await test.step('Add Basic Data: Year of birth > 1950', async () => {
    const basicCardTrigger = page.locator('.appBasicFilterCard .bs-dropdown__trigger').first()
    await basicCardTrigger.click()
    await page.locator('.bs-dropdown__menu').getByText('Year of Birth', { exact: true }).click()
    await basicCardTrigger.click()
    await expect(page.locator('.bs-dropdown__menu')).toHaveCount(0)
    await page.getByTitle('Basic Data - Year of Birth').click()
    await page.getByTitle('Basic Data - Year of Birth').getByRole('textbox').fill('>1950')
    await page.getByTitle('Basic Data - Year of Birth').getByRole('textbox').press('Enter')
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })

  await test.step('Add Basic Data: Gender = Female', async () => {
    await page.getByTitle('Basic Data - Gender').getByText('All').click()
    await page.getByPlaceholder('Enter search term').fill('Female')
    await page.getByText('FEMALE - FEMALE').click()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })

  await test.step('Add Condition Occurrence inclusion filter (Chronic sinusitis)', async () => {
    await page.getByTitle('Add Filter Card').getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Condition Occurrence' }).click()
    await page.locator('[id="patient\\.interactions\\.conditionoccurrence\\.1"]').getByText('All').click()
    await page.getByTitle('Condition Occurrence A -').getByPlaceholder('Enter search term').fill('Chronic sinusitis')
    try {
      await expect(page.getByText('Chronic sinusitis')).toBeVisible({ timeout: 2000 })
      await page.getByText('Chronic sinusitis').click()
    } catch {
      await page.getByTitle('Condition Occurrence A -').getByRole('button').click()
      await page.getByRole('textbox', { name: 'Concept set name' }).fill('Chronic sinusitis')
      await page.getByRole('textbox', { name: 'search terms' }).fill('Chronic sinusitis')
      await page.getByRole('button', { name: 'Search' }).click()
      await page
        .getByRole('row', { name: /40055000.*Chronic sinusitis/ })
        .locator('td')
        .first()
        .click()
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(page.getByRole('button', { name: 'Update' })).toBeVisible()
      await page.getByRole('button', { name: 'Close' }).click()
      await expect(page.locator('.loading-animation-component')).not.toBeVisible()
      try {
        await page.mouse.move(0, 0)
        await page.locator('.modal-wrapper').click()
      } catch {
        // modal not present, continue
      }
    }
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })

  await test.step('Add Visit exclusion filter card', async () => {
    await page.getByRole('link', { name: /Exclusion \(\d+\)/ }).click()
    await page.getByTitle('Add Filter Card').getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Visit' }).click()
    await expect(page.getByText('A filter card has been added: Visit A')).toBeVisible()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })

  const dialog = page.locator('.inclusion-report-dialog')

  await test.step('Open Inclusion Report dialog and wait for data', async () => {
    await expect(page.getByRole('button', { name: 'Attrition Plot' })).toBeVisible()
    const reportResponse = page.waitForResponse(
      r => /\/analytics-svc\/api\/services\/population\/.*(inclusionreport|attrition)/i.test(r.url()) && r.ok(),
      { timeout: 60000 }
    )
    await page.getByRole('button', { name: 'Attrition Plot' }).click()
    await reportResponse
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.inclusion-report-dialog__title-text')).toHaveText('Attrition Plot')
    await expect(dialog.locator('.status-message.loading')).not.toBeVisible()
    await expect(dialog.locator('.inclusion-report-container')).toBeVisible()
  })

  await test.step('Assert ChartToolbar integration props (no viz tabs, no PERSON/EVENT switch)', async () => {
    await expect(dialog.locator('.visualization-tabs')).toHaveCount(0)
    await expect(dialog.locator('.person-event-view-buttons')).toHaveCount(0)
  })

  await test.step('Assert funnel chart labels use the rule display names', async () => {
    const funnelLabels = dialog.locator('.funnel-chart g.ytick > text')
    await expect(funnelLabels.first()).toBeVisible()
    // Plotly keeps the string it was handed - <br> line breaks from the label wrapping and all -
    // in data-unformatted, which is also what keys the label hover lookup.
    const labels = (
      await funnelLabels.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-unformatted') ?? ''))
    ).map(label => label.replace(/<br>/g, ' '))

    expect(labels).toContain('+ Gender')
    expect(labels).toContain('+ Year of Birth')
    expect(labels.some(l => l.startsWith('+ Condition Occurrence A'))).toBe(true)
    expect(labels.some(l => l.startsWith('- Visit A'))).toBe(true)
    expect(labels.every(l => !l.includes('Basic Data'))).toBe(true)
  })

  await test.step('Verify SummaryTable and RulesTable content', async () => {
    await expect(dialog.getByText('Summary Statistics')).toBeVisible()
    await expect(dialog.getByText('Total Persons: 2,694')).toBeVisible()
    await expect(dialog.getByText('Matches: 199 (7.39%)')).toBeVisible()

    const rulesRows = dialog.locator('table.rules-table tbody tr')
    await expect(rulesRows).toHaveCount(4)

    // A Basic Data rule is titled by its attribute name: the shared "Basic Data" card name is
    // dropped, and the attribute is not repeated as a "<attribute>:" label above its constraint.
    const genderRow = rulesRows.nth(0)
    await expect(genderRow.locator('td.rule-name')).toHaveText(/^\+\s+Gender\b/)
    await expect(genderRow.locator('td.rule-name')).toContainText('FEMALE')
    await expect(genderRow.locator('td.rule-name')).not.toContainText('Basic Data')
    await expect(genderRow.locator('td.rule-name')).not.toContainText('Gender:')
    await expect(genderRow).toContainText('1,373')
    await expect(genderRow).toContainText('50.97%')

    const yobRow = rulesRows.nth(1)
    await expect(yobRow.locator('td.rule-name')).toHaveText(/^\+\s+Year of Birth\b/)
    await expect(yobRow.locator('td.rule-name')).toContainText('>1950')
    await expect(yobRow.locator('td.rule-name')).not.toContainText('Basic Data')
    await expect(yobRow.locator('td.rule-name')).not.toContainText('Year of Birth:')
    await expect(yobRow).toContainText('1,016')
    await expect(yobRow).toContainText('37.71%')

    // Non-Basic cards keep their own card name as the title
    const conditionRow = rulesRows.nth(2)
    await expect(conditionRow.locator('td.rule-name')).toHaveText(/^\+\s+Condition Occurrence A\b/)
    await expect(conditionRow).toContainText('291')
    await expect(conditionRow).toContainText('10.80%')

    const visitRow = rulesRows.nth(3)
    await expect(visitRow.locator('td.rule-name')).toHaveText(/^-\s+Visit A\b/)
    await expect(visitRow).toContainText('199')
    await expect(visitRow).toContainText('7.39%')
  })

  await test.step('Reorder rules via Move up button', async () => {
    const rulesRows = dialog.locator('table.rules-table tbody tr')
    await rulesRows.nth(0).scrollIntoViewIfNeeded()
    await rulesRows.nth(1).getByTitle('Move up').click()
    await expect(dialog.locator('.reorder-loading-overlay')).not.toBeVisible({ timeout: 30000 })
    await rulesRows.nth(2).getByTitle('Move up').click()
    await expect(dialog.locator('.reorder-loading-overlay')).not.toBeVisible({ timeout: 30000 })

    const yobRow = rulesRows.nth(0)
    await expect(yobRow.locator('td.rule-name')).toHaveText(/^\+\s+Year of Birth\b/)
    await expect(yobRow).toContainText('1,983')
    await expect(yobRow).toContainText('73.61%')

    const conditionRow = rulesRows.nth(1)
    await expect(conditionRow.locator('td.rule-name')).toContainText('Condition Occurrence A')
    await expect(conditionRow).toContainText('557')
    await expect(conditionRow).toContainText('20.68%')

    const genderRow = rulesRows.nth(2)
    await expect(genderRow.locator('td.rule-name')).toHaveText(/^\+\s+Gender\b/)
    await expect(genderRow).toContainText('291')
    await expect(genderRow).toContainText('10.80%')

    const visitRow = rulesRows.nth(3)
    await expect(visitRow.locator('td.rule-name')).toContainText('Visit A')
    await expect(visitRow).toContainText('199')
    await expect(visitRow).toContainText('7.39%')
  })

  await test.step('Close Inclusion Report dialog', async () => {
    await dialog.locator('.inclusion-report-dialog__close-btn').click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Attrition Plot' })).toBeVisible()
  })
})
