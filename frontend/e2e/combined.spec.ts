import { test, expect } from '@playwright/test'
import { login, gotoUpload } from './helpers/auth'
import { attachFile, fixturePath, waitForRunComplete } from './helpers/engine'

const INPUT = fixturePath('test', 'IMG_6047.jpg')

test.describe('Live: combined feature run (IMG_6047.jpg)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('runs classification, handwriting_removal, scan_conversion, and comparison on one image', async ({
    page,
  }) => {
    // Phase A — Classification
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('classification')
    await attachFile(page, 0, INPUT)
    await page.getByTestId('submit-button').click()
    await waitForRunComplete(page)
    await expect(page.getByText('Classification', { exact: true })).toBeVisible()
    await expect(page.getByText(/Confidence:\s+\d+%/)).toBeVisible()

    // Phase B — Handwriting Removal
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('handwriting_removal')
    await attachFile(page, 0, INPUT)
    await page.getByTestId('submit-button').click()
    await waitForRunComplete(page)
    await expect(page.getByText('Handwriting Report')).toBeVisible()
    await expect(
      page.getByText(/Handwriting detected|No handwriting detected/),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^Download$/ })).toBeVisible({
      timeout: 60_000,
    })

    // Phase C — Scan Conversion (docx)
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await page.locator('select').nth(1).selectOption('docx')
    await attachFile(page, 0, INPUT)
    await page.getByTestId('submit-button').click()
    await waitForRunComplete(page)
    await expect(page.getByRole('button', { name: /^Download$/ })).toBeVisible({
      timeout: 60_000,
    })

    // Phase D — Comparison (same file on both sides)
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('comparison')
    await attachFile(page, 0, INPUT)
    await attachFile(page, 1, INPUT)
    await page.getByTestId('submit-button').click()
    await waitForRunComplete(page)
    await expect(
      page
        .getByText(/additions|deletions|modifications|differences|no changes/i)
        .first(),
    ).toBeVisible()
  })
})
