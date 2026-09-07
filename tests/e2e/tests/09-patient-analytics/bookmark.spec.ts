import { test, expect } from '../fixtures'

const TEST_NAME = 'patient_analytics_bookmark'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)
test.describe.configure({ retries: 3 }) // Re-try up to 3 times for flaky tests

const RUN_ID = Date.now().toString(36)
const NAME = {
  savedFilters: `Test Saved Filters ${RUN_ID}`,
  renamedFilters: `Other saved filters ${RUN_ID}`,
  patientListFilters: `Test Another Patient List Saved Filters ${RUN_ID}`,
  sharedFilter: `Shared saved filter ${RUN_ID}`,
  testUserB: `testuserB_${RUN_ID}`
}

async function openDatasetCohorts(page) {
  const cohortsLink = page.getByRole('link', { name: 'Cohorts' })
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByText('Demo dataset').first().click()
    try {
      await cohortsLink.waitFor({ state: 'visible', timeout: 10_000 })
      await cohortsLink.click()
      return
    } catch {
      await page
        .getByRole('link', { name: 'Dataset' })
        .click()
        .catch(() => {})
    }
  }
  throw new Error('Cohorts link did not appear for selected dataset within ~60s')
}

test(TEST_NAME, async ({ page }) => {
  test.slow()
  await page.goto('/d2e/portal')
  await page.locator('input[name="identifier"]').click()
  await page.locator('input[name="identifier"]').fill('admin')
  await page.locator('input[name="password"]').click()
  await page.locator('input[name="password"]').fill('Updatepassword12345')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await test.step('Navigate back to the researcher portal, click Cohort', async () => {
    await page.getByText('Demo dataset').first().click()
    await page.getByRole('link', { name: 'Cohorts' }).click()
    await page.getByRole('button', { name: 'D2E' }).click()
    await expect(page.getByText('2,694 / 2,694')).toBeVisible()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })
  //Add Age filter
  await test.step('Add Age filter', async () => {
    await page.locator('div[title="Basic Data - Month of Birth"]').click()
    await page.locator('div[title="Basic Data - Month of Birth"]').getByRole('textbox').fill('>2')
    await page.locator('div[title="Basic Data - Month of Birth"]').getByRole('textbox').press('Enter')
    await expect(page.getByText('2,255 / 2,694')).toBeVisible()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })
  //Add Gender filter
  await test.step('Add Gender - Male filter', async () => {
    await page.getByTitle('Basic Data - Gender').getByText('All').click()
    await page.getByPlaceholder('Enter search term').fill('Male')
    await page.getByText('MALE - MALE').click()
    await expect(page.getByText('1,096 / 2,694')).toBeVisible()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })
  //Add Inclusion filter card - Condition Occurrence
  await test.step('Add inclusion filter card for Condition Occurrence', async () => {
    await page.getByTitle('Add Filter Card').getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Condition Occurrence' }).click()
    await page.locator('[id="patient\\.interactions\\.conditionoccurrence\\.1"]').getByText('All').click()
    await page.getByTitle('Condition Occurrence A -').getByPlaceholder('Enter search term').fill('Chronic sinusitis')
    try {
      await expect(page.getByText('Chronic sinusitis')).toBeVisible()
      await page.getByText('Chronic sinusitis').click()
    } catch (e) {
      // If not visible in 2 seconds, continue without failing
      await page.getByTitle('Condition Occurrence A -').getByRole('button').click()
      await page.getByRole('textbox', { name: 'Concept set name' }).click()
      await page.getByRole('textbox', { name: 'Concept set name' }).fill('Chronic sinusitis')
      await page.getByRole('textbox', { name: 'search terms' }).click()
      await page.getByRole('textbox', { name: 'search terms' }).click()
      await page.getByRole('textbox', { name: 'search terms' }).fill('Chronic sinusitis')
      await page.getByRole('button', { name: 'Search' }).click()
      await expect(page.getByRole('row', { name: /40055000.*Chronic sinusitis/ })).toBeVisible({ timeout: 60_000 })
      await page
        .getByRole('row', { name: /40055000.*Chronic sinusitis/ })
        .locator('td')
        .first()
        .click()
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(page.getByRole('button', { name: 'Update' })).toBeVisible() // Ensure concept set is successfully created
      await page.getByRole('button', { name: 'Close' }).click()
      await expect(page.locator('.loading-animation-component')).not.toBeVisible()
      await expect(page.getByText('Chronic sinusitis')).toBeVisible()

      // Dismiss popover if present
      try {
        await page.mouse.move(0, 0)
        await page.locator('.modal-wrapper').click()
      } catch {
        // Modal not present, continue
      }
    }
  })
  //Add Exclusion filter card - Death
  await test.step('Add exclusion filter card for Death', async () => {
    await page.getByRole('link', { name: 'Exclusion (0)' }).click()
    await page.getByTitle('Add Filter Card').getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Death' }).click()
    await expect(page.getByText('A filter card has been added: Death A')).toBeVisible()
    await expect(page.getByText('325 / 2,694')).toBeVisible()
  })
  //Add x1 filter card - Condition Occurrence concept name
  await test.step('Update x1 filter to condition concept name', async () => {
    // await page
    //   .locator('div')
    //   .filter({ hasText: /^Select an Attribute$/ })
    //   .getByRole('button')
    //   .click()
    await page
      .locator('.axis-group--bottom .axis-subgroup')
      .last()
      .locator('button.axisMenuButton', { hasText: 'Gender' })
      .click()
    await page.locator('#pane-right').getByText('Condition Occurrence A').click()
    await page.locator('.dropdownmenuitem-container .content', { hasText: 'Condition concept Name' }).click()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
    await expect(page.locator('.ewdrag')).toBeVisible()
    await expect(page.locator('g.xaxislayer-above text', { hasText: 'Chronic sinusitis' }).first()).toBeVisible()
  })
  //Save the filter card
  await test.step('Save the filter card', async () => {
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('textbox', { name: 'Enter name' }).fill('Test Cohort 2')
    await page.getByRole('textbox', { name: 'Enter name' }).click()
    //Cancel the save
    await page.locator('footer').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
    //Click Save again
    await page.getByRole('button', { name: 'Save' }).click()
    //Previous filter name should be visible
    await expect(page.getByRole('textbox', { name: 'Enter name' })).toHaveValue('Test Cohort 2')
    await page.getByRole('textbox', { name: 'Enter name' }).fill('')
    await page.getByRole('textbox', { name: 'Enter name' }).fill('x'.repeat(256))
    await page.getByRole('textbox', { name: 'Enter name' }).click()
    await expect(page.getByText('Filter name must not exceed 255 characters')).toBeVisible()
    await page.getByRole('textbox', { name: 'Enter name' }).fill('')
    await expect(page.getByText('Filter name must not exceed 255 characters')).not.toBeVisible()
    await page.getByRole('textbox', { name: 'Enter name' }).fill('  ')
    await page.locator('footer').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Please enter a name')).toBeVisible()
    await page.getByRole('textbox', { name: 'Enter name' }).fill(NAME.savedFilters)
    await page.getByRole('textbox', { name: 'Enter name' }).click()
    await page.locator('footer').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Filters saved.')).toBeVisible()
  })
  //Reset x1 selection to avoid displaying errors
  await test.step('Reset the x1 attributes', async () => {
    await page
      .locator('.axis-group--bottom .axis-subgroup')
      .last()
      .getByRole('button', { name: 'A - Condition Occurrence Condition concept Name ◢' })
      .click()
    await page.getByText('Reset Selection').click()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
    await page.getByRole('button', { name: 'Basic Data Month of Birth ◢' }).click()
    await page.getByRole('listitem').filter({ hasText: 'Reset Selection' }).waitFor({ state: 'visible' })
    await page.getByRole('listitem').filter({ hasText: 'Reset Selection' }).click()
    await expect(page.locator('g.xaxislayer-above text', { hasText: 'Current Patient Group' })).toBeVisible()
  })
  //Remove MALE and add FEMALE Gender filter
  await test.step('Add Gender - Male filter', async () => {
    await page.getByTitle('Basic Data - Gender').locator('i').click()
    await page.getByText('Enter search term').click()
    await page.getByPlaceholder('Enter search term').fill('Female')
    await page.getByText('FEMALE - FEMALE').click()
    await expect(page.getByText('357 / 2,694')).toBeVisible()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
  })
  //Save the filter card
  await test.step('Save the filter card', async () => {
    // Confirm that the 'Enter name' textbox is not visible before proceeding
    await expect(page.getByRole('textbox', { name: 'Enter name' })).not.toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    // Re-saving an already-saved cohort owned by the current user no longer opens the
    // naming dialog - FiltersFooter.openSaveBookmark() only does that when
    // needsSaveDialog (isNewCohort || isNotUserSharedBookmark) is true.
    await expect(page.getByRole('textbox', { name: 'Enter name' })).not.toBeVisible()
    await expect(page.getByText('Saved filter updated.')).toBeVisible()
  })
  //Verify the saved filter
  await test.step('Verify the saved filter', async () => {
    await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
    await expect(page.getByText(`${NAME.savedFilters}0. Icons/`)).toBeVisible()
  })
  // Test for duplicate name validation
  await test.step('Test for duplicate name validation', async () => {
    await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
    await page.getByRole('button', { name: 'D2E' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('textbox', { name: 'Enter name' }).click()
    await page.getByRole('textbox', { name: 'Enter name' }).fill(NAME.savedFilters)
    await page.locator('footer').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Cohort name already exists. Please enter another name.')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
  })
  //Rename the saved filter
  await test.step('Rename the saved filter', async () => {
    await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
    await page.locator('.footer > div:nth-child(2) > svg').first().click()
    await page.getByRole('textbox').fill('')
    await page.locator('footer').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Please enter a name')).toBeVisible()
    await page.getByRole('textbox').fill(NAME.renamedFilters)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`${NAME.renamedFilters}0. Icons/`)).toBeVisible()
    await page
      .locator('div')
      .filter({ hasText: new RegExp(`^${NAME.renamedFilters}$`) })
      .first()
      .click()
    // Loading a saved filter from an unmodified (clean) cohort no longer prompts the
    // unsaved-changes dialog (#2636 changed the semantics so a fresh cohort is clean).
    // Dismiss the dialog only if it happens to appear; otherwise the filter loads directly.
    await page
      .getByRole('button', { name: 'Leave without saving' })
      .click({ timeout: 3000 })
      .catch(() => {})
    //Verify filters are loaded
    await expect(page.getByText('>2')).toBeVisible()
    await expect(page.locator('#patient').getByText('FEMALE')).toBeVisible()
    // await expect(page.getByText('Viral sinusitis')).toBeVisible();
    await expect(page.getByText('357 / 2,694')).toBeVisible()
  })
  //Delete the saved filter
  await test.step('Delete the saved filter', async () => {
    await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
    await expect(page.getByText(`${NAME.renamedFilters}0. Icons/`)).toBeVisible()
    await page.getByTitle('Delete Saved Filter').first().click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(`${NAME.renamedFilters}0. Icons/`)).not.toBeVisible()
  })
  //Go back to Cohorts
  await test.step('Go back to Cohorts', async () => {
    await page.getByRole('button', { name: 'D2E' }).click()
    await expect(page.getByText('New cohort')).toBeVisible()
  })
  //Go to patient list
  await test.step('Go to patient list', async () => {
    await page.getByRole('button', { name: '' }).click()
    await expect(page.locator('.loading-animation-component')).not.toBeVisible()
    //Add an interaction - MEASUREMENT

    await page.getByRole('button', { name: 'Add Interaction' }).click()
    await page.locator('#pane-right').getByText('Measurement', { exact: true }).click()
    // Confirm that 'Measurement' exists in the table header
    await expect(page.locator('thead')).toContainText('Measurement')
    await page.getByRole('cell', { name: 'Ethnicity concept id ' }).locator('span').nth(1).click()
    await page.locator('.dropdownmenu-container .menuWrapper:not(.closed)').getByText('Remove').click()
    await page.getByRole('cell', { name: 'Age ' }).locator('span').nth(1).click()
    await page.locator('.dropdownmenu-container .menuWrapper:not(.closed)').getByText('Sort Descending').click()
    //Add basic filters
    await page.getByTitle('Basic Data - Gender').getByText('All').click()
    await page.getByRole('textbox', { name: 'multiselect-searchbox' }).fill('FEMALE')
    await page.getByText('FEMALE - FEMALE').click()
    //Add filter card
    await test.step('Add filter card for Condition Occurrence', async () => {
      await page.getByTitle('Add Filter Card').getByRole('button').click()
      await page.getByRole('menuitem', { name: 'Condition Occurrence' }).click()
      await page.locator('[id="patient\\.interactions\\.conditionoccurrence\\.1"]').getByText('All').click()
      await page.getByTitle('Condition Occurrence A -').getByPlaceholder('Enter search term').fill('Viral sinusitis')
      try {
        // If the concept is already created, it will be visible
        await expect(page.getByText('Viral sinusitis')).toBeVisible()
        await page.getByText('Viral sinusitis').click()
        await expect(page.locator('.loading-animation-component')).not.toBeVisible()
      } catch (e) {
        await page.getByRole('button', { name: '+' }).click()
        await page.getByRole('textbox', { name: 'Concept set name' }).click()
        await page.getByRole('textbox', { name: 'Concept set name' }).fill('Viral sinusitis')
        await page.getByRole('textbox', { name: 'search terms' }).click()
        await page.getByRole('textbox', { name: 'search terms' }).click()
        await page.getByRole('textbox', { name: 'search terms' }).fill('Viral sinusitis')
        await page.getByRole('button', { name: 'Search' }).click()
        await expect(page.getByRole('row', { name: /444814009.*Viral sinusitis/ })).toBeVisible()
        await page
          .getByRole('row', { name: /444814009.*Viral sinusitis/ })
          .locator('td')
          .first()
          .click()
        await page.getByRole('button', { name: 'Create' }).click()
        await expect(page.getByRole('button', { name: 'Update' })).toBeVisible() // Ensure concept set is successfully created
        await page.getByRole('button', { name: 'Close' }).click()
        await expect(page.locator('.loading-animation-component')).not.toBeVisible()
        await expect(page.getByText('Viral sinusitis')).toBeVisible()

        // Dismiss popover if present
        try {
          await page.mouse.move(0, 0)
          await page.locator('.modal-wrapper').click()
        } catch {
          // Modal not present, continue
        }
      }
    })
    await page.getByRole('link', { name: 'Exclusion (0)' }).click()
    await page.getByTitle('Add Filter Card').getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Death' }).click()
    //Save filter - the allow-sharing checkbox now lives in the filter card footer
    //rather than the save dialog, so it has to be set before the dialog opens.
    await page.getByTestId('pa-share-cohort-checkbox').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('textbox', { name: 'Enter name' }).fill(NAME.patientListFilters)
    await page.locator('footer').getByRole('button', { name: 'Save' }).click()
    //Verify Cohort is saved
    await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
    await expect(page.getByText(`${NAME.patientListFilters}0. Icons/`)).toBeVisible()
    //Click on the saved cohort
    await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
    await page.getByText(NAME.patientListFilters).nth(1).click()
    await expect(page.locator('#patient').getByText('FEMALE')).toBeVisible()
    await expect(page.getByText('Viral sinusitis')).toBeVisible()
    await page.getByRole('link', { name: 'Exclusion (1)' }).click()
    await expect(page.getByText('Death A')).toBeVisible()

    //Verify the patient list
    await expect(page.locator('thead')).toContainText('Measurement')
    await expect(page.getByText('Ethnicity concept id')).not.toBeVisible()
  })
  await test.step('Filter Summary', async () => {
    await page.getByRole('button', { name: '' }).click()
    await expect(page.getByText('Filter Summary')).toBeVisible()
    await page.locator('#pane-right div').filter({ hasText: 'Showing patients with:Basic' }).nth(2)
    await expect(page.getByText('Showing patients with:')).toBeVisible()
    await expect(
      page
        .locator('div')
        .filter({ hasText: /^Basic DataGender:FEMALE$/ })
        .first()
    ).toBeVisible()
    await expect(page.getByText('ANDCondition Occurrence')).toBeVisible()
    await expect(page.getByText('ANDDeath A(Excluded)')).toBeVisible()
    await expect(page.getByText('Create ATLAS cohort definition')).toBeVisible()
    await expect(page.getByText('Download SQL')).toBeVisible()
  })
  //Download SQL
  await test.step('Download SQL', async () => {
    //Go full screen
    await page.getByRole('button', { name: '' }).click()
    //Verify that the graph is not visible
    await expect(page.locator('g.xaxislayer-above text', { hasText: 'Current Patient Group' })).not.toBeVisible()
    //Go back full screen
    await page.getByRole('button', { name: '' }).click()
    //Download SQL
    const download2Promise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download SQL' }).click()
    const download2 = await download2Promise
  })
  //Create ATLAS cohort definition
  await test.step('Create ATLAS cohort definition', async () => {
    await page.getByRole('button', { name: 'Create ATLAS cohort definition' }).click()
    await expect(
      page.getByText(
        'Note that conversion to cohort definition is an approximation, and currently does not support "datetime" and "text" types and advanced time filtering. Your cohort definition will be available as an "Atlas Cohort Definition" in the Cohorts overview screen.'
      )
    ).toBeVisible()
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByText('ATLAS cohort definition created successfully and added to Cohorts.')).toBeVisible()
    await page.locator('#pane-left').getByRole('link', { name: 'Cohorts' }).click()
    await expect(page.getByText(`${NAME.patientListFilters}Atlas Cohort DefinitionID`)).toBeVisible()
  })
  //Create another user to verify bookmark visibility
  await test.step('Switch to admin portal', async () => {
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Switch to Admin portal' }).click()
  })
  //Create another user - testuserB
  await test.step('Create user', async () => {
    await page.getByRole('button', { name: 'Add user' }).click()
    await page.getByRole('textbox', { name: 'Username' }).click()
    await page.getByRole('textbox', { name: 'Username' }).fill(NAME.testUserB)
    await page.getByRole('textbox', { name: 'Password' }).click()
    await page.getByRole('textbox', { name: 'Password' }).fill('Updatepassword12345')
    await page.getByRole('button', { name: 'Add' }).click()
    // Wait for the user to appear after clicking Add
    await page.waitForTimeout(2000)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('cell', { name: NAME.testUserB })).toBeVisible()
    //Grant permissions to testuserB
    await page.getByRole('link', { name: 'Datasets' }).click()
    await page.locator('tr', { hasText: 'Demo dataset' }).first().getByText('Select action').click()
    await page.getByRole('option', { name: 'Permissions' }).click()
    await page.getByRole('tab', { name: 'Access' }).click()
    await page.getByTestId('dialog').getByTestId('button').click()
    await expect(page.getByRole('menuitem', { name: NAME.testUserB })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('menuitem', { name: NAME.testUserB }).click()
    await expect(page.getByRole('cell', { name: NAME.testUserB })).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('dialog-close').click()
  })

  await test.step('Verify bookmark visibility', async () => {
    //Login as testuserB
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Logout' }).click()
    await page.locator('input[name="identifier"]').click()
    await page.locator('input[name="identifier"]').fill(NAME.testUserB)
    await page.locator('input[name="password"]').click()
    await page.locator('input[name="password"]').fill('Updatepassword12345')
    await page.getByRole('button', { name: 'Sign in' }).click()
    //Verify that the bookmark is visible
    await openDatasetCohorts(page)
    await expect(page.getByText(NAME.patientListFilters)).toBeVisible()
    //Login as admin again
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Logout' }).click()
    await page.locator('input[name="identifier"]').click()
    await page.locator('input[name="identifier"]').fill('admin')
    await page.locator('input[name="password"]').click()
    await page.locator('input[name="password"]').fill('Updatepassword12345')
    await page.getByRole('button', { name: 'Sign in' }).click()
    //Rename the bookmark
    await page.getByText('Demo dataset').first().click()
    await page.getByRole('link', { name: 'Cohorts' }).click()
    await page.locator('div:nth-child(2) > .footer > div:nth-child(2) > svg').click()
    await page.getByRole('textbox').fill('')
    await page.getByRole('textbox').fill(NAME.sharedFilter)
    await page.getByRole('button', { name: 'Save' }).click()
    //Logout as admin
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Logout' }).click()
    //Login as testuserB
    await page.locator('input[name="identifier"]').click()
    await page.locator('input[name="identifier"]').fill(NAME.testUserB)
    await page.locator('input[name="identifier"]').press('Tab')
    await page.locator('input[name="password"]').click()
    await page.locator('input[name="password"]').fill('Updatepassword12345')
    await page.getByRole('button', { name: 'Sign in' }).click()
    //Verify that the bookmark is renamed
    await openDatasetCohorts(page)
    await page.locator('#pane-left label div').click()
    await expect(page.getByText(NAME.sharedFilter)).toBeVisible()
    //Delete the bookmark as admin
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Logout' }).click()
    await page.locator('input[name="identifier"]').click()
    await page.locator('input[name="identifier"]').fill('admin')
    await page.locator('input[name="password"]').click()
    await page.locator('input[name="password"]').fill('Updatepassword12345')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByText('Demo dataset').first().click()

    await page.getByRole('link', { name: 'Cohorts' }).click()
    //Delete the Shared saved filter
    await test.step('Delete Shared saved filter', async () => {
      await expect(page.getByText(NAME.sharedFilter)).toBeVisible()
      await page
        .locator('.item-card', { hasText: 'D2E Cohort Definition' })
        .locator('.footer .icon-button[title="Delete Saved Filter"]')
        .click()
      await page.getByRole('button', { name: 'Delete' }).click()
      await expect(page.getByText(NAME.sharedFilter)).not.toBeVisible()
    })
    //Delete the Atlas Cohort Definition
    await test.step('Delete Atlas Cohort Definition', async () => {
      await expect(page.getByText(NAME.patientListFilters)).toBeVisible()
      await page
        .locator('.item-card', { hasText: 'Atlas Cohort Definition' })
        .locator('.footer .icon-button[title="Delete Saved Filter"]')
        .click()
      await page.getByRole('button', { name: 'Delete' }).click()
      await expect(page.getByText(NAME.patientListFilters)).not.toBeVisible()
    })
    await expect(page.getByText('You have not yet saved any cohort definitions')).toBeVisible()
  })

  //Delete concept sets
  await test.step('Delete Concept Sets', async () => {
    await page.getByRole('link', { name: 'Concepts' }).click()
    await page.getByRole('tab', { name: 'Concept Sets' }).click()

    // Delete Chronic sinusitis
    await page.getByRole('row', { name: 'Chronic sinusitis' }).getByRole('button').nth(1).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(page.getByRole('cell', { name: 'Chronic sinusitis' })).not.toBeVisible()

    // Delete Viral sinusitis
    await page.getByRole('row', { name: 'Viral sinusitis' }).getByRole('button').nth(1).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(page.getByRole('cell', { name: 'Viral sinusitis' })).not.toBeVisible()
  })

  await test.step('Delete testuserB', async () => {
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Switch to Admin portal' }).click()
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    const userRow = page.getByRole('row', { name: new RegExp(NAME.testUserB) })
    await userRow.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await expect(userRow).not.toBeVisible()
  })
})
