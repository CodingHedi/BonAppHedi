import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { AGAINST_REAL_API, signInForReal } from './sign-in';

/**
 * Operating the site with a keyboard and nothing else.
 *
 * This is the half of accessibility that `accessibility.spec.ts` cannot reach.
 * axe reads a rendered page as a static document — roles, names, computed
 * colour — and never presses a key, so nothing it checks depends on focus
 * moving. Every criterion asserted here is about what happens *while* tabbing:
 * WCAG 2.4.1 (bypass blocks), 2.4.3 (focus order) and 2.4.7 (focus visible).
 *
 * All three passed the first time they were measured, on 2026-08-29. That is
 * the reason to write them down rather than a reason not to: the behaviour was
 * built deliberately, nothing was asserting it, and the way it breaks is
 * silent. Nobody discovers a broken tab order by looking at the page.
 *
 * **The reveal-on-focus pattern is the fragile one.** The quote buttons beside
 * the description, each step and each comment sit at `opacity: 0` and come back
 * at `:focus-within`. `step-list.ts` says why in a comment — `display: none` or
 * `visibility: hidden` would take them out of the tab order and make the whole
 * feature unreachable by keyboard — and that comment is the only thing
 * currently protecting it. A future tidy-up that "hides the buttons properly"
 * would look correct, pass every other test, and leave a keyboard user tabbing
 * six times through controls they cannot see.
 */

/** Effective opacity: an ancestor at 0 hides a child that says 1. */
const FOCUS_PROBE = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return null;

  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  let opacity = 1;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    opacity *= Number(getComputedStyle(node).opacity);
  }

  return {
    name: `${el.tagName.toLowerCase()}.${el.className?.toString().split(' ')[0] ?? ''} — ${(
      el.getAttribute('aria-label') ??
      el.innerText ??
      ''
    )
      .trim()
      .slice(0, 40)
      .replace(/\s+/g, ' ')}`,
    opacity,
    // A ring of any kind. Which one is a design decision; that there is one is
    // not, and `_a11y.scss` gives some controls an outline and others a shadow.
    ring: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
    hidden: rect.width === 0 || rect.height === 0 || style.visibility === 'hidden',
    top: rect.top + window.scrollY,
  };
};

type Stop = NonNullable<ReturnType<typeof FOCUS_PROBE>>;

/**
 * Tab through the page, reporting every stop.
 *
 * The retry matters and is not defensive padding. **Everything that reveals
 * itself on focus here does so through a CSS transition**, and both
 * `getComputedStyle` and `boundingBox()` report the value *mid-flight* — so a
 * single read taken right after the keypress describes a control on its way in
 * as one that never arrives. It cost three false findings while this file was
 * being written: the quote buttons measured as six invisible focus stops
 * (`opacity`, 120ms) and the skip link as one that never comes on screen
 * (`transform`, 180ms). Neither was real. Anything asserting on a focused
 * control's appearance has to wait for the transition or poll.
 */
async function tabThrough(page: Page, limit = 60): Promise<Stop[]> {
  const stops: Stop[] = [];

  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');

    let stop = await page.evaluate(FOCUS_PROBE);
    if (stop && stop.opacity < 0.9) {
      await page.waitForTimeout(200);
      stop = await page.evaluate(FOCUS_PROBE);
    }

    // Focus has left the document — the browser has moved to its own chrome,
    // which is the end of the page's tab ring.
    if (!stop) break;

    stops.push(stop);
  }

  return stops;
}

async function signIn(page: Page) {
  if (AGAINST_REAL_API) {
    await signInForReal(page, 'admin');
    return;
  }

  await page.addInitScript(() => {
    localStorage.setItem(
      'bah-mock-session',
      JSON.stringify({ id: 'e2e', displayName: 'Hedi', avatar: 'pot/0', isAdmin: true }),
    );
  });
}

test.describe('tabbing through the site', () => {
  test('the first stop is a skip link, and it reaches the content', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('h1').first()).toBeVisible();

    await page.keyboard.press('Tab');

    const link = page.locator('.skip-link');
    await expect(link).toBeFocused();

    // Off-screen until focused, on-screen once it is. A skip link that never
    // becomes visible is the usual way this feature is half-built: it works for
    // a screen reader and is invisible to a sighted keyboard user, who is the
    // person it exists for.
    //
    // Polled, because the link slides in over 180ms and a single read lands
    // mid-flight and reports -68 — a control that is on its way on screen,
    // measured as one that never arrives.
    await expect
      .poll(async () => (await link.boundingBox())?.y ?? -1, {
        message: 'the skip link stays off-screen while focused',
      })
      .toBeGreaterThanOrEqual(0);

    await page.keyboard.press('Enter');

    // `main` carries tabindex="-1" precisely so this lands somewhere. Without
    // it the fragment scrolls and focus stays on the link, so the next Tab
    // returns to the header and the skip has skipped nothing.
    await expect(page.locator('main#main')).toBeFocused();
  });

  for (const [path, label] of [
    ['/fr', 'the list page'],
    ['/fr/recettes/babka-au-chocolat', 'a recipe'],
  ] as const) {
    test(`every focus stop on ${label} is visible and marked`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();

      const stops = await tabThrough(page);
      expect(stops.length, 'nothing was focusable').toBeGreaterThan(8);

      expect(
        stops.filter((s) => s.opacity < 0.15).map((s) => s.name),
        'focus landed on a control that cannot be seen',
      ).toEqual([]);

      expect(
        stops.filter((s) => s.hidden).map((s) => s.name),
        'focus landed on a control with no box',
      ).toEqual([]);

      expect(
        stops.filter((s) => !s.ring).map((s) => s.name),
        'a focused control has no visible focus indicator',
      ).toEqual([]);
    });
  }

  test('the quote buttons are reachable, and visible once reached', async ({ page }) => {
    // The specific mechanism, on its own, because the sweep above would still
    // pass if these stopped being focusable at all — an unreachable control is
    // absent from the list rather than failing in it.
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fr/recettes/babka-au-chocolat');
    await expect(page.locator('h1')).toBeVisible();

    const quotes = page.locator('button.quote');
    const count = await quotes.count();
    expect(count, 'the quote buttons are gone').toBeGreaterThanOrEqual(6);

    // Every one of them, not a sample: they are drawn by three different
    // components — the description, the step list and the comment list — and
    // each has its own reveal rule.
    for (let i = 0; i < count; i++) {
      const button = quotes.nth(i);
      const label = await button.getAttribute('aria-label');

      await button.focus();
      await page.waitForTimeout(200);

      const state = await button.evaluate((el) => {
        let opacity = 1;
        for (let node: HTMLElement | null = el as HTMLElement; node; node = node.parentElement) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        return { opacity, focused: document.activeElement === el };
      });

      // Asserted first, and this is the assertion that matters. `display: none`
      // is the tidy-up this whole test exists to catch, and it defeats every
      // other check here by accident: the button stays in the DOM so the count
      // is unchanged, `focus()` silently does nothing, and `getComputedStyle`
      // on a display:none element hands back the *specified* opacity of 1 —
      // a control that cannot be reached at all, reporting as perfectly
      // visible.
      expect(state.focused, `"${label}" cannot be focused`).toBe(true);
      expect(state.opacity, `"${label}" is focused but invisible`).toBeGreaterThan(0.9);
    }
  });

  test('the tab order follows the page down', async ({ page }) => {
    // Not strict top-to-bottom: a column layout legitimately finishes one
    // column before starting the next, and the recipe page puts the steps
    // before the ingredient panel beside them. What this catches is a stop that
    // has been lifted far out of place — a modal left in the flow, a footer
    // link reached before the article, tabindex used as a sort key.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fr');
    await expect(page.locator('h1').first()).toBeVisible();

    const stops = await tabThrough(page);
    const tops = stops.map((s) => s.top);

    // The last stop is the footer, and it must be below where the tabbing
    // started. Anything else means the ring runs backwards overall.
    expect(tops.at(-1)!, 'the tab ring ends above where it began').toBeGreaterThan(tops[1]);

    const worstJumpBack = Math.min(...tops.slice(1).map((top, i) => top - tops[i]));
    expect(worstJumpBack, 'a focus stop is far above the one before it').toBeGreaterThan(-700);
  });
});
