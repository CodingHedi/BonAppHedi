import type { Page } from '@playwright/test';

/**
 * Establishing a session, whichever backend the suite is pointed at.
 *
 * The specs are written against the mocks, where signing in is instant and a
 * session is a value in `localStorage`. Against the real API neither is true: a
 * session is a server-side cookie, and getting one means an actual
 * authorization-code flow. This module is the whole of that difference, so no
 * assertion anywhere has to know which backend it is running against.
 *
 * ADR 0001's second amendment covers this. The guarantee is that the specs pass
 * unmodified, and what changes here is how a test *arrives* signed in — setup,
 * not the thing under test. Every expectation, route and describe block is
 * untouched.
 */

/** `PW_TARGET=real`, the scoped acceptance run and nothing else. */
export const AGAINST_REAL_API = process.env['PW_TARGET'] === 'real';

/**
 * 127.0.0.1 rather than localhost, matching `application-acceptance.yml`. The
 * JVM resolves localhost to ::1 first and the issuer listens on IPv4 only, so
 * the two must agree or the token exchange fails on a sign-in that otherwise
 * looks perfect.
 */
const ISSUER = 'http://127.0.0.1:9779';

/**
 * Signs in for real: three redirects, a token exchange and a userinfo call.
 *
 * Who arrives is chosen out of band first, because there is nowhere in the
 * authorization request to say. `admin` is on the allowlist in
 * `application-acceptance.yml` and `reader` is not — and the server is what
 * decides which is which, exactly as in production.
 */
export async function signInForReal(page: Page, who: 'admin' | 'reader' = 'admin'): Promise<void> {
  await page.request.get(`${ISSUER}/_identity?who=${who}`);

  await page.goto('/oauth2/authorization/google');

  // Wait to be *back*, rather than for a fixed time. The chain ends wherever
  // ReturnPath sends the visitor, so the only thing reliably true at the end is
  // that neither leg of the OAuth exchange is still on screen.
  await page.waitForURL((url) => !/^\/(oauth2|login)\//.test(url.pathname), { timeout: 30_000 });
}

/**
 * Chooses an avatar through the API, standing in for the mock's seeded session.
 *
 * The specs that take a starting avatar are testing what happens to one that is
 * already set, so it has to exist before the page is opened. Against the mocks
 * that is a value in `localStorage`; here it is a real write by the signed-in
 * account.
 *
 * The CSRF header is not optional. Spring Security 6 defers generating the token
 * until something reads it, `CsrfCookieFilter` forces the cookie out, and a
 * write without the matching header is a 403 — silently, as far as a test is
 * concerned, since nothing would be visibly wrong until the assertion failed.
 */
export async function chooseAvatarForReal(page: Page, avatar: string): Promise<void> {
  const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value;

  const response = await page.request.put('/api/auth/avatar', {
    data: { avatar },
    headers: xsrf ? { 'X-XSRF-TOKEN': xsrf } : {},
  });

  if (!response.ok()) {
    throw new Error(
      `could not seed the avatar '${avatar}': ${response.status()} ${await response.text()}`,
    );
  }
}
