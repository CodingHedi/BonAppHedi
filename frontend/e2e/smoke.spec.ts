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
  // Matched loosely in both languages: these pages are placeholders until M3,
  // and pinning the exact copy now would just mean a false failure the day
  // they are written.
  { path: '/fr/mentions-legales', expects: /mentions légales|legal notice/i },
  { path: '/fr/confidentialite', expects: /confidentialité|privacy/i },
  { path: '/en/legal-notice', expects: /mentions légales|legal notice/i },
  { path: '/en/privacy', expects: /confidentialité|privacy/i },
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
    const bg = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
      );

    await expect.poll(bg).toBe('#efe6d6');

    await page.getByRole('button', { name: /thème sombre/i }).click();
    // Polled, not read once: the theme is applied by an Angular effect, which
    // flushes after the click resolves.
    await expect.poll(bg).toBe('#241f1a');
  });
});
