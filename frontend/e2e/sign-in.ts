import type { APIRequestContext, Page } from '@playwright/test';

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
 * Puts the database back to the seeded state. Acceptance run only.
 *
 * Reaches `/api/test/reset`, which exists only under the backend's `acceptance`
 * profile — so a 404 here means the backend was started without it, which is
 * worth saying plainly rather than letting 154 specs fail one at a time.
 *
 * The CSRF dance is not optional and not cosmetic. Every write is protected, the
 * token is only generated once something reads it, and this request context has
 * its own cookie jar independent of any page — so the GET is what causes the
 * cookie to exist at all. Without it the reset is a 403 and the isolation
 * silently does nothing.
 */
export async function resetDatabaseForReal(request: APIRequestContext): Promise<void> {
  let last = '';

  // Retried, because SQLite takes one writer at a time and this now runs before
  // every spec. Dropping every table while the previous spec's last request is
  // still finishing gives an occasional lock, which surfaced exactly once in 154
  // resets - as a 500 on an unrelated smoke spec, which is the worst place for
  // it to appear and the reason it is handled here rather than left to chance.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await request.get('/api/auth/session');

    const { cookies } = await request.storageState();
    const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value;

    const response = await request.post('/api/test/reset', {
      headers: xsrf ? { 'X-XSRF-TOKEN': xsrf } : {},
    });

    if (response.ok()) return;

    if (response.status() === 404) {
      throw new Error(
        'POST /api/test/reset is not there, so the backend is not running under the acceptance ' +
          'profile. Start it with:  .\\scripts\\dev.ps1 -Fresh -Acceptance',
      );
    }

    last = `${response.status()} ${await response.text()}`;
    await new Promise((wait) => setTimeout(wait, 250 * attempt));
  }

  throw new Error(`could not reset the database after three attempts: ${last}`);
}

/** The write itself, from inside the page so the browser supplies its own cookies. */
async function putAvatar(page: Page, avatar: string): Promise<{ status: number; body: string }> {
  return page.evaluate(async (token) => {
    // Read something first, in this context, immediately before writing.
    //
    // Spring Security issues a fresh CSRF token when the session changes, and a
    // sign-in changes it - so the XSRF-TOKEN cookie sitting in the browser after
    // the OAuth round trip can be the pre-authentication one. `CsrfCookieFilter`
    // writes the current token on any request that reads it, so this GET is what
    // makes the cookie right rather than merely present.
    //
    // Retrying after a 403 was tried instead and is worse: the retry succeeds,
    // but Chromium has already logged the 403 as a console error and the e2e
    // fixture fails the test on it - correctly, since that fixture exists to
    // catch exactly the errors nobody asserts on.
    await fetch('/api/auth/session');

    const xsrf = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('XSRF-TOKEN='))
      ?.slice('XSRF-TOKEN='.length);

    const response = await fetch('/api/auth/avatar', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}),
      },
      body: JSON.stringify({ avatar: token }),
    });

    return { status: response.status, body: await response.text() };
  }, avatar);
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
  // Sent from inside the page rather than through page.request, and that is the
  // fix rather than a preference. Reading XSRF-TOKEN from the context and
  // replaying it as a header answered 403 every time: Spring Security issues a
  // new CSRF token when the session changes on authentication, so the value
  // captured just after a sign-in is the pre-authentication one. Letting the
  // browser read its own cookie at the moment of the request cannot get that
  // wrong, and it is also what the application itself does.
  const result = await putAvatar(page, avatar);

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`could not seed the avatar '${avatar}': ${result.status} ${result.body}`);
  }
}
