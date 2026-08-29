import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

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
 * **`color-contrast` is excluded, and that is a live debt rather than a
 * decision.** The first audit on 2026-08-29 found 43 distinct failing
 * elements across both themes — muted text at opacity 0.55, accent-coloured
 * links, and 11px timestamps — the worst at 1.82:1 against a required 4.5:1.
 * Fixing them means changing design tokens that come from `Docs/Design/`, so
 * it is a deviation needing an ADR and Hedi's eye, not something to slip into
 * an accessibility commit. Excluded here so the rest of the ruleset can be
 * enforced now instead of waiting; the exclusion is the one thing in this file
 * that should not be permanent.
 */

const PAGES: readonly (readonly [string, string])[] = [
  ['/fr', 'the list page'],
  ['/fr/recettes/babka-au-chocolat', 'a recipe'],
  ['/fr/connexion', 'sign-in'],
  ['/fr/mentions-legales', 'the legal notice'],
  ['/fr/cette-page-nexiste-pas', 'the 404'],
];

for (const [path, label] of PAGES) {
  test(`${label} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    // The heading is the signal that Angular has rendered rather than served
    // a shell — auditing an empty page passes and proves nothing, which is
    // exactly what a first attempt at this did.
    await expect(page.locator('h1')).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(
      violations.map((v) => `${v.id} (${v.nodes.length}) — ${v.help}`),
      'axe found WCAG A/AA violations',
    ).toEqual([]);
  });
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
