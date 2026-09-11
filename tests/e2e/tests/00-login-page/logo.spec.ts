import { test, expect } from '../fixtures'

const TEST_NAME = 'login-page-logo'
const SHOULD_SKIP = false
test.fixme(SHOULD_SKIP, `${TEST_NAME} test is temporarily disabled.`)

// The sign-in page is what every unauthenticated browser is redirected to, and
// its logo once pointed into a separate application's build output. Where that
// output was absent the request 404d and the page rendered with a broken image,
// which no test noticed: a broken image is still visible to the DOM, so only the
// decoded dimensions show whether it actually loaded.
test(TEST_NAME, async ({ page }) => {
  const brokenAssets: string[] = []
  page.on('response', (response) => {
    if (!response.ok() && /\.(svg|png|jpg|jpeg|webp)$/.test(response.url())) {
      brokenAssets.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/d2e-login/')

  const logo = page.locator('img.logo')
  await expect(logo).toBeVisible()

  const decoded = await logo.evaluate((image: HTMLImageElement) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
  }))
  expect(decoded.complete).toBe(true)
  expect(decoded.naturalWidth).toBeGreaterThan(0)
  expect(brokenAssets).toEqual([])
})
