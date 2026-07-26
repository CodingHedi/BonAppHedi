import { defineConfig, devices } from '@playwright/test';

/**
 * Set PW_TARGET=prod to run the suite against a production build instead of an
 * unoptimised one.
 *
 * Worth doing before a deploy: the production configuration optimises, hashes
 * and tree-shakes, and enforces the bundle budgets. Failures that only appear
 * there are exactly the ones that would otherwise appear in production.
 */
const againstProd = process.env['PW_TARGET'] === 'prod';

/**
 * Deliberately not 4200, and this is the whole point rather than a detail.
 *
 * The dev loop lives on 4200 and may be pointed at the real backend, which is a
 * thing you do on purpose. With the suite also on 4200 it would reuse that
 * server, so `npm run verify` would silently run every e2e spec against a live
 * database — 33 of them failed that way once, on real comments and ratings, and
 * read exactly like regressions in the change under test.
 *
 * On its own port the suite cannot reuse the dev server, cannot be affected by
 * whether one is running, and cannot collide with it. Both can run at once.
 */
const PORT = 4300;

/**
 * Both targets build the `e2e` configuration, which pins `environment.e2e.ts`
 * and therefore the mocks. `environment.development.ts` is yours to flip; this
 * makes that flip unable to change what the suite runs against.
 *
 * What the suite does not cover, by construction, is the real backend. That is
 * ADR 0001's scoped acceptance run, which is a deliberate act with its own
 * instructions in TESTING.md — never something `verify` should do by accident.
 */
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
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm start -- --configuration ${againstProd ? 'e2e-prod' : 'e2e'} --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Safe to reuse now: nothing but this suite ever serves on this port, so a
    // server found here was started by it and is built the same way.
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
