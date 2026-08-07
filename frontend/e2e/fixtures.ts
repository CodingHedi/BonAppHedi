import { test as base, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { AGAINST_REAL_API, resetDatabaseForReal } from './sign-in';

/**
 * Every spec in this suite imports `test` from here rather than from
 * @playwright/test.
 *
 * The reason is the auto-fixture below: it fails a test if the browser logged
 * an error, threw, or failed a request — even when every explicit assertion
 * passed. That catches the class of regression nobody writes an assertion for,
 * because you only think of it after it breaks:
 *
 *   - a translation file 404s, so the page renders raw `nav.search` keys
 *   - a lazy chunk path breaks, so a route silently renders nothing
 *   - an Angular injection error fires inside a component that still paints
 *   - a font or asset path rots after a build-config change
 *
 * All of those produce a green test suite and a broken site without this.
 */

/** Browser noise that is not a defect. Keep this list short and justified. */
const IGNORED = [
  // Vite's dev client reconnect chatter when the server restarts mid-run.
  /\[vite\] connect/i,
  // DevTools' own probe, unrelated to the app.
  /Autofill\.enable/i,
];

const isIgnored = (message: string) => IGNORED.some((pattern) => pattern.test(message));

/**
 * A 404 from the API is an answer, not a failure.
 *
 * The server returns one for an unknown slug, for a draft, and for a slug
 * belonging to the other language — deliberately the same 404 for all three, so
 * that asking cannot confirm an unpublished recipe exists. Two specs navigate to
 * exactly such a URL and assert the site offers a way back; against the mocks no
 * request happened at all, so this never came up.
 *
 * Chromium logs every non-2xx resource load as a console error, so without this
 * those two specs fail on the API doing precisely what they are checking it does.
 *
 * Narrow on purpose, and the narrowness is the point. Only 404, and only from
 * `/api/`. A 404 on a translation file or a lazy chunk is the first example in
 * the list above of what this fixture exists to catch, and still fails the test.
 */
const isExpectedApiNotFound = (text: string, url: string) =>
  /status of 404/.test(text) && /\/api\//.test(url);

/**
 * The spec file the database was last put back for.
 *
 * Module scope, so it lives as long as the worker does. The acceptance run is
 * `--workers=1` — it has to be, since the specs share one database — so "last
 * file this worker saw" and "last file the run saw" are the same thing.
 */
let lastResetFor: string | undefined;

/** Measured below; see the comment on `resetBetweenFiles`. */
const RESET_EVERY_SPEC = true;

/**
 * Puts the database back to the seeded state between spec files.
 *
 * Only under `PW_TARGET=real`. Against the mocks the store already resets on
 * every page load, which is precisely why the suite was written expecting a
 * clean slate — and why it started failing the moment those expectations met a
 * real database. Three admin specs pass and, in passing, publish a draft, rename
 * the babka and create a recipe; every later spec asserting the seeded catalogue
 * then fails on content it never touched.
 *
 * Done here rather than with a `beforeAll` in each spec file, and that is
 * deliberate: ADR 0001's second amendment exempts the three sign-in helpers and
 * nothing else, so the specs keep their hands clean. This file is harness.
 *
 * Between files rather than between specs. It fixes the cross-file damage, which
 * was the bulk of it, and leaves the cases where a file contaminates itself —
 * admin's own analytics specs count what the admin specs before them did. Making
 * it per-spec is a one-line change if that becomes worth the extra resets.
 */
async function resetBetweenFiles(file: string, request: APIRequestContext) {
  if (!AGAINST_REAL_API) return;
  if (!RESET_EVERY_SPEC && file === lastResetFor) return;

  lastResetFor = file;
  await resetDatabaseForReal(request);
}

export const test = base.extend<{ seededDatabase: void; failOnBrowserProblems: void }>({
  // Ordered before failOnBrowserProblems by being declared first: the reset is
  // setup, and a request it makes should not be attributed to the test.
  seededDatabase: [
    async ({ request }, use, testInfo) => {
      await resetBetweenFiles(testInfo.file, request);
      await use();
    },
    { auto: true },
  ],

  failOnBrowserProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];

      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (isIgnored(text)) return;
        // location().url is the resource that failed, which the message text
        // itself does not carry.
        if (isExpectedApiNotFound(text, message.location()?.url ?? '')) return;
        problems.push(`console.error: ${text}`);
      });

      page.on('pageerror', (error) => {
        problems.push(`uncaught: ${error.message}`);
      });

      page.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText ?? 'unknown';
        // Navigations cancel in-flight requests as a matter of course; that is
        // not a failure.
        if (failure.includes('ERR_ABORTED')) return;
        problems.push(`request failed: ${request.url()} (${failure})`);
      });

      await use();

      expect(problems, 'the browser reported problems during this test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
