import { defineConfig, devices } from '@playwright/test';

/**
 * `PW_TARGET` picks what the suite runs against. Unset is the everyday case:
 * an unoptimised build of the `e2e` configuration, on its own port, mocked.
 *
 *   prod — a production build instead of an unoptimised one. Worth doing before
 *          a deploy: that configuration optimises, hashes and tree-shakes, and
 *          enforces the bundle budgets. Failures that only appear there are
 *          exactly the ones that would otherwise appear in production.
 *
 *   real — the dev server on :4200, against the real API. This is the scoped
 *          acceptance run in ADR 0001 and nothing else should use it.
 */
const target = process.env['PW_TARGET'];
const againstProd = target === 'prod';
const againstRealApi = target === 'real';

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
 *
 * `PW_TARGET=real` is the one exception and has to be asked for by name. It goes
 * to 4200 precisely because that is where the dev loop is — which is also why it
 * can never happen by accident, and why `verify` does not set it.
 */
const PORT = againstRealApi ? 4200 : 4300;

/**
 * The default and `prod` both build the `e2e` configuration, which pins
 * `environment.e2e.ts` and therefore the mocks. `environment.development.ts` is
 * yours to flip; this makes that flip unable to change what the suite runs
 * against.
 *
 * `real` is the deliberate act: it starts no server, so it runs against whatever
 * `scripts/dev.ps1` has already put on 4200 and against whatever
 * `environment.development.ts` says — which for an acceptance run means the real
 * API. Getting there has to be two decisions, flipping the file and naming the
 * target, because it was one decision once and that is how `verify` came to run
 * against a live database.
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
  // No *application* server is started for `real`: the point is to test what
  // dev.ps1 is already serving. Starting one here would build the e2e
  // configuration and quietly put the mocks back, which is the exact thing being
  // avoided.
  //
  // The OIDC issuer is different, and is started, because it is part of the
  // harness rather than part of the thing under test. It is what makes the 40
  // session specs runnable at all: the backend is pointed at it by
  // `application-acceptance.yml`, and it approves without asking, so a click on
  // the Google button completes a genuine authorization-code flow instead of
  // leaving for a host Playwright cannot drive.
  //
  // Safe to start here rather than before the backend: the endpoints are named
  // in configuration rather than discovered, so nothing is fetched from the
  // issuer until somebody actually signs in.
  webServer: againstRealApi
    ? {
        command: 'node e2e/mock-issuer.mjs',
        // 127.0.0.1, not localhost: the JVM resolves localhost to ::1 first and
        // the issuer listens on IPv4 only.
        url: 'http://127.0.0.1:9779/jwks',
        // Never reuse. This was `true` for one run, and it cost the whole
        // measurement: the issuer had crashed on startup, an older one from a
        // previous session was still holding the port, the health check passed
        // against it, and 154 specs ran against an issuer without the identity
        // route they needed. Nothing said so - the run simply reported failures
        // that looked like application bugs.
        //
        // With `false` a leftover process is a loud "port already in use"
        // instead, which is the correct outcome: an issuer somebody else started
        // is not the one this run built.
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : {
        command: `npm start -- --configuration ${againstProd ? 'e2e-prod' : 'e2e'} --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        // Safe to reuse now: nothing but this suite ever serves on this port, so
        // a server found here was started by it and is built the same way.
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000,
      },
});
