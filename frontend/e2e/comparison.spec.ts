import { test, expect } from '@playwright/test'
import { login, gotoUpload } from './helpers/auth'
import { attachFile, fixturePath, waitForRunComplete } from './helpers/engine'

test.describe('Live: comparison', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('diffs comparison/a_small.pdf vs b_small.pdf and renders a diff viewer', async ({ page }) => {
    await gotoUpload(page)

    await page.getByTestId('feature-select').selectOption('comparison')

    // Two dropzones appear — original + revised.
    await attachFile(page, 0, fixturePath('comparison', 'a_small.pdf'))
    await attachFile(page, 1, fixturePath('comparison', 'b_small.pdf'))

    await page.getByTestId('submit-button').click()

    await waitForRunComplete(page)

    // DiffViewer renders additions/deletions/modifications sections — assert
    // loosely on the summary area being present.
    await expect(page.getByText(/additions|deletions|modifications|differences/i).first()).toBeVisible()
  })
})
