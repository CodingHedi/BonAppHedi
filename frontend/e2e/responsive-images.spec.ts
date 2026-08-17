import { expect, test } from './fixtures';
import type { Locator } from '@playwright/test';

/**
 * What the browser actually chose, which is the only thing worth asserting.
 *
 * `currentSrc` is filled in after selection, so it reports the candidate that
 * won rather than the list it was offered. A test that only checked the
 * `srcset` attribute would pass against a `sizes` so wrong that every visitor
 * still downloads the largest file — which is the exact failure this change
 * exists to prevent.
 */
const chosen = (image: Locator) =>
  image.evaluate((el) => (el as HTMLImageElement).currentSrc || null);

const CARD_IMAGE = 'bah-recipe-card img';

test.describe('responsive images', () => {
  test('a card offers every width, smallest first', async ({ page }) => {
    await page.goto('/fr');
    const srcset = await page.locator(CARD_IMAGE).first().getAttribute('srcset');

    expect(srcset).toContain('@400.jpg 400w');
    expect(srcset).toContain('@800.jpg 800w');
    // The largest candidate is the original, not a derivative of itself.
    expect(srcset).toMatch(/[^@]*\/media\/[a-z-]+\.jpg 1600w/);

    // Ascending, because that is the order both the server and the mirror emit
    // and a srcset is read in the order it is given.
    const widths = [...srcset!.matchAll(/(\d+)w/g)].map((m) => Number(m[1]));
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });

  test('a phone downloads the 400px copy, not the 1600px one', async ({ page }) => {
    // The measurement in Docs/backlog.md, turned into an assertion: every card
    // used to fetch a 1600px photograph to fill a box 190px tall.
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/fr');
    await page.locator(CARD_IMAGE).first().waitFor();

    await expect.poll(() => chosen(page.locator(CARD_IMAGE).first())).toContain('@400.jpg');
  });

  test('a desktop card takes a middle size rather than the original', async ({ page }) => {
    // Deliberately the cheesecake, which the hero does not carry.
    //
    // The babka does, at 100vw, so its 1600px file is already in cache by the
    // time its card is laid out — and a browser will reuse a larger candidate
    // it already holds rather than fetch a second smaller one. That is correct
    // behaviour and it makes the featured recipes useless for this assertion:
    // the first card reports the original and nothing is wrong. Found by
    // asserting on the first card and reading the failure.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fr');

    const card = page
      .locator('bah-recipe-card')
      .filter({ hasText: 'Cheesecake basque' })
      .locator('img');
    await card.waitFor();

    await expect.poll(() => chosen(card)).toContain('@800.jpg');

    // The point is not which file it took but which one it did not.
    expect(await chosen(card)).not.toMatch(/\/media\/[a-z-]+\.jpg$/);
  });

  test('the detail page asks for a wider slot than a card does', async ({ page }) => {
    // The default `sizes` describes a grid card. The detail image is the wide
    // half of a two-column row, and a card's 33vw there would fetch the small
    // file for a slot twice its size and show it soft.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fr/recettes/babka-au-chocolat');

    const img = page.locator('bah-recipe-media img').first();
    await img.waitFor();

    expect(await img.getAttribute('sizes')).toBe('(max-width: 900px) 100vw, 60vw');
    await expect.poll(() => chosen(img)).toContain('/media/');
  });

  test('every offered candidate actually exists', async ({ page }) => {
    // The mocked build has no server to generate these, so they are committed
    // files (scripts/make-media-derivatives.mjs). A missing one is a 404 that
    // only the visitor on that viewport would ever see — the fixture fails the
    // test on a failed request, and this makes sure the request is made at all.
    const failed: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/media/') && response.status() >= 400) {
        failed.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/fr');
    const srcset = await page.locator(CARD_IMAGE).first().getAttribute('srcset');
    const urls = srcset!.split(',').map((entry) => entry.trim().split(/\s+/)[0]);

    for (const url of urls) {
      const response = await page.request.get(url);
      expect(response.status(), `${url} is offered but not served`).toBe(200);
    }

    expect(failed).toEqual([]);
  });
});
