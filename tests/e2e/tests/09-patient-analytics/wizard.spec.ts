import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'
import { MINUTE_1, MINUTE_2, MINUTE_5 } from '../const'

// Shinylive runs Python in WebAssembly, which only boots in a secure context.
// The self-signed local/CI cert isn't treated as secure by default, so mark the
// app origin secure for THIS spec's browser only (worker-scoped override).
const appOrigin = new URL(process.env.D2E_BASE_URL ?? 'https://localhost:41100').origin
test.use({
  launchOptions: {
    args: ['--ignore-certificate-errors', `--unsafely-treat-insecure-origin-as-secure=${appOrigin}`]
  }
})

const TEST_NAME = 'patient-analytics-wizard-dashboard'
const DASHBOARD_NAME = 'cross-sectional-demographics'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)
test.describe.configure({ retries: 1 }) // Re-try for flaky long-running flow

async function getDialogMonacoValue(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('.manage-viewer-dialog')
    const editors = (globalThis as any).monaco?.editor?.getEditors?.() ?? []
    const editor = editors.find((ed: any) => {
      const node = ed?.getDomNode?.()
      return !!node && !!dialog && dialog.contains(node) && node.offsetParent !== null
    })
    return editor?.getValue?.() ?? ''
  })
}

// Helper function to set Monaco Editor content, with intelligent dedentation of the input code string.
async function setMonacoContent(page: Page, content: string) {
  // The Python below is indented to align with the surrounding test code. Strip the
  // common leading indentation so the indentation-sensitive source is set at the correct
  // levels (a leading blank line, from the opening backtick, is dropped first).
  const lines = content.replace(/^\n/, '').split('\n')
  const widths = lines.filter((l: string) => l.trim().length).map((l: string) => l.match(/^ */)?.[0].length ?? 0)
  const minIndent = widths.length ? Math.min(...widths) : 0
  const dedented = lines.map((l: string) => l.slice(minIndent)).join('\n')

  await waitForDashboardDialog(page)
  await page.waitForFunction(() => {
    const dialog = document.querySelector('.manage-viewer-dialog')
    const editors = (globalThis as any).monaco?.editor?.getEditors?.() ?? []
    return editors.some((ed: any) => {
      const node = ed?.getDomNode?.()
      return !!node && !!dialog && dialog.contains(node) && node.offsetParent !== null
    })
  })

  await page.evaluate((code: string) => {
    const dialog = document.querySelector('.manage-viewer-dialog')
    const editors = (globalThis as any).monaco?.editor?.getEditors?.() ?? []
    const ed = editors.find((editor: any) => {
      const node = editor?.getDomNode?.()
      return !!node && !!dialog && dialog.contains(node) && node.offsetParent !== null
    })
    if (!ed) {
      throw new Error('No active Monaco editor found in dashboard dialog')
    }
    ed.focus()
    ed.setValue(code)
  }, dedented)

  await expect.poll(() => getDialogMonacoValue(page), { timeout: MINUTE_1 }).toBe(dedented)
}

async function waitForDashboardDialog(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Edit dashboard viewer code' })
  await expect(dialog).toBeVisible({ timeout: MINUTE_2 })
  await expect(dialog.locator('.manage-viewer-dialog__loading')).toBeHidden({ timeout: MINUTE_1 })
  await expect(dialog.locator('.monaco-editor')).toBeVisible({ timeout: MINUTE_1 })
  return dialog
}

async function fillDashboardName(page: Page) {
  const dialog = await waitForDashboardDialog(page)
  const newNameInput = dialog.getByPlaceholder('Enter new name')
  await expect(newNameInput).toBeEnabled()
  const currentValue = await newNameInput.inputValue()
  if (currentValue !== DASHBOARD_NAME) {
    await newNameInput.fill(DASHBOARD_NAME)
  }
  await expect(newNameInput).toHaveValue(DASHBOARD_NAME)
}

async function selectPythonViewer(page: Page) {
  let dialog = await waitForDashboardDialog(page)
  if (
    await dialog
      .getByRole('combobox')
      .filter({ hasText: /^Python$/ })
      .isVisible()
  ) {
    return
  }
  await dialog.getByRole('combobox').filter({ hasText: /^R$/ }).click()
  await page.getByRole('option', { name: 'Python' }).click()
  // Switching viewer can remount the dialog content; reacquire locators after it settles.
  dialog = await waitForDashboardDialog(page)
  await expect(dialog.getByRole('combobox').filter({ hasText: /^Python$/ })).toBeVisible()
}

async function ensurePythonViewerAndDashboardName(page: Page) {
  await selectPythonViewer(page)
  await fillDashboardName(page)

  let dialog = await waitForDashboardDialog(page)
  const pythonCombo = dialog.getByRole('combobox').filter({ hasText: /^Python$/ })
  await expect(pythonCombo).toBeVisible()

  let newNameInput = dialog.getByPlaceholder('Enter new name')
  if ((await newNameInput.inputValue()) !== DASHBOARD_NAME) {
    await fillDashboardName(page)
    dialog = await waitForDashboardDialog(page)
    newNameInput = dialog.getByPlaceholder('Enter new name')
  }

  await expect(newNameInput).toHaveValue(DASHBOARD_NAME)
}

async function ensureAdminDatasetPermission(page: Page) {
  await page.getByRole('tab', { name: 'Access' }).click()
  if (await page.getByRole('cell', { name: 'admin' }).isVisible()) {
    return
  }

  await page.getByRole('button', { name: 'Add existing users' }).click()
  await page.getByRole('menuitem', { name: 'admin' }).click()
  await expect(page.getByTestId('alert-message')).toContainText('User admin has been granted permission.')
}

test(TEST_NAME, async ({ page }) => {
  // Provisioning a dataset + a cold first Shiny build + Shinylive render is slow.
  test.setTimeout(20 * 60 * 1000)
  await page.goto('/d2e/portal')
  await page.locator('input[name="identifier"]').click()
  await page.locator('input[name="identifier"]').fill('admin')
  await page.locator('input[name="password"]').click()
  await page.locator('input[name="password"]').fill('Updatepassword12345')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByTestId('button').nth(1).click()
  await page.getByRole('button', { name: 'Switch to Admin portal' }).click()

  // Pre-clean: delete the test dataset if it already exists (from a previous failed run)
  await test.step('Preclean', async () => {
    await page.getByRole('link', { name: 'Datasets' }).click()
    await expect(page.locator('.studyoverview__list tbody tr').first()).toBeVisible()
    const datasetRow = page.locator('tr', { hasText: 'wizardE2E' }).first()
    // To ensure the datasets are loaded.
    await expect(page.locator('tr', { hasText: 'Demo dataset' }).first()).toBeVisible()
    // If the wizardE2E exists, delete it. If not, skip this step.
    if (await datasetRow.isVisible()) {
      await datasetRow.scrollIntoViewIfNeeded()
      await datasetRow.getByText('Select action').click()
      await page.getByRole('option', { name: 'Delete dataset' }).click()
      await page.getByRole('textbox', { name: 'Enter dataset name to confirm' }).fill('wizardE2E')
      await page.getByRole('button', { name: 'Yes, delete' }).click()
      await page.reload()
      await expect(page.locator('.studyoverview__list tbody tr').first()).toBeVisible()
    }
  })

  // Create a new dataset with the OMOP CDM, and assign admin permissions to it (to ensure it's visible in the PA app)
  await test.step('Add new dataset', async () => {
    await page.getByRole('link', { name: 'Datasets' }).click()
    await page.getByRole('button', { name: 'Add dataset' }).click()
    await page.getByRole('textbox', { name: 'Dataset name - Displayed on' }).click()
    await page.getByRole('textbox', { name: 'Dataset name - Displayed on' }).fill('wizardE2E')
    await page.locator('#mui-component-select-schemaOption').click()
    await page.getByRole('option', { name: 'Use existing schema' }).click()
    await page.locator('#mui-component-select-databaseOption').click()
    await page.getByRole('option', { name: 'demo_database-postgres' }).click()
    await page.getByRole('textbox', { name: 'Schema name', exact: true }).click()
    await page.getByRole('textbox', { name: 'Schema name', exact: true }).fill('demo_cdm')
    await page.getByText('Use default result schema name').click()
    await page.locator('#mui-component-select-dataModelOption').click()
    await page.getByRole('option', { name: 'omop5-4 [omop_cdm_plugin]' }).click()
    await page.getByLabel('', { exact: true }).click()
    await page.getByRole('option', { name: 'OMOP', exact: true }).click()
    await page.getByRole('textbox', { name: 'Token dataset code' }).click()
    await page.getByRole('textbox', { name: 'Token dataset code' }).fill('wizardE2E')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Dataset wizardE2E has been created successfully')).toBeVisible({ timeout: MINUTE_1 })
    await page.getByTestId('dialog').getByTestId('button').click()
    const wizardRow = page.locator('tr', { hasText: 'wizardE2E' }).first()
    await wizardRow.getByText('Select action').click()
    await page.getByRole('option', { name: 'Permissions' }).click()
    await ensureAdminDatasetPermission(page)
    // Granting a permission to the signed-in account changes that account's own
    // authorization, so the portal refreshes its token and re-renders the dialog
    // underneath us: the close button is detached and replaced while being
    // clicked. Re-resolve and retry rather than racing a single attempt.
    await expect(async () => {
      // The grant changes the signed-in account's own authorization, so the
      // portal renews its token and re-renders: the dialog may close on its own
      // before this runs, or be replaced mid-click. Either way the goal is the
      // same - the dialog is gone - so treat an already-closed one as done
      // rather than waiting for a close button that no longer exists.
      if (await page.getByTestId('dialog').isHidden()) return
      await page.getByTestId('dialog-close').click({ timeout: 5000 })
      await expect(page.getByTestId('dialog')).toBeHidden({ timeout: 5000 })
    }).toPass({ timeout: 60000 })

    // Check dashboard wizard is accessible and can be opened
    await page.getByRole('link', { name: 'Setup' }).click()
    await page.getByTestId('button').nth(2).click()
    // check if Dashboard and Wizards are checked
    if (!(await page.getByText('Dashboards').isChecked())) {
      await page.getByText('Dashboards').click()
    }
    if (!(await page.getByText('Wizards').isChecked())) {
      await page.getByText('Wizards').click()
    }
    await page.getByTestId('button').click()
  })

  // Edit Wizard in Cohort Builder Config card
  await test.step('Edit Wizard', async () => {
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Logout' }).click()
    await page.locator('input[name="identifier"]').click()
    await page.locator('input[name="identifier"]').fill('admin')
    await page.locator('input[name="password"]').click()
    await page.locator('input[name="password"]').fill('Updatepassword12345')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByTestId('button').nth(1).click()
    await page.getByRole('button', { name: 'Switch to Admin portal' }).click()
    await page.getByRole('link', { name: 'Setup' }).click()

    await page
      .locator('div')
      .filter({ hasText: /^Cohort builder configConfigure cohort builderConfigure$/ })
      .getByTestId('button')
      .click()
    await page.locator('[id$="dataModelConfigurationsCombo-arrow"]').click()
    await page.getByRole('option', { name: 'OMOP_DM' }).click()
    await page.getByRole('button', { name: 'Wizards JSON :' }).click()
    await page
      .getByRole('dialog', { name: 'Edit Wizards JSON' })
      .getByRole('textbox')
      .fill(
        '{\n  "wizards": [\n    {\n      "id": "calculate-incidence",\n      "name": "Calculate Incidence",\n      "description": "This wizard will calculate the incidence for a particular clinical condition. This calculation is done in SQL, and this works by finding the first instance of the condition (the diagnostic code) and determining if it occurs between a particular set of dates that you specify.",\n      "fields": [\n        {\n          "id": "age",\n          "type": "num",\n          "label": "Age Range",\n          "required": true,\n          "configPath": "patient.attributes.Age"\n        },\n        {\n          "id": "gender",\n          "type": "text",\n          "label": "Gender",\n          "required": true,\n          "configPath": "patient.attributes.Gender_concept_name"\n        },\n        {\n          "id": "ethnicity",\n          "type": "text",\n          "label": "Ethnicity",\n          "required": true,\n          "configPath": "patient.attributes.ethnicityName"\n        },\n        {\n          "id": "race",\n          "type": "text",\n          "label": "Race",\n          "required": true,\n          "configPath": "patient.attributes.raceName"\n        },\n        {\n          "id": "height",\n          "type": "num",\n          "label": "Height",\n          "placeholder": "cm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Height"\n            }\n          ]\n        },\n        {\n          "id": "weight",\n          "type": "num",\n          "label": "Weight",\n          "placeholder": "kg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Weight"\n            }\n          ]\n        },\n        {\n          "id": "bmi",\n          "type": "num",\n          "label": "BMI",\n          "placeholder": "kg/m\\u00b2",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body mass index"\n            }\n          ]\n        },\n        {\n          "id": "respRate",\n          "type": "num",\n          "label": "Resp Rate",\n          "placeholder": "bpm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Respiratory rate"\n            }\n          ]\n        },\n        {\n          "id": "pulseRate",\n          "type": "num",\n          "label": "Pulse Rate",\n          "placeholder": "bpm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Pulse rate"\n            }\n          ]\n        },\n        {\n          "id": "systolicBp",\n          "type": "num",\n          "label": "Systolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Systolic blood pressure"\n            }\n          ]\n        },\n        {\n          "id": "diastolicBp",\n          "type": "num",\n          "label": "Diastolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Diastolic blood pressure"\n            }\n          ]\n        },\n        {\n          "id": "year",\n          "type": "yearRange",\n          "label": "Years",\n          "required": true,\n          "isWizardField": true\n        },\n        {\n          "id": "condition1",\n          "type": "text",\n          "label": "Condition 1",\n          "required": true,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition2",\n          "type": "text",\n          "label": "Condition 2",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition3",\n          "type": "text",\n          "label": "Condition 3",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition4",\n          "type": "text",\n          "label": "Condition 4",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition5",\n          "type": "text",\n          "label": "Condition 5",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        }\n      ]\n    },\n    {\n      "id": "calculate-prevalence",\n      "name": "Calculate Prevalence",\n      "description": "This wizard will calculate the prevalence for a particular clinical condition. This calculation is done in SQL, and this works by finding the first instance of a condition.",\n      "fields": [\n        {\n          "id": "age",\n          "type": "num",\n          "label": "Age Range",\n          "required": true,\n          "configPath": "patient.attributes.Age"\n        },\n        {\n          "id": "gender",\n          "type": "text",\n          "label": "Gender",\n          "required": true,\n          "configPath": "patient.attributes.Gender_concept_name"\n        },\n        {\n          "id": "ethnicity",\n          "type": "text",\n          "label": "Ethnicity",\n          "required": true,\n          "configPath": "patient.attributes.ethnicityName"\n        },\n        {\n          "id": "race",\n          "type": "text",\n          "label": "Race",\n          "required": true,\n          "configPath": "patient.attributes.raceName"\n        },\n        {\n          "id": "height",\n          "type": "num",\n          "label": "Height",\n          "placeholder": "cm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Height"\n            }\n          ]\n        },\n        {\n          "id": "weight",\n          "type": "num",\n          "label": "Weight",\n          "placeholder": "kg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Weight"\n            }\n          ]\n        },\n        {\n          "id": "bmi",\n          "type": "num",\n          "label": "BMI",\n          "placeholder": "kg/m\\u00b2",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body mass index"\n            }\n          ]\n        },\n        {\n          "id": "respRate",\n          "type": "num",\n          "label": "Resp Rate",\n          "placeholder": "bpm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Respiratory rate"\n            }\n          ]\n        },\n        {\n          "id": "pulseRate",\n          "type": "num",\n          "label": "Pulse Rate",\n          "placeholder": "bpm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Pulse rate"\n            }\n          ]\n        },\n        {\n          "id": "systolicBp",\n          "type": "num",\n          "label": "Systolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Systolic blood pressure"\n            }\n          ]\n        },\n        {\n          "id": "diastolicBp",\n          "type": "num",\n          "label": "Diastolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Diastolic blood pressure"\n            }\n          ]\n        },\n        {\n          "id": "year",\n          "type": "yearRange",\n          "label": "Years",\n          "required": true,\n          "isWizardField": true\n        },\n        {\n          "id": "condition1",\n          "type": "text",\n          "label": "Condition 1",\n          "required": true,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition2",\n          "type": "text",\n          "label": "Condition 2",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition3",\n          "type": "text",\n          "label": "Condition 3",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition4",\n          "type": "text",\n          "label": "Condition 4",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition5",\n          "type": "text",\n          "label": "Condition 5",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        }\n      ]\n    },\n    {\n      "id": "calculate-mortality",\n      "name": "Calculate Mortality",\n      "description": "This wizard will calculate the mortality rate for a particular clinical condition, and works by death dates that co-occur with a condition between a particular set of dates that you specify.",\n      "fields": [\n        {\n          "id": "age",\n          "type": "num",\n          "label": "Age Range",\n          "required": true,\n          "configPath": "patient.attributes.Age"\n        },\n        {\n          "id": "gender",\n          "type": "text",\n          "label": "Gender",\n          "required": true,\n          "configPath": "patient.attributes.Gender_concept_name"\n        },\n        {\n          "id": "ethnicity",\n          "type": "text",\n          "label": "Ethnicity",\n          "required": true,\n          "configPath": "patient.attributes.ethnicityName"\n        },\n        {\n          "id": "race",\n          "type": "text",\n          "label": "Race",\n          "required": true,\n          "configPath": "patient.attributes.raceName"\n        },\n        {\n          "id": "height",\n          "type": "num",\n          "label": "Height",\n          "placeholder": "cm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Height"\n            }\n          ]\n        },\n        {\n          "id": "weight",\n          "type": "num",\n          "label": "Weight",\n          "placeholder": "kg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Weight"\n            }\n          ]\n        },\n        {\n          "id": "bmi",\n          "type": "num",\n          "label": "BMI",\n          "placeholder": "kg/m\\u00b2",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body mass index"\n            }\n          ]\n        },\n        {\n          "id": "respRate",\n          "type": "num",\n          "label": "Resp Rate",\n          "placeholder": "bpm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Respiratory rate"\n            }\n          ]\n        },\n        {\n          "id": "pulseRate",\n          "type": "num",\n          "label": "Pulse Rate",\n          "placeholder": "bpm",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Pulse rate"\n            }\n          ]\n        },\n        {\n          "id": "systolicBp",\n          "type": "num",\n          "label": "Systolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Systolic blood pressure"\n            }\n          ]\n        },\n        {\n          "id": "diastolicBp",\n          "type": "num",\n          "label": "Diastolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": true,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Diastolic blood pressure"\n            }\n          ]\n        },\n        {\n          "id": "year",\n          "type": "yearRange",\n          "label": "Years",\n          "required": true,\n          "isWizardField": true\n        },\n        {\n          "id": "condition1",\n          "type": "text",\n          "label": "Condition 1",\n          "required": true,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition2",\n          "type": "text",\n          "label": "Condition 2",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition3",\n          "type": "text",\n          "label": "Condition 3",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition4",\n          "type": "text",\n          "label": "Condition 4",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "condition5",\n          "type": "text",\n          "label": "Condition 5",\n          "required": false,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        }\n      ]\n    },\n    {\n      "id": "cross-sectional-demographics",\n      "name": "Cross sectional Demographics",\n      "description": "Assessment of hypertension and cholesterol levels in post-operative patients.",\n      "fields": [\n        {\n          "id": "condition1",\n          "type": "text",\n          "label": "Disease/Condition",\n          "required": true,\n          "configPath": "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",\n          "isWizardField": true,\n          "allowFreeText": true\n        },\n        {\n          "id": "age",\n          "type": "num",\n          "label": "Age Range",\n          "required": false,\n          "configPath": "patient.attributes.Age"\n        },\n        {\n          "id": "gender",\n          "type": "text",\n          "label": "Gender",\n          "required": false,\n          "configPath": "patient.attributes.Gender_concept_name"\n        },\n        {\n          "id": "ethnicity",\n          "type": "text",\n          "label": "Ethnicity",\n          "required": false,\n          "configPath": "patient.attributes.ethnicityName"\n        },\n        {\n          "id": "race",\n          "type": "text",\n          "label": "Race",\n          "required": false,\n          "configPath": "patient.attributes.raceName"\n        },\n        {\n          "id": "year",\n          "type": "yearRange",\n          "label": "Years",\n          "required": false,\n          "isWizardField": true\n        },\n        {\n          "id": "height",\n          "type": "num",\n          "label": "Height",\n          "placeholder": "cm",\n          "required": false,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Height"\n            }\n          ]\n        },\n        {\n          "id": "weight",\n          "type": "num",\n          "label": "Weight",\n          "placeholder": "kg",\n          "required": false,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body Weight"\n            }\n          ]\n        },\n        {\n          "id": "bmi",\n          "type": "num",\n          "label": "BMI",\n          "placeholder": "kg/m\\u00b2",\n          "required": false,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Body mass index"\n            }\n          ]\n        },\n        {\n          "id": "respRate",\n          "type": "num",\n          "label": "Resp Rate",\n          "placeholder": "bpm",\n          "required": false,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Respiratory rate"\n            }\n          ]\n        },\n        {\n          "id": "pulseRate",\n          "type": "num",\n          "label": "Pulse Rate",\n          "placeholder": "bpm",\n          "required": false,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Pulse rate"\n            }\n          ]\n        },\n        {\n          "id": "systolicBp",\n          "type": "num",\n          "label": "Systolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": false,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Systolic blood pressure"\n            }\n          ]\n        },\n        {\n          "id": "diastolicBp",\n          "type": "num",\n          "label": "Diastolic Blood Pressure",\n          "placeholder": "mmHg",\n          "required": false,\n          "configPath": "patient.interactions.measurement.attributes.numval",\n          "filterCardPath": "patient.interactions.measurement",\n          "fixedAttributes": [\n            {\n              "configPath": "patient.interactions.measurement.attributes.meas_concept_name",\n              "operator": "=",\n              "value": "Diastolic blood pressure"\n            }\n          ]\n        }\n      ]\n    }\n  ]\n}'
      )
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
  })

  // Create dashboard
  await test.step('Create Dashboard', async () => {
    await page.getByRole('link', { name: 'Datasets' }).click()
    await expect(page.locator('.studyoverview__list tbody tr').first()).toBeVisible()
    const wizardRow = page.locator('tr', { hasText: 'wizardE2E' }).first()
    await wizardRow.scrollIntoViewIfNeeded()
    await wizardRow.getByText('Select action').click()
    await page.getByRole('option', { name: 'Manage dashboard' }).click()
    await page.getByText('Dashboard', { exact: true }).click()
    await page.getByRole('option', { name: 'Cohort' }).click()
    await ensurePythonViewerAndDashboardName(page)

    await setMonacoContent(
      page,
      `
    import json
    import urllib.request
    import urllib.error
    import urllib.parse
    import pandas as pd
    import numpy as np
    from math import floor
    from datetime import datetime
    from typing import Optional, Dict, Any

    import plotly.express as px
    import plotly.graph_objects as go

    from shiny import App, ui, reactive, render
    from shinywidgets import render_widget, output_widget


    # Dashboard configuration
    dashboard_name = "cross-sectional-demographics"
    template_id = name = "cross-sectional-demographics"
    dashboard_type = "cohort"
    result_format = "json"

    color_discrete_sequence = ["#333399",
                            "#999FCB",
                            "#FFA19D",
                            "#FF5E59",
                            "#D53939"]

    # Common axis styling
    AXIS_LINE_STYLE = {
        'showline': True,
        'linecolor': 'black',
        'linewidth': 2,
    }

    # Font styling constants
    AXIS_TITLE_FONT = dict(color="black", size=14, weight=500)
    AXIS_TICK_FONT = dict(color="black", size=12, weight=500)
    BAR_LABEL_FONT = dict(color="black", size=12, weight=500)

    def calculate_bin_interval(max_value: float, target_ticks: int = 5) -> float:
        """
        Calculate a clean, round interval for chart axes.
        Returns an interval that produces nice numbers like 25, 50, 100, 200, 500, 1000, etc.
        """
        if max_value == 0:
            return 1
        
        # Calculate rough interval
        rough_interval = max_value / target_ticks
        
        # Get the magnitude (power of 10)
        magnitude = 10 ** floor(np.log10(rough_interval))
        
        # Normalize to range [1, 10)
        normalized = rough_interval / magnitude
        
        # Choose nice round number
        if normalized <= 1:
            nice_interval = 1
        elif normalized <= 2:
            nice_interval = 2
        elif normalized <= 2.5:
            nice_interval = 2.5
        elif normalized <= 5:
            nice_interval = 5
        else:
            nice_interval = 10
        
        return nice_interval * magnitude


    # Constant for Plotly hoverlabel style
    HOVERLABEL_STYLE = dict(
        #bgcolor="lightblue",
        #bordercolor="gray",
        font_color="white",
        font_size=13,
        namelength=-1
    )

    def create_ui():
        app_ui = ui.page_fluid(
            # Inline JavaScript to handle postMessage
            ui.tags.script("""
                window.d2e_token = null;
                window.d2e_context = {};
                
                window.addEventListener('message', function(event) {
                    console.log('[D2E] Received postMessage');
                    const data = event.data;
                    
                    if (!data || !data.type) return;
                    
                    if (data.type === 'AUTH_TOKEN') {
                        window.d2e_token = data.token;
                        globalThis.d2e_token = data.token;
                        
                        if (data.context) {
                            window.d2e_context = {
                                datasetId: data.context.datasetId || null,
                                cohortId: data.context.cohortId || null,
                                wizardConfig: data.context.wizardConfig || null,
                                mriquery: data.context.mriquery || null
                            };
                            globalThis.d2e_context = window.d2e_context;
                        }
                        
                        if (data.parentOrigin) {
                            window.d2e_parent_origin = data.parentOrigin;
                            globalThis.d2e_parent_origin = data.parentOrigin;
                        }
                        
                        if (typeof Shiny !== 'undefined') {
                            Shiny.setInputValue('d2e_token', data.token, {priority: 'event'});
                            
                            if (data.context) {
                                Shiny.setInputValue('d2e_datasetId', data.context.datasetId, {priority: 'event'});
                                Shiny.setInputValue('d2e_cohortId', data.context.cohortId, {priority: 'event'});
                                Shiny.setInputValue('d2e_wizardConfig', data.context.wizardConfig, {priority: 'event'});
                                Shiny.setInputValue('d2e_mriquery', data.context.mriquery, {priority: 'event'});
                            }
                            
                            if (data.parentOrigin) {
                                Shiny.setInputValue('d2e_parent_origin', data.parentOrigin, {priority: 'event'});
                            }
                            
                            Shiny.setInputValue('auth_ready', Date.now(), {priority: 'event'});
                        }
                        
                        const targetWindow = window.top;
                        if (targetWindow && targetWindow !== window) {
                            targetWindow.postMessage({type: 'AUTH_READY'}, '*');
                        }
                    }
                });
                
                function sendReadySignal() {
                    const targetWindow = window.top;
                    if (targetWindow && targetWindow !== window) {
                        try {
                            targetWindow.postMessage({type: 'SHINYLIVE_READY'}, '*');
                        } catch (err) {}
                    }
                }
                
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', sendReadySignal);
                } else {
                    sendReadySignal();
                }
                
                setTimeout(sendReadySignal, 500);
            """),

            ui.div(
                ui.h2("Cross-sectional dashboard", style="margin-top: 20px; margin-bottom: 20px; color: #333399;"),
                ui.output_ui("dashboard_description"),
                ui.output_ui("loading_status"),
                style="text-align: left; padding: 0 20px;"
            ),

            ui.div(
                ui.h5("Cohort size by year", style="margin-bottom: 10px; color: #333399;"),
                output_widget("cohort_size"),
                style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #f2f2f2; margin-bottom: 20px;"
            ),

            ui.row(
                ui.column(
                    7,
                    ui.div(
                        ui.h5("Cohort age and gender distribution", style="margin-bottom: 10px; color: #333399;"),
                        output_widget("gender_age"),
                        style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #f2f2f2; margin-bottom: 20px;"
                    )
                ),
                
                ui.column(
                    5,
                    ui.div(
                        ui.h5("Cohort distribution by race", style="margin-bottom: 10px; color: #333399;"),
                        output_widget("race"),
                        style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #f2f2f2; margin-bottom: 20px;"
                    ),
                    ui.div(
                        ui.h5("Cohort distribution by ethnicity", style="margin-bottom: 10px; color: #333399;"),
                        output_widget("ethnicity"),
                        style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #f2f2f2; margin-bottom: 20px;"
                    )
                ),
            )
        )

        return app_ui




    def create_server():
        def server(input, output, session):
            
            data_store = reactive.Value(None)
            error_store = reactive.Value(None)
            loading_store = reactive.Value(False)


            def get_token() -> Optional[str]:
                try:
                    token = input.d2e_token()
                    if token and str(token) != 'null' and str(token) != 'undefined':
                        return str(token)
                except:
                    pass
                
                try:
                    import js
                    token = js.globalThis.d2e_token if js else None
                    if token and str(token) != 'null' and str(token) != 'undefined':
                        return str(token)
                except:
                    pass
                
                try:
                    from js import window
                    token = window.d2e_token if window else None
                    if token and str(token) != 'null' and str(token) != 'undefined':
                        return str(token)
                except:
                    pass
                
                return None
            
            def get_context() -> Dict[str, Any]:
                context = {
                    'datasetId': None,
                    'cohortId': None,
                    'wizardConfig': None,
                    'mriquery': None,
                }
                
                try:
                    if hasattr(input, 'd2e_datasetId') and input.d2e_datasetId():
                        context['datasetId'] = str(input.d2e_datasetId())
                    if hasattr(input, 'd2e_cohortId') and input.d2e_cohortId():
                        context['cohortId'] = str(input.d2e_cohortId())
                    if hasattr(input, 'd2e_wizardConfig') and input.d2e_wizardConfig():
                        context['wizardConfig'] = input.d2e_wizardConfig()
                    if hasattr(input, 'd2e_mriquery') and input.d2e_mriquery():
                        context['mriquery'] = input.d2e_mriquery()
                    
                    if context['datasetId']:
                        return context
                except Exception as e:
                    print(f"Error getting context: {e}")
                
                try:
                    import js
                    ctx = js.globalThis.d2e_context if js else None
                    if ctx:
                        context['datasetId'] = str(ctx.datasetId) if hasattr(ctx, 'datasetId') and ctx.datasetId else None
                        context['cohortId'] = str(ctx.cohortId) if hasattr(ctx, 'cohortId') and ctx.cohortId else None
                        context['wizardConfig'] = ctx.wizardConfig.to_py() if hasattr(ctx, 'wizardConfig') and ctx.wizardConfig else None
                        context['mriquery'] = str(ctx.mriquery) if hasattr(ctx, 'mriquery') and ctx.mriquery else None
                except Exception as e:
                    print(f"Error getting context from globalThis: {e}")
                
                return context
            
            def get_parent_origin() -> Optional[str]:
                try:
                    if hasattr(input, 'd2e_parent_origin') and input.d2e_parent_origin():
                        return str(input.d2e_parent_origin())
                except:
                    pass

                try:
                    import js
                    origin = js.globalThis.d2e_parent_origin if js else None
                    if origin:
                        return str(origin)
                except:
                    pass

                try:
                    from js import window
                    return str(window.location.origin) if window else None
                except:
                    pass

                return None
            
            def sanitize_input(value: str) -> str:
                if value.endswith('.'):
                    return value[:-1]
                return value
            
            @reactive.Effect
            @reactive.event(input.auth_ready)
            def fetch_data():
                loading_store.set(True)
                error_store.set(None)
                

                token = get_token()
                ctx = get_context()
                origin = get_parent_origin()
                
                if not token:
                    raise ValueError("Authentication token not available")
                
                if not origin:
                    raise ValueError("Parent origin not available")
                    
                dataset_id = ctx.get("datasetId")
                cohort_id = ctx.get("cohortId")
                wizard_config = ctx.get("wizardConfig")
                    
                if not dataset_id:
                    raise ValueError("Dataset ID not available")
                
                if not cohort_id:
                    raise ValueError("Cohort ID not available")
                
                try:
                    cohort_id_int = int(cohort_id)
                except (ValueError, TypeError):
                    raise ValueError(f"Cohort ID must be an integer, got: {cohort_id}")
                
                year_range = wizard_config.get("year", {}) if wizard_config else {}
                start_year = int(year_range.get("from", 2000))
                end_year = int(year_range.get("to", datetime.now().year))
                    
                conditions = wizard_config.get("conditions", []) if wizard_config else []
                
                concept_codes = []
                for idx in range(5):
                    filter_item = {}
                    if idx < len(conditions):
                        filter_item[f"CONCEPT_CODE{idx+1}"] = sanitize_input(conditions[idx].get("value", ""))
                        filter_item[f"WILDCARD_FLAG{idx+1}"] = 1 if conditions[idx].get("useDescendants", False) else 0
                    else:
                        filter_item[f"CONCEPT_CODE{idx+1}"] = "abc123"
                        filter_item[f"WILDCARD_FLAG{idx+1}"] = 0
                    concept_codes.append(filter_item)
                    
                body = {
                    "datasetId": dataset_id,
                    "cohortId": cohort_id_int,
                    "templateId": template_id,
                    "name": name,
                    "type": dashboard_type,
                    "format": result_format,
                    "yearRange": {
                        "from": str(start_year),
                        "to": str(end_year)
                    },
                    "conditions": concept_codes
                }
                    
                api_url = f"{origin}/parquet-export"
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "datasetId": dataset_id
                }
                
                req = urllib.request.Request(
                    api_url,
                    data=json.dumps(body).encode('utf-8'),
                    headers=headers,
                    method='POST'
                )
                    
                print(f"[CrossSectional] Making API request to: {api_url}")
                    
                with urllib.request.urlopen(req) as response:
                    response_data = response.read().decode('utf-8')
                    result = json.loads(response_data)
                    
                    df = pd.DataFrame(result)
                    
                    if df.empty:
                        raise ValueError("No data returned from API")
                    
                    df.columns = [col.lower() for col in df.columns]
                    df = df.where(pd.notnull(df), None)

                    # Convert numeric columns
                    if 'person_count' in df.columns:
                        df['person_count'] = pd.to_numeric(df['person_count'], errors='raise')
                    
                    print(f"[CrossSectional] Data loaded successfully: {len(df)} rows")
                    data_store.set(df)
                    error_store.set(None)
                    loading_store.set(False)

            @output
            @render.ui
            def dashboard_description():
                ctx = get_context()
                wizard_config = ctx.get("wizardConfig")
                
                if wizard_config:
                    year_range = wizard_config.get("year", {})
                    start_year = year_range.get("from", "")
                    end_year = year_range.get("to", "")
                    conditions = wizard_config.get("conditions", [])
                    concept_code = conditions[0].get("value", "N/A") if conditions else "N/A"
                    year_text = f"from {start_year} to {end_year}" if start_year and end_year else "for selected years"
                else:
                    concept_code = "N/A"
                    year_text = "for selected years"
                
                return ui.p(
                    f"Breakdown by age, gender, race, ethnicity of patients who had the condition {concept_code} {year_text}",
                    style="margin: 0 0 20px 0; color: #7f8c8d;"
                )
            
            @output
            @render.ui
            def loading_status():
                error = error_store.get()
                if error:
                    return ui.div(
                        ui.p(f"⚠️ {error}", style="color: #d97706; font-weight: bold;"),
                        style="padding: 16px; background: #fffbeb; border-radius: 8px; margin-bottom: 16px;"
                    )
                
                return None

            @output(id="race")
            @render_widget  
            def race_pie_chart():
                df = data_store.get()
                if df is None or df.empty:
                    return px.pie(title="Waiting for data...")

                race_df = df[df['attribute'] == 'race']  

                fig = px.pie(race_df, 
                            values='person_count', 
                            names='attribute_value', 
                            color_discrete_sequence=color_discrete_sequence)
                
                fig.update_traces(hovertemplate="Race: %{label}<br>"
                                "Person count: %{value:,.0f}<extra></extra>",
                                hoverlabel=HOVERLABEL_STYLE,
                                textposition='inside', 
                                textinfo='percent'
                )
                
                return fig

            @output(id="ethnicity")
            @render_widget  
            def ethnicity_pie_chart():
                df = data_store.get()
                if df is None or df.empty:
                    return px.pie(title="Waiting for data...")

                ethnicity_df = df[df['attribute'] == 'ethnicity']  

                fig = px.pie(ethnicity_df, 
                            values='person_count', 
                            names='attribute_value', 
                            color_discrete_sequence=color_discrete_sequence)
                
                fig.update_traces(hovertemplate="Ethnicity: %{label}<br>"
                                "Person count: %{value:,.0f}<extra></extra>",
                                hoverlabel=HOVERLABEL_STYLE,
                                textposition='inside', 
                                textinfo='percent'
                )
                
                return fig

            @output(id="cohort_size")
            @render_widget  
            def cohort_size_bar_chart():
                df = data_store.get()
                if df is None or df.empty:
                    return px.bar(title="Waiting for data...")

                cohort_size_df = df[df['attribute'] == 'condition_start_year']  

                fig = px.bar(cohort_size_df, 
                            x='attribute_value', 
                            y='person_count', 
                            text_auto=True
                        )
                
                # Calculate nice y-axis interval for clean round numbers
                max_y = cohort_size_df['person_count'].max()
                y_interval = calculate_bin_interval(max_y, target_ticks=5)

                fig.update_layout(
                        xaxis_title='Year',
                        yaxis_title='Person count',
                        plot_bgcolor="#fdfbfb",
                        xaxis=dict(
                            title_font=AXIS_TITLE_FONT,
                            tickfont=AXIS_TICK_FONT,
                            tickmode="linear",
                            dtick=1,
                            **AXIS_LINE_STYLE
                        ),
                        yaxis=dict(
                            title_font=AXIS_TITLE_FONT,
                            tickfont=AXIS_TICK_FONT,
                            tickformat=",.0f",
                            tickmode="linear",
                            dtick=y_interval,
                            **AXIS_LINE_STYLE
                        ),
                        bargap=0.2, # space between bars
                    )
                
                fig.update_traces(marker_color='#ffa19d',
                                texttemplate='%{y}', # bar chart label
                                textposition='outside',
                                textfont=BAR_LABEL_FONT,
                                hovertemplate="Year: %{x}<br>"
                                "Person count: %{y:,.0f}<extra></extra>",
                                hoverlabel=HOVERLABEL_STYLE
                )

                fig.update_yaxes(ticks="outside", ticklen=5, tickwidth=1, tickcolor='black')
                
                return fig

            @output(id="gender_age")
            @render_widget  
            def gender_age_pyramid():
                df = data_store.get()
                if df is None or df.empty:
                    return go.Figure()

                gender_df = df[df['attribute'] == 'gender']
                female_df = gender_df[gender_df['attribute_value'] == 'FEMALE']
                male_df = gender_df[gender_df['attribute_value'] == 'MALE']
                
                # Create figure
                fig = go.Figure()

                # Add Male trace (with absolute values shown) first
                fig.add_trace(go.Bar(
                    y=male_df['age_bin'],
                    x=-male_df['person_count'],  # Keep negative for alignment
                    name='Male',
                    orientation='h',
                    marker=dict(color='#333399')
                ))

                # Add Female trace second
                fig.add_trace(go.Bar(
                    y=female_df['age_bin'],
                    x=female_df['person_count'],
                    name='Female',
                    orientation='h',
                    marker=dict(color='#FFA19D')
                ))

                # Find the max value for scaling the x-axis
                max_value = gender_df['person_count'].max()
                
                # Calculate nice interval for clean round numbers
                interval = calculate_bin_interval(max_value, target_ticks=5)
                
                # Round max value up to nearest interval
                max_value = int(np.ceil(max_value / interval) * interval)
                
                # Generate tick values with clean intervals
                tickvals = list(range(-max_value, max_value + 1, int(interval)))
                if 0 not in tickvals:
                    tickvals.append(0)
                tickvals = sorted(set(tickvals))
                ticktext = [f"{abs(val):,}" for val in tickvals]

                fig.update_layout(
                    #autosize=False,
                    #height=600,
                    # width=None,
                    xaxis=dict(
                        title='Population',
                        title_font=AXIS_TITLE_FONT,
                        tickfont=AXIS_TICK_FONT,
                        tickvals=tickvals,  # Keep scale
                        ticktext=ticktext,  # Show as positive values with commas
                        tickformat=",.0f",
                        **AXIS_LINE_STYLE
                    ),
                    yaxis=dict(
                        title='Age group (Years)',
                        title_font=AXIS_TITLE_FONT,
                        tickfont=AXIS_TICK_FONT,
                        categoryorder='array',
                        categoryarray=sorted(
                            gender_df['age_bin'].unique(),
                            key=lambda x: int(x.split('-')[0]) if '-' in x else 100
                        ),
                        **AXIS_LINE_STYLE
                    ),
                    barmode='overlay',
                    bargap=0.1,
                    plot_bgcolor="#fdfbfb",
                    modebar=dict(orientation='h', bgcolor='rgba(0,0,0,0)', color='#333', activecolor='#333'),
                    legend=dict(traceorder='normal')
                )

                fig.update_traces(hovertemplate="Age group (Years): %{y}<br>"
                                "Gender: Male<br>"
                                "Person count: %{customdata:,.0f}<extra></extra>",
                                customdata=np.abs(male_df['person_count'].values),
                                selector=dict(name='Male'),
                                hoverlabel=HOVERLABEL_STYLE
                )

                fig.update_traces(hovertemplate="Age group (Years): %{y}<br>"
                                "Gender: Female<br>"
                                "Person count: %{x:,.0f}<extra></extra>",
                                selector=dict(name='Female'),
                                hoverlabel=HOVERLABEL_STYLE
                )

                fig.update_xaxes(ticks="outside", ticklen=5, tickwidth=1, tickcolor='black')

                return fig

        return server


    # Create Shiny app
    app_ui = create_ui()
    app_server = create_server()
    app = App(app_ui, app_server)`
    )
    await expect.poll(() => getDialogMonacoValue(page)).toContain('dashboard_name = "cross-sectional-demographics"')

    await page.getByRole('button', { name: 'Add query' }).click()
    const queryName = page.getByRole('textbox', { name: 'Query name' })
    await expect(queryName).toBeVisible({ timeout: MINUTE_1 })
    await queryName.fill(DASHBOARD_NAME)
    const sql = page.getByRole('textbox', { name: 'SQL' })
    await expect(sql).toBeVisible()
    await sql.click()
    await sql.fill(
      "WITH ancestor_concepts AS (\n    SELECT\n        c.concept_id AS ancestor_concept_id,\n        cc.concept_code,\n        cc.wildcard_flag\n    FROM (\n        SELECT '{{CONCEPT_CODE1}}' AS concept_code, {{WILDCARD_FLAG1}} AS wildcard_flag\n    ) cc\n    INNER JOIN {{VOCAB_SCHEMA}}.concept c\n    ON c.concept_code = cc.concept_code\n        AND UPPER(c.domain_id) = 'CONDITION'\n),\n\nconcept_set AS (\n    SELECT\n        ac.concept_code,\n        ac.ancestor_concept_id,\n        COALESCE(ca.descendant_concept_id, ac.ancestor_concept_id) AS condition_source_concept_id\n    FROM ancestor_concepts ac\n    LEFT JOIN {{VOCAB_SCHEMA}}.concept_ancestor ca\n        ON ac.ancestor_concept_id = ca.ancestor_concept_id\n        AND ac.wildcard_flag = 1\n    WHERE ac.ancestor_concept_id != 0\n),\n\nbins AS (\n  SELECT\n    CAST((n * 5) AS VARCHAR) || '-' || CAST((n * 5) + 4 AS VARCHAR) AS age_bin,\n    n * 5 AS bin_start\n  FROM (\n    SELECT UNNEST(generate_series(0, 17)) AS n\n  )\n  UNION ALL\n  SELECT '90+', 90\n),\n\nperson_ages AS (\n  SELECT\n    p.person_id,\n    g.concept_name AS gender_concept_name,\n    EXTRACT(YEAR FROM CURRENT_DATE) AS year,\n    (COALESCE(EXTRACT(YEAR FROM d.death_date), EXTRACT(YEAR FROM CURRENT_DATE)) - p.year_of_birth) AS age\n  FROM {{SCHEMA}}.person p\n  INNER JOIN {{RESULTS_SCHEMA}}.cohort c ON p.person_id = c.subject_id\n  LEFT JOIN {{SCHEMA}}.death d ON p.person_id = d.person_id\n  LEFT JOIN {{VOCAB_SCHEMA}}.concept g ON p.gender_concept_id = g.concept_id\n  INNER JOIN {{SCHEMA}}.condition_occurrence co ON co.person_id = p.person_id\n  INNER JOIN concept_set cs ON co.condition_source_concept_id = cs.condition_source_concept_id\n  WHERE c.cohort_definition_id = {{COHORT_ID}}\n    AND EXTRACT(YEAR FROM co.condition_start_date) BETWEEN {{STARTYEAR}} AND {{ENDYEAR}}\n),\n\ngender_age_counts AS (\n  SELECT\n    gender_concept_name,\n    CASE\n      WHEN age >= 90 THEN '90+'\n      ELSE CAST(CAST(age / 5 AS INTEGER) * 5 AS VARCHAR) || '-' || CAST(CAST(age / 5 AS INTEGER) * 5 + 4 AS VARCHAR)\n    END AS age_bin,\n    CASE\n      WHEN age >= 90 THEN 90\n      ELSE CAST(age / 5 AS INTEGER) * 5\n    END AS bin_start,\n    COUNT(DISTINCT person_id) AS persons\n  FROM person_ages\n  GROUP BY gender_concept_name,\n    CASE WHEN age >= 90 THEN '90+' ELSE CAST(CAST(age / 5 AS INTEGER) * 5 AS VARCHAR) || '-' || CAST(CAST(age / 5 AS INTEGER) * 5 + 4 AS VARCHAR) END,\n    CASE WHEN age >= 90 THEN 90 ELSE CAST(age / 5 AS INTEGER) * 5 END\n)\n\nSELECT\n    'race' AS attribute,\n    COALESCE(r.concept_name, '') AS attribute_value,\n    NULL AS age_bin,\n    COUNT(DISTINCT p.person_id) AS persons\nFROM {{SCHEMA}}.person p\nINNER JOIN {{RESULTS_SCHEMA}}.cohort c ON p.person_id = c.subject_id\nLEFT JOIN {{VOCAB_SCHEMA}}.concept r ON p.race_concept_id = r.concept_id\nINNER JOIN {{SCHEMA}}.condition_occurrence co ON co.person_id = p.person_id\nINNER JOIN concept_set cs ON co.condition_source_concept_id = cs.condition_source_concept_id\nWHERE c.cohort_definition_id = {{COHORT_ID}}\n  AND EXTRACT(YEAR FROM co.condition_start_date) BETWEEN {{STARTYEAR}} AND {{ENDYEAR}}\nGROUP BY r.concept_name\n\nUNION ALL\n\nSELECT\n    'ethnicity' AS attribute,\n    COALESCE(e.concept_name, '') AS attribute_value,\n    NULL AS age_bin,\n    COUNT(DISTINCT p.person_id) AS persons\nFROM {{SCHEMA}}.person p\nINNER JOIN {{RESULTS_SCHEMA}}.cohort c ON p.person_id = c.subject_id\nLEFT JOIN {{VOCAB_SCHEMA}}.concept e ON p.ethnicity_concept_id = e.concept_id\nINNER JOIN {{SCHEMA}}.condition_occurrence co ON co.person_id = p.person_id\nINNER JOIN concept_set cs ON co.condition_source_concept_id = cs.condition_source_concept_id\nWHERE c.cohort_definition_id = {{COHORT_ID}}\n  AND EXTRACT(YEAR FROM co.condition_start_date) BETWEEN {{STARTYEAR}} AND {{ENDYEAR}}\nGROUP BY e.concept_name\n\nUNION ALL\n\nSELECT\n  'gender' AS attribute,\n  COALESCE(g.gender_concept_name, '') AS attribute_value,\n  b.age_bin,\n  COALESCE(c.persons, 0) AS persons\nFROM bins b\nCROSS JOIN (\n  SELECT DISTINCT gender_concept_name FROM person_ages\n) g\nLEFT JOIN gender_age_counts c\n  ON c.gender_concept_name = g.gender_concept_name AND c.bin_start = b.bin_start\n\nUNION ALL\n\nSELECT\n  'condition_start_year' AS attribute,\n  CAST(t1.y_year AS VARCHAR) AS attribute_value,\n  NULL AS age_bin,\n  COUNT(DISTINCT t2.person_id) AS persons\nFROM (\n  SELECT UNNEST(generate_series({{STARTYEAR}}, {{ENDYEAR}})) AS y_year\n) t1\nLEFT JOIN (\n    SELECT\n        p.person_id,\n        EXTRACT(YEAR FROM co.condition_start_date) AS condition_start_year\n    FROM {{SCHEMA}}.person p\n    INNER JOIN {{RESULTS_SCHEMA}}.cohort c\n        ON p.person_id = c.subject_id\n        AND c.cohort_definition_id = {{COHORT_ID}}\n    INNER JOIN {{SCHEMA}}.condition_occurrence co ON co.person_id = p.person_id\n    INNER JOIN concept_set cs ON co.condition_source_concept_id = cs.condition_source_concept_id\n        AND EXTRACT(YEAR FROM co.condition_start_date) BETWEEN {{STARTYEAR}} AND {{ENDYEAR}}\n) t2\nON t1.y_year = t2.condition_start_year\nGROUP BY t1.y_year\nORDER BY attribute_value ASC"
    )
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Code saved successfully')).toBeVisible()

    // Reload to avoid empty dashbord
    await page.reload()
    await wizardRow.scrollIntoViewIfNeeded()
    await wizardRow.getByText('Select action').click()
    await page.getByRole('option', { name: 'Manage dashboard' }).click()
    await page.getByText('Dashboard', { exact: true }).click()
    await page.getByRole('option', { name: 'Cohort' }).click()
    await expect(page.getByText(DASHBOARD_NAME).first()).toBeVisible()
    await selectPythonViewer(page)
    await expect(page.getByText(DASHBOARD_NAME).first()).toBeVisible()

    // build shiny assets
    await page.getByRole('button', { name: 'Build Shiny assets' }).click()
    await expect(page.getByText('Shiny assets build triggered successfully.')).toBeVisible()
    await page.getByTestId('dialog-close').click()
    await page.getByRole('link', { name: 'Jobs' }).click()

    // Ensure the Shiny build job completed before switching to the Researcher portal,
    // otherwise the dashboard assets won't exist yet and the iframe won't render.
    await expect(page.locator('a:has-text("Job Runs")')).toBeVisible()
    const shinyBuildRun = page
      .locator('.flow-run-list-item')
      .filter({ has: page.locator('a:has-text("shiny_live_plugin")') })
      .first()
    await expect(shinyBuildRun.locator('.state-badge')).toHaveText('Completed', { timeout: MINUTE_5 })
  })

  // Switch to Researcher portal and open the dashboard
  await test.step('Open dashboard and verify charts render', async () => {
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Switch to Researcher portal' }).click()
    await page.getByText('wizardE2E').first().click()

    await page.getByRole('link', { name: 'Cohorts' }).click()
    await expect(page.getByRole('button', { name: 'D2E' })).toBeVisible({ timeout: MINUTE_1 })
    await page.getByRole('button', { name: 'D2E' }).click()
    await page.getByRole('button', { name: 'Analyze' }).click()
    await page.getByRole('button', { name: 'Cross sectional Demographics' }).click()
    await page.getByRole('textbox', { name: 'Disease/Condition *' }).click()
    await page.getByRole('textbox', { name: 'Disease/Condition *' }).fill('acute bro')
    // Concept search is debounced/async — wait for the suggestion before selecting it
    await page.getByText('Acute bronchitis').first().click()
    await page.getByRole('button', { name: 'Apply Filters' }).click()
    await page.getByRole('button', { name: 'Confirm' }).click()

    // The dashboard is a Shinylive (Python/WASM) app nested two iframes deep; booting
    // the in-browser runtime is slow, so allow a generous timeout for first render.
    await expect(
      page
        .locator('iframe')
        .contentFrame()
        .locator('iframe')
        .contentFrame()
        .getByRole('heading', { name: 'Cross-sectional dashboard' })
    ).toBeVisible({ timeout: MINUTE_2 })
    await page.getByRole('button', { name: '✕' }).click()
  })

  // Cleanup: delete the dataset created for this test
  await test.step('Delete dataset', async () => {
    await page.getByRole('link', { name: 'Account' }).click()
    // The wizard applied a condition filter to the (unsaved) cohort, so leaving the
    // builder now prompts the unsaved-changes dialog (#2636). Confirm leaving.
    await page
      .getByRole('button', { name: 'Leave without saving' })
      .click({ timeout: 3000 })
      .catch(() => {})
    await page.getByRole('button', { name: 'Switch to Admin portal' }).click()
    await page.getByRole('link', { name: 'Datasets' }).click()
    await page.getByRole('row', { name: 'wizardE2E' }).getByRole('combobox').click()
    await page.getByRole('option', { name: 'Delete dataset' }).click()
    await page.getByRole('textbox', { name: 'Enter dataset name to confirm' }).fill('wizardE2E')
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await page.getByRole('link', { name: 'Setup' }).click()
    await page.getByTestId('button').nth(2).click()
    await page.getByText('Dashboards').click()
    await page.getByText('Wizards').click()
    await page.getByTestId('button').click()
  })
})
