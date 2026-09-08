import { test, expect } from '../fixtures'
import { MINUTE_10 } from '../const'

const TEST_NAME = 'execute-data-quality'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)
test.describe.configure({ retries: 3 }) // Re-try up to 3 times for flaky tests

test(TEST_NAME, async ({ page }) => {
  //Increase timeout longer than default
  test.setTimeout(MINUTE_10)

  // Sign in
  await page.goto('/d2e/portal')
  await page.locator('input[name="identifier"]').click()
  await page.locator('input[name="identifier"]').fill('admin')
  await page.locator('input[name="password"]').click()
  await page.locator('input[name="password"]').fill('Updatepassword12345')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByTestId('button').nth(1).click() // account button
  await page.getByRole('button', { name: 'Switch to Admin portal' }).click()

  // Trigger data quality from Datasets page for demo dataset
  await page.getByRole('link', { name: 'Datasets' }).click()
  const demoDataset = await page.locator('tr', { hasText: 'Demo dataset' }).getByText('Select action')
  await demoDataset.click()
  await page.getByRole('option', { name: 'Run data quality' }).click()
  await page.getByRole('button', { name: 'Run Analysis' }).click()
  await expect(page.getByTestId('alert-message')).toContainText('Successfully generated dqd')

  // Grant researcher dataset permissions
  await demoDataset.click()
  await page.getByRole('option', { name: 'Permissions' }).click()
  await page.getByRole('tab', { name: 'Access' }).click()

  // Check if the user is already granted researcher access
  await page.waitForTimeout(5000)
  const isVisible = await page.getByRole('cell', { name: 'admin', exact: true }).isVisible()

  if (!isVisible) {
    const addExistingUsersButton = page.getByTestId('dialog').getByTestId('button')
    await expect(addExistingUsersButton).toBeVisible()
    await addExistingUsersButton.click()
    // Wait for 5 seconds to ensure the menu items are visible
    await page.waitForTimeout(5000)
    await expect(page.getByRole('menuitem', { name: /admin/ })).toBeVisible()
    await page.getByRole('menuitem', { name: /admin/ }).click()
    await expect(page.getByRole('cell', { name: /admin/ })).toBeVisible()
    await expect(page.getByTestId('alert-message')).toContainText('User admin has been granted permission')
  }
  await page.getByTestId('dialog-close').click()

  // Wait for job container to stabilize before navigating to Jobs page
  await page.waitForTimeout(5000)
  // Open jobs page
  await page.getByRole('link', { name: 'Jobs' }).click()
  await page.getByRole('button', { name: 'Job Runs' }).click()

  // Verify if Data Quality Job has started running
  await expect(
    page.locator('.state-list-item__content').locator('div').filter({ hasText: 'Running' }).getByRole('img').first()
  ).toBeVisible({ timeout: 80000 })

  // Verify if Data Quality Job is completed
  await expect(
    page.locator('.state-list-item__content').locator('div').filter({ hasText: 'Completed' }).getByRole('img').first()
  ).toBeVisible({ timeout: 200000 })

  // Switch to researcher portal
  await page.getByRole('link', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Switch to Researcher portal' }).click()

  // Select demo dataset and Data Quality
  await page.getByText('Demo dataset').nth(1).click()
  await page.getByRole('tab', { name: 'Data Quality' }).click()

  // Expect to see dataset name
  await expect(page.getByTestId('card-content').getByText('Demo dataset')).toBeVisible()

  // Expect to see overview
  await expect(page.getByText('Overview')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Verification' })).toBeVisible({ timeout: MINUTE_10 })
  await expect(page.getByRole('columnheader', { name: 'Validation' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Total' }).first()).toBeVisible()
  await expect(page.getByText('passed checks are not applicable, due to empty tables or fields')).toBeVisible()

  // Expect to see Results. The table streams in behind a "Loading DQD results"
  // spinner, and that text contains "Results" too, so an inexact match resolves to
  // two elements and trips strict mode for as long as the spinner is up. Wait for
  // it to clear, then match the heading exactly.
  await expect(page.getByText('Loading DQD results')).toBeHidden({ timeout: MINUTE_10 })
  await expect(page.getByText('Results', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download JSON' })).toBeVisible()
  await expect(page.getByText('Rows per page')).toBeVisible() // Check that table footer has rendered
})
