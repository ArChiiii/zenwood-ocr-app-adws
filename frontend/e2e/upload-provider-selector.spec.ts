import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the upload page and wait for the feature selector to be ready.
 * Mocks the Supabase auth endpoints so no real session is required.
 */
async function gotoUpload(page: Page) {
  // Mock Supabase client-side auth calls so getSession() returns no error.
  await page.route('**/auth/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )

  await page.goto('/dashboard/upload')
  await expect(page.getByTestId('feature-select')).toBeVisible()
}

/**
 * Attach a minimal valid PDF buffer to the (first) hidden file input.
 */
async function attachFakePdf(page: Page, nth = 0) {
  const inputs = page.locator('input[type="file"]')
  await inputs.nth(nth).setInputFiles({
    name: 'test.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 1 0 obj<</Type/Catalog>>endobj'),
  })
}

// ---------------------------------------------------------------------------
// Provider selector visibility
// ---------------------------------------------------------------------------

test.describe('VLM provider selector — visibility', () => {
  test('hidden by default (handwriting_removal)', async ({ page }) => {
    await gotoUpload(page)
    // Default feature is handwriting_removal — no VLM stage.
    await expect(page.getByTestId('provider-select')).not.toBeVisible()
  })

  test('visible when feature is scan_conversion', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await expect(page.getByTestId('provider-select')).toBeVisible()
  })

  test('visible when feature is document_comparison', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('document_comparison')
    await expect(page.getByTestId('provider-select')).toBeVisible()
  })

  test('visible when feature is document_classification', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('document_classification')
    await expect(page.getByTestId('provider-select')).toBeVisible()
  })

  test('hidden again after switching back to handwriting_removal', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await expect(page.getByTestId('provider-select')).toBeVisible()

    await page.getByTestId('feature-select').selectOption('handwriting_removal')
    await expect(page.getByTestId('provider-select')).not.toBeVisible()
  })

  test('hidden when raw reconstruction is enabled (scan_conversion)', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await expect(page.getByTestId('provider-select')).toBeVisible()

    await page.getByTestId('raw-reconstruction-toggle').click()
    await expect(page.getByTestId('provider-select')).not.toBeVisible()
  })

  test('visible again after disabling raw reconstruction', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await page.getByTestId('raw-reconstruction-toggle').click()
    await expect(page.getByTestId('provider-select')).not.toBeVisible()

    await page.getByTestId('raw-reconstruction-toggle').click()
    await expect(page.getByTestId('provider-select')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Provider selector options
// ---------------------------------------------------------------------------

test.describe('VLM provider selector — options', () => {
  test('has three options: Default (auto), Gemini, OpenRouter', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')

    const select = page.getByTestId('provider-select')
    const options = select.locator('option')

    await expect(options).toHaveCount(3)
    await expect(options.nth(0)).toHaveText('Default (auto)')
    await expect(options.nth(1)).toHaveText('Gemini')
    await expect(options.nth(2)).toHaveText('OpenRouter')
  })

  test('defaults to empty value (Default auto)', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')

    await expect(page.getByTestId('provider-select')).toHaveValue('')
  })
})

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

test.describe('VLM provider selector — state', () => {
  test('resets to default when feature changes', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await page.getByTestId('provider-select').selectOption('openrouter_vlm')
    await expect(page.getByTestId('provider-select')).toHaveValue('openrouter_vlm')

    // Switching feature resets the provider
    await page.getByTestId('feature-select').selectOption('document_classification')
    await expect(page.getByTestId('provider-select')).toHaveValue('')
  })

  test('resets to default when switching back to handwriting_removal then to VLM feature', async ({ page }) => {
    await gotoUpload(page)
    await page.getByTestId('feature-select').selectOption('document_comparison')
    await page.getByTestId('provider-select').selectOption('gemini_vlm')

    await page.getByTestId('feature-select').selectOption('handwriting_removal')
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await expect(page.getByTestId('provider-select')).toHaveValue('')
  })
})

// ---------------------------------------------------------------------------
// Form submission — provider is sent in the request
// ---------------------------------------------------------------------------

test.describe('VLM provider selector — form submission', () => {
  test('submits with no vlm_provider when Default (auto) is selected', async ({ page }) => {
    let capturedBody = ''
    await page.route('**/auth/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    await page.route('**/jobs/submit', async route => {
      capturedBody = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'job-123', status: 'pending' }),
      })
    })

    await page.goto('/dashboard/upload')
    await expect(page.getByTestId('feature-select')).toBeVisible()
    await page.getByTestId('feature-select').selectOption('scan_conversion')

    // Leave provider at default (empty)
    await expect(page.getByTestId('provider-select')).toHaveValue('')
    await attachFakePdf(page)

    await page.getByTestId('submit-button').click()
    await expect(page).toHaveURL(/\/jobs\/job-123/)

    // vlm_provider field should be absent (not sent when undefined)
    expect(capturedBody).not.toContain('vlm_provider')
  })

  test('submits with vlm_provider=openrouter_vlm when OpenRouter is selected', async ({ page }) => {
    let capturedBody = ''
    await page.route('**/auth/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    await page.route('**/jobs/submit', async route => {
      capturedBody = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'job-456', status: 'pending' }),
      })
    })

    await page.goto('/dashboard/upload')
    await expect(page.getByTestId('feature-select')).toBeVisible()
    await page.getByTestId('feature-select').selectOption('scan_conversion')
    await page.getByTestId('provider-select').selectOption('openrouter_vlm')
    await attachFakePdf(page)

    await page.getByTestId('submit-button').click()
    await expect(page).toHaveURL(/\/jobs\/job-456/)

    expect(capturedBody).toContain('openrouter_vlm')
  })

  test('submits with vlm_provider=gemini_vlm when Gemini is selected', async ({ page }) => {
    let capturedBody = ''
    await page.route('**/auth/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    await page.route('**/jobs/submit', async route => {
      capturedBody = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'job-789', status: 'pending' }),
      })
    })

    await page.goto('/dashboard/upload')
    await expect(page.getByTestId('feature-select')).toBeVisible()
    await page.getByTestId('feature-select').selectOption('document_classification')
    await page.getByTestId('provider-select').selectOption('gemini_vlm')
    await attachFakePdf(page)

    await page.getByTestId('submit-button').click()
    await expect(page).toHaveURL(/\/jobs\/job-789/)

    expect(capturedBody).toContain('gemini_vlm')
  })
})
