import { test, expect } from '../fixtures'

const TEST_NAME = 'dataset-overview-search'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)
test.describe.configure({ retries: 3 }) // Re-try up to 3 times for flaky tests

test(TEST_NAME, async ({ page }) => {
  await page.goto('/d2e/portal')
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
    .filter({ hasText: /^Feature flagsEnable \/ disable featureConfigure$/ })
    .getByTestId('button')
    .click()

  // Check if the "Dataset search" feature is already enabled
  const datasetSearchCheckbox = page.locator('#Dataset\\ search')
  const isChecked = await datasetSearchCheckbox.isChecked()

  if (!isChecked) {
    await page.getByText('Dataset search').click()
  }

  await page.getByTestId('button').click()
  await expect(page.getByTestId('snackbar-message')).toContainText('Changes saved')

  await page.getByRole('link', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Switch to Researcher portal' }).click()
  await page.getByRole('textbox', { name: 'search terms' }).nth(1).click()
  await page.getByRole('textbox', { name: 'search terms' }).nth(1).fill('demo')
  await page.getByRole('button', { name: 'Search' }).nth(1).click()
  // Test that "Test" is highlighted with the expected background color
  const testSpan1 = page
    .locator('div')
    .filter({ hasText: /^Demo dataset$/ })
    .locator('span')
    .filter({ hasText: 'Demo' })
    .nth(1)

  // Wait for the element to appear first
  await expect(testSpan1).toHaveCSS('background-color', 'rgb(220, 222, 244)')

  await page.getByRole('textbox', { name: 'search terms' }).nth(1).click()
  await page.getByRole('textbox', { name: 'search terms' }).nth(1).fill('dataset')
  await page.getByRole('textbox', { name: 'search terms' }).nth(1).press('Enter')

  // Test that "Test" is highlighted with the expected background color
  const testSpan2 = page.locator('div').locator('span').filter({ hasText: 'dataset' }).nth(1)
  await expect(testSpan2).toHaveCSS('background-color', 'rgb(220, 222, 244)')

  await page.getByRole('textbox', { name: 'search terms' }).nth(1).click()
  await page.getByRole('textbox', { name: 'search terms' }).nth(1).fill('xxxxxxxxx')

  await page.getByRole('textbox', { name: 'search terms' }).nth(1).press('Enter')
  await expect(page.locator('.overview__datasets--empty')).toContainText('No dataset available')

  await page.getByRole('textbox', { name: 'search terms' }).nth(1).fill('')
  await page.getByRole('textbox', { name: 'search terms' }).nth(1).press('Enter')

  // Clearing the search re-fetches the dataset list (~300ms). Wait for the first
  // dataset card to actually re-render before cloning it below. A fixed timeout
  // here races the re-fetch: if the card isn't back yet, the clone targets nothing,
  // the page stays too short to scroll past the 260px threshold, and the header
  // never gets `home-header--scrolled`.
  const datasetCardSelector =
    '#root > div > div > main > div > div.overview__body > div > div > div:nth-child(1)'
  await expect(page.locator(datasetCardSelector)).toBeVisible()

  // Demo setup only has one dataset, so scrolling to bottom is not enough to make the
  // header scrolled. Clone the dataset div to create more content for scrolling. Return
  // the clone count so a missing target fails loudly instead of silently no-op-ing (which
  // would leave the page too short and fail the scroll assertion for the wrong reason).
  const clonesAdded = await page.evaluate(selector => {
    const originalDiv = document.querySelector(selector)
    if (!originalDiv) return 0
    originalDiv.parentNode?.appendChild(originalDiv.cloneNode(true))
    originalDiv.parentNode?.appendChild(originalDiv.cloneNode(true))
    return 2
  }, datasetCardSelector)
  expect(clonesAdded, 'dataset card was not present to clone for scroll').toBe(2)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)) // scroll to bottom
  await expect(page.locator('.home-header')).toHaveClass(/home-header--scrolled/)
})
