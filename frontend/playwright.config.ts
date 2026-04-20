import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Real OCR + LLM runs take minutes — keep the per-test budget generous.
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  // Live backend; don't hammer it in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['line']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // Tests are run against a live backend + real Supabase auth, so reuse
    // whatever dev server the user already has running (typically in tmux).
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
