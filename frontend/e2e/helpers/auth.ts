import { expect, type Page } from '@playwright/test'

/**
 * Sign in with real Supabase credentials from env (E2E_EMAIL / E2E_PASSWORD).
 * Lands on /dashboard once auth succeeds. Tests that need an authenticated
 * session should call this in a `beforeEach` (or use the `authed` fixture).
 */
export async function login(page: Page) {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD must be set to run live e2e tests. ' +
      'Export them in your shell before running `npm run test:e2e`.',
    )
  }

  await page.goto('/login')
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard(?:$|\/|\?)/, { timeout: 30_000 })
}

export async function gotoUpload(page: Page) {
  await page.goto('/dashboard/upload')
  await expect(page.getByTestId('feature-select')).toBeVisible()
}
