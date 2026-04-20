import { expect, type Page } from '@playwright/test'
import path from 'node:path'

/** Absolute path inside the monorepo's shared fixtures directory. */
export function fixturePath(feature: string, file: string): string {
  return path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'ocr_agentic_engine',
    'tests',
    'fixtures',
    feature,
    file,
  )
}

export async function attachFile(page: Page, nth: number, filePath: string) {
  await page.locator('input[type="file"]').nth(nth).setInputFiles(filePath)
}

/**
 * Wait for the pipeline to finish — either the ✓ Complete marker appears,
 * or a run_failed error surfaces. Fails the test on error.
 *
 * `timeoutMs` should be generous: a real OCR + agent run can take minutes.
 */
export async function waitForRunComplete(page: Page, timeoutMs = 8 * 60_000) {
  const complete = page.getByText('✓ Complete')
  const errorBanner = page.locator('div[style*="error-bg"]')

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await complete.isVisible().catch(() => false)) return
    if (await errorBanner.first().isVisible().catch(() => false)) {
      const msg = (await errorBanner.first().textContent()) ?? '(no message)'
      throw new Error(`Engine run failed: ${msg.trim()}`)
    }
    await page.waitForTimeout(1_500)
  }
  throw new Error(
    `waitForRunComplete: neither ✓ Complete nor error banner appeared within ${timeoutMs}ms`,
  )
}
