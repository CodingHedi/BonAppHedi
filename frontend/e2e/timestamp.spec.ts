import { expect, test } from './fixtures';
import type { Locator } from '@playwright/test';

const BABKA_FR = '/fr/recettes/babka-au-chocolat';
const BABKA_EN = '/en/recipes/chocolate-babka';

/** A date with the month spelled out: "21 juillet 2026", "21 July 2026". */
const SPELLED_OUT = /^\d{1,2}\s+\S{3,}\s+\d{4}$/;
const RELATIVE_FR = /^il y a \d+ \S+$/;
const RELATIVE_EN = /^\d+ \S+ ago$/;

const DATE_PARTS = { day: 'numeric', month: 'long', year: 'numeric' } as const;

/**
 * The date this timestamp is showing, formatted here from its own `datetime`
 * attribute.
 *
 * Everything in this file is derived rather than hardcoded, because the seed
 * dates are pinned to SEED_NOW (2026-07-25) while real time keeps moving: the
 * babka is "4 days ago" the week the seed was written and "27 days ago" now.
 * A literal here would pass today and fail on a Tuesday for no reason.
 */
async function expectedDate(stamp: Locator, localeId: string): Promise<string> {
  const iso = await stamp.locator('time').getAttribute('datetime');
  expect(iso, 'the <time> must carry the machine-readable timestamp').toBeTruthy();
  return new Intl.DateTimeFormat(localeId, DATE_PARTS).format(new Date(iso!));
}

test.describe('dates', () => {
  test('a recipe leads with the date, and swaps to the relative form', async ({ page }) => {
    await page.goto(BABKA_FR);
    const stamp = page.locator('bah-recipe-detail-page .meta bah-timestamp');

    await expect(stamp).toHaveText(SPELLED_OUT);
    await stamp.click();
    await expect(stamp).toHaveText(RELATIVE_FR);
    await stamp.click();
    await expect(stamp).toHaveText(SPELLED_OUT);
  });

  test('a card leads with the relative form, and swaps to the date', async ({ page }) => {
    await page.goto('/fr');
    const stamp = page
      .locator('bah-recipe-card')
      .filter({ hasText: 'Babka au chocolat' })
      .locator('bah-timestamp');

    await expect(stamp).toHaveText(RELATIVE_FR);
    await stamp.click();
    await expect(stamp).toHaveText(SPELLED_OUT);
  });

  test('the date shown is the one in the timestamp, not a re-typed string', async ({ page }) => {
    // Proves the visible date is computed from `publishedAt` — the same thing
    // the relative form has always been computed from. Nothing ships a
    // pre-rendered date, and this is what would notice if it started to.
    await page.goto(BABKA_FR);
    const stamp = page.locator('bah-recipe-detail-page .meta bah-timestamp');

    await expect(stamp).toHaveText(await expectedDate(stamp, 'fr-FR'));
  });

  test('pressing the date on a card does not open the recipe', async ({ page }) => {
    // The card is navigated by a link stretched across it, so the date sits
    // above that layer and stops the press. Get this wrong and the swap is
    // invisible: the recipe opens instead, which reads as a dead control.
    await page.goto('/fr');
    const card = page.locator('bah-recipe-card').filter({ hasText: 'Babka au chocolat' });

    await card.locator('bah-timestamp').click();

    await expect(page).toHaveURL(/\/fr$/);
    await expect(card.locator('bah-timestamp')).toHaveText(SPELLED_OUT);
  });

  test('the card still opens the recipe when pressed anywhere else', async ({ page }) => {
    // The other half of that mechanism, and the half that would break
    // silently: a stretched link that stopped covering the card would leave
    // only the title clickable and nothing would say so.
    await page.goto('/fr');
    await page.locator('bah-recipe-card').filter({ hasText: 'Babka au chocolat' }).click();
    await expect(page).toHaveURL(/\/fr\/recettes\/babka-au-chocolat$/);
  });

  test('the English date is British order, never American', async ({ page }) => {
    await page.goto(BABKA_EN);
    const stamp = page.locator('bah-recipe-detail-page .meta bah-timestamp');

    const iso = await stamp.locator('time').getAttribute('datetime');
    const when = new Date(iso!);
    const british = new Intl.DateTimeFormat('en-GB', DATE_PARTS).format(when);
    const american = new Intl.DateTimeFormat('en-US', DATE_PARTS).format(when);

    // The two orders are not a matter of taste. `Intl.DateTimeFormat('en', …)`
    // resolves to US conventions, and 08/07 against 7/8 is the same day read
    // as two different days — so this asserts the site produces one and not
    // the other, rather than merely that it produces something.
    await expect(stamp).toHaveText(british);
    await expect(stamp).not.toHaveText(american);
    await expect(stamp).toHaveText(SPELLED_OUT);

    await stamp.click();
    await expect(stamp).toHaveText(RELATIVE_EN);
  });

  test('a comment swaps too', async ({ page }) => {
    await page.goto(BABKA_FR);
    const stamp = page.locator('bah-comment-section .comment bah-timestamp').first();

    await expect(stamp).toHaveText(RELATIVE_FR);
    await stamp.click();
    await expect(stamp).toHaveText(await expectedDate(stamp, 'fr-FR'));
  });
});
