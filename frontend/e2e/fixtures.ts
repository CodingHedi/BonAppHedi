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

export const test = base.extend<{ failOnBrowserProblems: void }>({
  failOnBrowserProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];

      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (!isIgnored(text)) problems.push(`console.error: ${text}`);
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
