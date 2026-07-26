import { test as base, expect } from '@playwright/test';

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

export const test = base.extend<{ failOnBrowserProblems: void }>({
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
