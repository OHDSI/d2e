import { test, expect } from '@playwright/test'

const TEST_NAME = 'e2e PA and Cohorts'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)

const PASSWORD = 'Updatepassword12345'
const RUN_ID = Date.now().toString(36)
const RESEARCHER_1 = `researcher1_${RUN_ID}`
const RESEARCHER_2 = `researcher2_${RUN_ID}`
const COHORT_1 = `Cohort 1 ${RUN_ID}`
const COHORT_2 = `Cohort 2 ${RUN_ID}`
const COHORT_1_RENAMED = `Cohort 1 renamed ${RUN_ID}`

async function loginAs(page, username) {
  await page.locator('input[name="identifier"]').fill(username)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function logout(page) {
  await page.getByRole('link', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Logout' }).click()
}

async function createUser(page, username) {
  await page.getByRole('button', { name: 'Add user' }).click()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(2000)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page.getByRole('cell', { name: username })).toBeVisible()
}

async function grantDatasetAccess(page, username) {
  await page.getByRole('link', { name: 'Datasets' }).click()
  const demoRow = page.locator('tr', { hasText: 'Demo dataset' }).first()
  await demoRow.getByText('Select action').click()
  await page.getByRole('option', { name: 'Permissions' }).click()
  await page.getByRole('tab', { name: 'Access' }).click()
  const addButton = page.getByTestId('dialog').getByTestId('button')
  await expect(addButton).toBeVisible()
  await addButton.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.waitForTimeout(5000)
  await expect(page.getByRole('menuitem', { name: username })).toBeVisible()
  await page.getByRole('menuitem', { name: username }).click()
  await expect(page.getByRole('cell', { name: username })).toBeVisible()
  await page.getByTestId('dialog-close').click()
}

async function deleteUser(page, username) {
  // Navigate to Users page
  await page.getByRole('link', { name: 'Users' }).click()
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  const userRow = page.getByRole('row', { name: new RegExp(username) })
  await userRow.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(userRow).not.toBeVisible()
}

async function navigateToCohorts(page) {
  await page.getByRole('link', { name: 'Cohorts' }).click()
  await expect(page.getByText('Create Cohort:')).toBeVisible()
}

async function dismissUnsavedChangesDialog(page) {
  try {
    await page.getByRole('button', { name: 'Leave without saving' }).click({ timeout: 3000 })
  } catch {
    // Dialog not present, continue
  }
}

async function navigateBackToCohortList(page) {
  await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
  await dismissUnsavedChangesDialog(page)
  await page.waitForTimeout(500)
}

test(TEST_NAME, async ({ page }) => {
  // === SETUP: Create two researcher users with Demo dataset access ===
  await page.goto('/d2e/portal')
  await loginAs(page, 'admin')

  // Wait for the portal to fully load after OIDC redirect
  await expect(page.getByText('Demo dataset').first()).toBeVisible()

  // Switch to admin portal (use nth(1) - first Account button is behind the banner overlay)
  await page.getByRole('button', { name: 'Account' }).nth(1).click()
  await page.getByRole('button', { name: 'Switch to Admin portal' }).click()

  // Create researcher users
  await createUser(page, RESEARCHER_1)
  await createUser(page, RESEARCHER_2)

  // Grant both users access to Demo dataset
  await grantDatasetAccess(page, RESEARCHER_1)
  // Re-open permissions dialog for second user
  await page.getByRole('link', { name: 'Datasets' }).click()
  await grantDatasetAccess(page, RESEARCHER_2)

  // Logout admin
  await page.getByRole('link', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Logout' }).click()

  // === TEST: Researcher 1 creates cohorts ===
  await loginAs(page, RESEARCHER_1)

  // Select dataset
  await page.getByText('Demo dataset').first().click()
  await expect(page.getByTestId('card-content')).toContainText('Demo dataset')
  await expect(page.getByRole('tab', { name: 'Dataset Info' })).toBeVisible()

  // Navigate to Cohorts
  await navigateToCohorts(page)
  await expect(page.getByRole('button', { name: 'D2E' })).toBeVisible()

  // Create first cohort with MALE filter
  await page.getByRole('button', { name: 'D2E' }).click()
  await page.getByTitle('Basic Data - Gender').getByText('All').click()
  await page.getByRole('textbox', { name: 'multiselect-searchbox' }).fill('MALE')
  await page.getByText('MALE - MALE').click()
  await expect(page.getByRole('combobox').filter({ hasText: 'MALE' }).first()).toBeVisible()

  // Save cohort 1 - the allow-sharing checkbox now lives in the filter card footer
  // rather than the save dialog, so it has to be set before the dialog opens.
  await page.getByTestId('pa-share-cohort-checkbox').click()
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('textbox', { name: 'Enter name' }).fill(COHORT_1)
  await expect(page.locator('#pane-left')).toContainText('Save Current Filters')
  await expect(page.locator('#pane-left')).toContainText('Enter a new name')
  await expect(page.locator('footer').getByRole('button', { name: 'Save' })).toBeVisible()
  await page.locator('footer').getByRole('button', { name: 'Save' }).click()

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // Navigate back to cohorts
  await navigateBackToCohortList(page)
  await expect(page.locator('#pane-left')).toContainText(COHORT_1)

  // Create second cohort with FEMALE filter
  await page.getByRole('button', { name: 'D2E' }).click()
  await dismissUnsavedChangesDialog(page)

  await page.waitForTimeout(500)
  await page.getByText('All').first().click()
  await page.getByRole('textbox', { name: 'multiselect-searchbox' }).fill('FEMALE')
  await page.getByRole('option').filter({ hasText: 'FEMALE' }).first().click()
  await expect(page.getByRole('combobox').filter({ hasText: 'FEMALE' }).first()).toBeVisible()

  // Save cohort 2 - allow-sharing now lives in the filter card footer, so it has to
  // be set before the save dialog opens.
  await page.getByTestId('pa-share-cohort-checkbox').click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('textbox', { name: 'Enter name' }).fill(COHORT_2)
  await expect(page.locator('#pane-left')).toContainText('Save Current Filters')
  await page.locator('footer').getByRole('button', { name: 'Save' }).click()

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // Navigate back to cohorts
  await navigateBackToCohortList(page)
  await expect(page.locator('#pane-left')).toContainText(COHORT_2)

  // Select both cohorts and verify Compare
  await page.getByTestId(`pa-cohort-card-${COHORT_1}`).getByTestId('pa-cohort-select-btn').click()
  await page.getByTestId(`pa-cohort-card-${COHORT_2}`).getByTestId('pa-cohort-select-btn').click()

  await expect(page.getByRole('button', { name: 'Compare' })).toBeEnabled()
  await page.getByRole('button', { name: 'Compare' }).click()
  await expect(page.getByText('Group Comparison')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  // === TEST: Researcher 2 can see shared cohorts ===
  await logout(page)
  await loginAs(page, RESEARCHER_2)

  await page.getByText('Demo dataset').first().click()
  await navigateToCohorts(page)
  await page.locator('.slider').click()

  await expect(page.locator('#pane-left')).toContainText('Shared')
  await expect(page.locator('#pane-left')).toContainText(COHORT_2)
  await expect(page.locator('#pane-left')).toContainText(COHORT_1)

  // Verify rename and delete are disabled on shared cohorts not owned by researcher_2
  const cohort1Card = page.locator('div:nth-child(2) > .footer')
  const renameButton = cohort1Card.locator('div:nth-child(2)')
  const deleteButton = cohort1Card.locator('div:last-child')
  await expect(renameButton).toHaveClass(/icon-button-disabled/)
  await expect(deleteButton).toHaveClass(/icon-button-disabled/)

  // === TEST: Materialize cohort (add patients) ===
  await page.locator('div:nth-child(2) > .footer > div:nth-child(3) > svg').click()
  await expect(page.locator('#pane-left')).toContainText('Add Patients to Cohort')
  await page
    .locator('div')
    .filter({ hasText: /^Cohort Description:$/ })
    .first()
    .click()
  await page.getByRole('textbox', { name: 'Enter description' }).fill(COHORT_1)
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByText('Patients added to cohort.').first()).toBeVisible()
  // Wait for the success dialog to auto-close
  await expect(page.getByText('Patients added to cohort.').first()).not.toBeVisible({ timeout: 10000 })

  // === TEST: Researcher 1 renames and deletes own cohort ===
  // (Only the owner can modify cohorts, so switch back to researcher_1)
  await logout(page)
  await loginAs(page, RESEARCHER_1)
  await page.getByText('Demo dataset').first().click()
  await navigateToCohorts(page)

  await expect(page.getByRole('status').filter({ hasText: 'Content is loading' })).not.toBeVisible({ timeout: 60000 })

  // Rename cohort
  await page.locator('div:nth-child(2) > .footer > div:nth-child(2) > svg').click({ force: true })
  await expect(page.locator('#pane-left')).toContainText('Rename Saved Filter')
  await expect(page.locator('#pane-left')).toContainText('Specify a new name for bookmark')
  await page.getByRole('textbox').fill(COHORT_1_RENAMED)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('#pane-left')).toContainText(COHORT_1_RENAMED)

  // Navigate back to cohort list
  await navigateBackToCohortList(page)

  // Delete cohort
  await page.locator('.footer > div:last-child > svg').first().click({ force: true })
  await expect(page.locator('#pane-left')).toContainText('Delete Saved Filter')
  await expect(page.locator('#pane-left')).toContainText('Are you sure you want to delete?')
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('#app')).toContainText('Saved filter deleted')

  // Cleanup: delete users as admin
  await logout(page)
  await loginAs(page, 'admin')
  await expect(page.getByText('Demo dataset').first()).toBeVisible()
  await page.getByRole('button', { name: 'Account' }).nth(1).click()
  await page.getByRole('button', { name: 'Switch to Admin portal' }).click()
  await deleteUser(page, RESEARCHER_1)
  await deleteUser(page, RESEARCHER_2)
})
