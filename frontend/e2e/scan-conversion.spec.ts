import { test, expect } from '@playwright/test'
import { login, gotoUpload } from './helpers/auth'
import { attachFile, fixturePath, waitForRunComplete } from './helpers/engine'

test.describe('Live: scan_conversion', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('converts scan_conversion/small.pdf to docx and exposes a download', async ({ page }) => {
    await gotoUpload(page)

    await page.getByTestId('feature-select').selectOption('scan_conversion')
    // Output format selector is visible for scan_conversion.
    await page.locator('select').nth(1).selectOption('docx')

    await attachFile(page, 0, fixturePath('scan_conversion', 'small.pdf'))
    await page.getByTestId('submit-button').click()

    await waitForRunComplete(page)

    // Download button becomes visible after the output blob is pre-fetched.
    await expect(page.getByRole('button', { name: /^Download$/ })).toBeVisible({
      timeout: 60_000,
    })
  })
})
