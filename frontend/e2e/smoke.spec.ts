import { expect, test } from './fixtures';

/**
 * Preflight: does the application fundamentally work?
 *
 * This is the suite to run before a deploy and after any dependency bump,
 * framework upgrade or build-config change. It deliberately asserts almost
 * nothing about behaviour — the other specs do that — and instead sweeps every
 * route checking that it resolves, renders real content, and produces no
 * browser errors (enforced by the fixture, not by assertions here).
 *
 * Keep it fast and keep it broad. Every new top-level route belongs in ROUTES.
 */

interface RouteCheck {
  readonly path: string;
  /** Where the browser should end up, if not `path` itself. */
  readonly landsOn?: RegExp;
  /** Text that proves the page rendered rather than serving an empty shell. */
  readonly expects: string | RegExp;
}

const ROUTES: readonly RouteCheck[] = [
  // Either language is correct here: `/` negotiates from Accept-Language, and
  // the test browser reports en-US. Pinning one language would assert the
  // negotiation is broken.
  { path: '/', landsOn: /\/(fr|en)$/, expects: /Toutes les recettes|All recipes/ },
  { path: '/fr', expects: 'Toutes les recettes' },
  { path: '/en', expects: 'All recipes' },
  { path: '/fr/recettes/babka-au-chocolat', expects: 'Babka au chocolat' },
  { path: '/en/recipes/chocolate-babka', expects: 'Chocolate babka' },
  // A recipe with no video, so the media component's other branch is swept too.
  { path: '/fr/recettes/cheesecake-basque', expects: 'Cheesecake basque' },
  // Matched on a real heading rather than loosely: the page held
  // "A completer avant la mise en ligne" until the notice was written, and a
  // loose match is exactly what let it stay that way while the site was live.
  { path: '/fr/mentions-legales', expects: 'Hébergeur' },
  { path: '/en/legal-notice', expects: 'Host' },
  // The privacy rows stay loose, and here that is not a gap: this file sweeps
  // for reachability, and `legal.spec.ts` pins what the policy actually claims
  // — the cookie name, the HMAC, the click-to-load video.
  { path: '/fr/confidentialite', expects: /confidentialité|privacy/i },
  { path: '/en/privacy', expects: /confidentialité|privacy/i },
  { path: '/fr/connexion', expects: /S'identifier|Sign in/ },
  { path: '/en/sign-in', expects: /S'identifier|Sign in/ },
  // Behind a guard, so what is swept is the redirect: an anonymous visitor is
  // sent to sign in and told where they were going. A route that resolved to a
  // blank page for them would look identical from the outside.
  {
    path: '/fr/profil',
    landsOn: /\/fr\/connexion\?returnTo=/,
    expects: /S'identifier|Sign in/,
  },
  {
    path: '/en/profile',
    landsOn: /\/en\/sign-in\?returnTo=/,
    expects: /S'identifier|Sign in/,
  },
  { path: '/fr/cette-page-nexiste-pas', expects: 'Page introuvable' },
  { path: '/en/no-such-page', expects: 'Page not found' },
];

test.describe('smoke', () => {
  for (const route of ROUTES) {
    test(`${route.path} renders`, async ({ page }) => {
      const response = await page.goto(route.path);

      // The SPA always serves 200 and routes client-side; a 4xx/5xx here means
      // the server itself is misconfigured.
      expect(response?.status(), `HTTP status for ${route.path}`).toBeLessThan(400);

      if (route.landsOn) await expect(page).toHaveURL(route.landsOn);
      await expect(page.locator('body')).toContainText(route.expects);
    });
  }

  test('the shell is present on every page', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('bah-site-header')).toBeVisible();
    await expect(page.locator('bah-site-footer')).toBeVisible();
    await expect(page.locator('main#main')).toBeVisible();
  });

  test('translations resolve, so no raw keys leak to the page', async ({ page }) => {
    // A missing translation renders the key itself. Catching it here means it
    // never reaches a visitor as "nav.search".
    for (const path of ['/fr', '/en']) {
      await page.goto(path);
      const body = await page.locator('body').innerText();
      expect(body, `raw translation key visible on ${path}`).not.toMatch(
        /\b(site|nav|footer|list|hero|recipe|rating|reactions|comments|units|time|error)\.[a-zA-Z]+/,
      );
    }
  });

  test('fonts and stylesheet actually applied', async ({ page }) => {
    // Guards the self-hosted font pipeline: if the @fontsource import breaks,
    // the page still renders but in a system fallback, which is a silent
    // regression a screenshot would catch and an assertion normally would not.
    await page.goto('/fr');
    const family = await page
      .locator('h2')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toContain('Bricolage');
  });

  test('design tokens are live in both themes', async ({ page }) => {
    // Guards the token layer itself: if _tokens.scss stopped being imported the
    // page would fall back to browser defaults and still render, so no other
    // assertion here would notice.
    await page.goto('/fr');
    const token = (name: string) => () =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    const bg = token('--color-bg');
    const accent = token('--color-accent');

    await expect.poll(bg).toBe('#f8f5f4');
    await expect.poll(accent).toBe('#a04a64');

    await page.getByRole('button', { name: /thème sombre/i }).click();
    // Polled, not read once: the theme is applied by an Angular effect, which
    // flushes after the click resolves.
    await expect.poll(bg).toBe('#241f1a');

    // The two themes are two palettes (ADR 10), and the dark one redeclares
    // both accent ramps instead of inheriting them. Asserted because the
    // failure is otherwise silent: drop the redeclaration and the light
    // theme's wine simply flows through onto Umber's warm brown surfaces,
    // which renders perfectly and looks like a design choice.
    await expect.poll(accent).toBe('#a15a35');
  });

  test('no form field curves into its own text (ADR 13)', async ({ page }) => {
    /*
     * The geometric rule, not the token's value: a corner radius no larger than
     * the horizontal padding cannot reach the text, at any box size. Asserting
     * `--radius-input === '12px'` instead would pass on a field with 4px of
     * padding, which is the shape that actually breaks.
     *
     * The browser clamps a radius to half the box, so `--radius-pill` resolved
     * to 60px on the admin editor's 120px-tall description textarea — well past
     * its 18px padding — and ate the first character of the first line. "Babka"
     * rendered as "3abka". A single-line input hid it, because at 43px tall the
     * clamp lands near the padding and the widest part of the curve sits at the
     * vertical centre where there is no text to clip.
     */
    await page.goto('/fr');

    const offenders = await page.locator('.input').evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const style = getComputedStyle(node);
        const { width, height } = node.getBoundingClientRect();
        const specified = parseFloat(style.borderTopLeftRadius);
        // How the browser resolves it once the box is known.
        const effective = Math.min(specified, width / 2, height / 2);
        const padding = Math.min(parseFloat(style.paddingLeft), parseFloat(style.paddingRight));

        return effective > padding
          ? [{ tag: node.tagName, effective: Math.round(effective), padding }]
          : [];
      }),
    );

    expect(offenders, 'a radius wider than the padding will clip text').toEqual([]);
  });
});
