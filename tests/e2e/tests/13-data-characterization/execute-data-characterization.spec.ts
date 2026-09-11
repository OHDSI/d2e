import { test, expect } from '../fixtures'

const TEST_NAME = 'execute-data-characterization'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)
test.describe.configure({ retries: 3 }) // Re-try up to 3 times for flaky tests

test(TEST_NAME, async ({ page }) => {
  //Increase timeout longer than the configured 30s
  test.setTimeout(360000)

  // Sign in
  await page.goto('/d2e/portal')
  await page.locator('input[name="identifier"]').click()
  await page.locator('input[name="identifier"]').fill('admin')
  await page.locator('input[name="password"]').click()
  await page.locator('input[name="password"]').fill('Updatepassword12345')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByTestId('button').nth(1).click() // account button
  await page.getByRole('button', { name: 'Switch to Admin portal' }).click()

  // Trigger data characterization from Datasets page for demo dataset
  await page.getByRole('link', { name: 'Datasets' }).click()
  const demoDataset = await page.locator('tr', { hasText: 'Demo dataset' }).getByText('Select action')
  await demoDataset.click()
  await page.getByRole('option', { name: 'Run data characterization' }).click()
  await page.getByRole('button', { name: 'Run Analysis' }).click()

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
  }
  await page.getByTestId('dialog-close').click()

  // Wait for job container to stabilize before navigating to Jobs page
  await page.waitForTimeout(5000)
  // Open jobs page
  await page.getByRole('link', { name: 'Jobs' }).click()
  await page.getByRole('button', { name: 'Job Runs' }).click()

  // Verify if DC Job has started running
  await expect(
    page.locator('.state-list-item__content').locator('div').filter({ hasText: 'Running' }).getByRole('img').first()
  ).toBeVisible({ timeout: 80000 })

  // Wait for DC Job to progress further
  await page.waitForTimeout(100000)

  // Verify if DC Job is completed
  await expect(
    page.locator('.state-list-item__content').locator('div').filter({ hasText: 'Completed' }).getByRole('img').first()
  ).toBeVisible({ timeout: 100000 })

  // Switch to researcher portal
  await page.getByRole('link', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Switch to Researcher portal' }).click()

  // Select demo dataset and DC
  await page.getByText('Demo dataset').nth(1).click()
  await page.getByRole('tab', { name: 'Data Characterization' }).click()
  await page.waitForTimeout(10000)

  // Load Charts
  await page.getByRole('combobox', { name: 'Select Data Characterization' }).click()
  await page.getByRole('option', { name: 'Show All Reports' }).click()

  // Verify if Dashboard results are rendered
  await expect(page.getByText('Number of persons: 2,694')).toBeVisible()
  await expect(page.getByText('Concepts Per Person')).toBeVisible()
})
