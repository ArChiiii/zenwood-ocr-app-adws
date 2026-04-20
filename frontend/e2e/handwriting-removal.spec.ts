import { test, expect } from '@playwright/test'
import { login, gotoUpload } from './helpers/auth'
import { attachFile, fixturePath, waitForRunComplete } from './helpers/engine'

test.describe('Live: handwriting_removal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('runs end-to-end on handwriting_removal/small.pdf and surfaces the report', async ({ page }) => {
    await gotoUpload(page)

    // Feature defaults to handwriting_removal, but set it explicitly for clarity.
    await page.getByTestId('feature-select').selectOption('handwriting_removal')

    await attachFile(page, 0, fixturePath('handwriting_removal', 'small.pdf'))
    await page.getByTestId('submit-button').click()

    await waitForRunComplete(page)

    await expect(page.getByText('Handwriting Report')).toBeVisible()
    // One of the two branches must appear.
    await expect(
      page.getByText(/Handwriting detected|No handwriting detected/),
    ).toBeVisible()
  })
})
