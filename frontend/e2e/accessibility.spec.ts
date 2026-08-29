import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { AGAINST_REAL_API, signInForReal } from './sign-in';

/**
 * WCAG 2.1 A and AA, on the pages a visitor actually reaches, in both themes.
 *
 * The lint config already carries `templateAccessibility`, and it is worth
 * being clear about why that is not this. Those rules read the template as
 * source: a missing `alt`, a click handler with no keyboard equivalent, an
 * invalid ARIA attribute. They cannot see anything that only exists once the
 * page is rendered — computed colour, focus order, landmark structure, or an
 * ARIA attribute that is individually valid and inert in context.
 *
 * That last one is not hypothetical. The difficulty dots carried
 * `aria-label` on a bare `<span>`, which lint passes because the attribute is
 * well-formed, and which a screen reader may discard entirely because a span
 * has no role to hang it on. It had been that way since the component was
 * written and the first axe run found it in seconds.
 *
 * **Both themes, because a colour rule can be right in one and wrong in the
 * other.** That is not a hypothetical either: `a { color: var(--color-accent) }`
 * was 5.29:1 in the light theme and 3.13:1 in the dark one, so every link on
 * the site failed AA in the dark theme and an audit of the light theme alone
 * would have called the site clean. ADR 14.
 *
 * **And signed in, because a third of the app is behind a session.** The
 * anonymous sweep covered five pages and missed the admin tab strip, the
 * comment composer's tabs and the whole recipe table — 44 nodes of the 134 the
 * widened audit found. A page nobody audits is a page nobody fixes.
 */

/** Anonymous pages: what a first-time visitor can reach. */
const PUBLIC_PAGES: readonly (readonly [string, string])[] = [
  ['/fr', 'the list page'],
  ['/fr/recettes/babka-au-chocolat', 'a recipe'],
  ['/fr/connexion', 'sign-in'],
  ['/fr/mentions-legales', 'the legal notice'],
  ['/fr/cette-page-nexiste-pas', 'the 404'],
];

/** Behind a session, admin included. */
/*
 * The admin sub-paths are NOT translated — `/fr/admin/recipes`, not
 * `/fr/admin/recettes` — which app.routes.ts says outright and which is easy to
 * get wrong from outside it. Worth stating here because the first version of
 * this list guessed the French words, every admin URL 404ed, and three "admin"
 * audits were quietly auditing the 404 page instead. A wrong path in an audit
 * does not fail; it passes, against the wrong page.
 */
const SIGNED_IN_PAGES: readonly (readonly [string, string])[] = [
  ['/fr/recettes/babka-au-chocolat', 'a recipe, signed in'],
  ['/fr/profil', 'the profile'],
  ['/fr/admin/recipes', 'the recipe table'],
  ['/fr/admin/recipes/new', 'the recipe editor'],
  ['/fr/admin/comments', 'moderation'],
  ['/fr/admin/stats', 'the analytics'],
];

const THEMES = ['light', 'dark'] as const;

/**
 * The one exclusion, and it is a WCAG exemption rather than a debt.
 *
 * The 404's numeral is 76px of ornament at `opacity: 0.22`, already
 * `aria-hidden`, and it says nothing the heading beside it does not say in
 * words. WCAG 1.4.3 exempts text that is pure decoration, and this is the
 * definition of it — the alternative is a numeral loud enough to compete with
 * the heading, which is the one thing its own comment says it must not do.
 *
 * Excluded by selector rather than by turning the rule off, so it stays this
 * one element on this one page and everything else on the page is still
 * audited.
 */
const DECORATIVE = '.numeral';

async function audit(
  page: Page,
  path: string,
  theme: (typeof THEMES)[number],
  { expect404 = false } = {},
) {
  await page.addInitScript((t) => {
    window.localStorage.setItem('bah-organic-theme', t);
  }, theme);

  await page.goto(path);
  // The heading is the signal that Angular has rendered rather than served
  // a shell — auditing an empty page passes and proves nothing, which is
  // exactly what a first attempt at this did.
  await expect(page.locator('h1').first()).toBeVisible();

  // An audit that reaches the wrong page does not fail, it passes — which is
  // how three admin URLs were audited as the 404 without anything saying so.
  // Angular renders 404 in place rather than redirecting, so the URL is no
  // help and the numeral is the only tell.
  await expect(page.locator('.numeral'), `${path} rendered the 404 page`).toHaveCount(
    expect404 ? 1 : 0,
  );

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude(DECORATIVE)
    .analyze();

  // Every failing node, named, rather than "color-contrast (1)". A contrast
  // failure is a colour, a background and a ratio, and a message without them
  // sends you off to re-instrument what the audit already knew.
  const found = violations.flatMap((v) =>
    v.nodes.map((node) => {
      const data = node.any[0]?.data as
        | {
            fgColor?: string;
            bgColor?: string;
            contrastRatio?: number;
            expectedContrastRatio?: string;
          }
        | undefined;
      const detail = data?.contrastRatio
        ? ` [${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}:1, needs ${data.expectedContrastRatio}]`
        : '';
      return `${v.id} — ${node.target.join(' ')}${detail}`;
    }),
  );

  expect(found, `axe found WCAG A/AA violations in the ${theme} theme`).toEqual([]);
}

for (const theme of THEMES) {
  for (const [path, label] of PUBLIC_PAGES) {
    test(`${label} has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await audit(page, path, theme, { expect404: label === 'the 404' });
    });
  }

  for (const [path, label] of SIGNED_IN_PAGES) {
    test(`${label} has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      if (AGAINST_REAL_API) {
        await signInForReal(page, 'admin');
      } else {
        await page.addInitScript(() => {
          localStorage.setItem(
            'bah-mock-session',
            JSON.stringify({ id: 'e2e', displayName: 'Hedi', avatar: 'pot/0', isAdmin: true }),
          );
        });
      }

      await audit(page, path, theme);
    });
  }
}

test('the difficulty dots announce themselves', async ({ page }) => {
  // The specific defect the first audit found, kept as its own assertion
  // rather than left to the sweep above: without the role the label is
  // ignored and the control reads as three empty spans.
  await page.goto('/fr/recettes/babka-au-chocolat');

  const dots = page.locator('.dots');
  await expect(dots).toHaveAttribute('role', 'img');
  await expect(dots).toHaveAttribute('aria-label', /Difficulté/);
});

/**
 * The mechanism behind almost every contrast failure the first audit found, so
 * it gets an assertion of its own rather than being left to axe to rediscover.
 *
 * `opacity` on a container dims its descendants too. The site muted secondary
 * text that way, and each muted block quietly multiplied the link inside it
 * down with it: the legal page's links were a passing 5.29:1 reduced to
 * 3.96:1, and the breadcrumb's to 1.82:1, by rules that were never about
 * links at all. A colour applies to the element's own text and leaves a
 * child's alone, which is why --color-text-muted exists. ADR 14.
 */
test('muted text does not dim the links inside it', async ({ page }) => {
  await page.goto('/fr/mentions-legales');
  await expect(page.locator('h1')).toBeVisible();

  const dimmed = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const link of document.querySelectorAll('main a, footer a')) {
      for (let el = link.parentElement; el; el = el.parentElement) {
        const opacity = Number(getComputedStyle(el).opacity);
        if (opacity < 1)
          offenders.push(`${link.textContent?.trim()} — ${el.className} @ ${opacity}`);
      }
    }
    return offenders;
  });

  expect(dimmed, 'a link is being dimmed by an ancestor opacity').toEqual([]);
});
