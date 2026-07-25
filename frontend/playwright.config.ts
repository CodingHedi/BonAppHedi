import { defineConfig, devices } from '@playwright/test';

/**
 * Set PW_TARGET=prod to run the suite against a production build instead of the
 * dev server.
 *
 * Worth doing before a deploy: the production configuration optimises, hashes
 * and tree-shakes, and enforces the bundle budgets. Failures that only appear
 * there are exactly the ones that would otherwise appear in production.
 */
const againstProd = process.env['PW_TARGET'] === 'prod';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // The smoke suite runs first so a fundamentally broken app fails fast rather
  // than after every behavioural spec has timed out.
  testMatch: /.*\.spec\.ts/,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: againstProd ? 'npm start -- --configuration production' : 'npm start',
    url: 'http://localhost:4200',
    // Never reuse a stale server in CI, and never against prod — a dev server
    // left running would silently invalidate the whole point of the prod run.
    reuseExistingServer: !process.env['CI'] && !againstProd,
    timeout: 180_000,
  },
});
