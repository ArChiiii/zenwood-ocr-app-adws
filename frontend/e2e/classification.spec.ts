import { test, expect } from '@playwright/test'
import { login, gotoUpload } from './helpers/auth'
import { attachFile, fixturePath, waitForRunComplete } from './helpers/engine'

test.describe('Live: classification', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('classifies classification/Invoice1.png and shows category + confidence', async ({ page }) => {
    await gotoUpload(page)

    await page.getByTestId('feature-select').selectOption('classification')

    await attachFile(page, 0, fixturePath('classification', 'Invoice1.png'))
    await page.getByTestId('submit-button').click()

    await waitForRunComplete(page)

    await expect(page.getByText('Classification', { exact: true })).toBeVisible()
    await expect(page.getByText(/Confidence:\s+\d+%/)).toBeVisible()
  })
})
