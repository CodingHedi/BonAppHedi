import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Saved recipes (ADR 16), from the outside.
 *
 * The criteria worth a browser rather than a unit test are the ones about
 * *storage* and *what the page claims*: that an anonymous reader gets the whole
 * feature with no request, that the empty state does not assert something false
 * about a device it cannot see, and that a shared link neither writes anything
 * nor breaks on a key that no longer exists.
 */

const SAVE_FR = 'Enregistrer cette recette';
const SAVED_FR = 'Recette enregistrée';

/** What the browser is actually holding, read the way the service writes it. */
async function stored(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('bah-bookmarks');
    return raw === null ? null : JSON.parse(raw);
  });
}

test.describe('bookmarks', () => {
  test('an anonymous reader can save a recipe and it survives a reload', async ({ page }) => {
    await page.goto('/fr/recettes/babka-au-chocolat');

    await page.getByRole('button', { name: SAVE_FR }).click();
    await expect(page.getByRole('button', { name: SAVED_FR })).toBeVisible();

    // The key, not the slug. This is the assertion that would fail if anybody
    // stored what the URL bar happens to say - and it would fail silently, one
    // language switch later, rather than here.
    expect(await stored(page)).toEqual(['babka']);

    await page.reload();
    await expect(page.getByRole('button', { name: SAVED_FR })).toBeVisible();
  });

  test('nothing is sent to the server while nobody is signed in', async ({ page }) => {
    // Criterion 2. The whole point of the local-first half is that saving costs
    // no round trip, and an implementation that quietly called the API anyway
    // would still pass every other test in this file.
    const calls: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/(auth\/bookmarks|recipes\/[^/]+\/bookmark)/.test(request.url())) {
        calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });

    await page.goto('/fr/recettes/babka-au-chocolat');
    await page.getByRole('button', { name: SAVE_FR }).click();
    await expect(page.getByRole('button', { name: SAVED_FR })).toBeVisible();

    expect(calls).toEqual([]);
  });

  test('a saved recipe is still there after switching language', async ({ page }) => {
    // Criterion 5, and the reason the key exists at all. The French page calls
    // this recipe babka-au-chocolat and the English one calls it
    // chocolate-babka; a list held as slugs would be empty here.
    await page.goto('/fr/recettes/babka-au-chocolat');
    await page.getByRole('button', { name: SAVE_FR }).click();
    await expect(page.getByRole('button', { name: SAVED_FR })).toBeVisible();

    await page.goto('/en/saved');
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
    await expect(page.locator('bah-recipe-card h3')).toHaveText('Chocolate babka');
  });

  test('the empty state says where bookmarks live and claims nothing else', async ({ page }) => {
    // Criterion 7. "You have no saved recipes" is false on a second device, and
    // false in the direction that makes the feature look broken, so the page
    // must say where they are kept and that signing in may find more.
    await page.goto('/fr/enregistrees');

    await expect(page.getByText("Rien d'enregistré dans ce navigateur.")).toBeVisible();
    await expect(
      page.getByText("Vos recettes enregistrées sur d'autres appareils apparaîtront ici"),
    ).toBeVisible();
    await expect(page.locator('bah-recipe-card')).toHaveCount(0);
  });

  test('unsaving removes it from the list', async ({ page }) => {
    await page.goto('/fr/recettes/babka-au-chocolat');
    await page.getByRole('button', { name: SAVE_FR }).click();
    await expect(page.getByRole('button', { name: SAVED_FR })).toBeVisible();

    await page.getByRole('button', { name: SAVED_FR }).click();
    await expect(page.getByRole('button', { name: SAVE_FR })).toBeVisible();
    expect(await stored(page)).toEqual([]);
  });
});

test.describe('a shared list', () => {
  test('opens on a device holding no bookmarks of its own', async ({ page }) => {
    // Criterion 10. Nothing is written until the reader asks, so the link is
    // safe to open and safe to send.
    // Keys, not slugs - shakshuka is the key, chakchouka is what the French
    // page calls it. Written the wrong way round the first time, which is the
    // confusion the key exists to prevent and is worth leaving pinned here.
    await page.goto('/fr/enregistrees?r=babka,shakshuka');

    await expect(page.locator('bah-recipe-card')).toHaveCount(2);
    await expect(page.getByText('Une liste partagée')).toBeVisible();
    expect(await stored(page)).toBeNull();
  });

  test('is adopted only when asked, and joins what was already saved', async ({ page }) => {
    await page.goto('/fr/recettes/babka-au-chocolat');
    await page.getByRole('button', { name: SAVE_FR }).click();
    await expect(page.getByRole('button', { name: SAVED_FR })).toBeVisible();

    await page.goto('/fr/enregistrees?r=shakshuka');
    await page.getByRole('button', { name: 'Tout enregistrer' }).click();

    // A union: opening somebody's link must not cost you your own recipes.
    await expect
      .poll(async () => stored(page))
      .toEqual(expect.arrayContaining(['babka', 'shakshuka']));
  });

  test('ignores keys that match nothing rather than breaking', async ({ page }) => {
    // Criterion 11. A link outlives a recipe, and the reader who was sent one
    // should see whatever of it still exists.
    await page.goto('/fr/enregistrees?r=babka,deleted-long-ago,,');

    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
    await expect(page.locator('bah-recipe-card h3')).toHaveText('Babka au chocolat');
  });

  test('a link of only unknown keys is an empty shared list, not an error', async ({ page }) => {
    await page.goto('/fr/enregistrees?r=nothing-here');

    await expect(page.locator('bah-recipe-card')).toHaveCount(0);
    await expect(page.getByText("Rien d'enregistré dans ce navigateur.")).toBeVisible();
  });
});
