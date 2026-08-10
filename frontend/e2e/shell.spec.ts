import { expect, test } from './fixtures';

const THEME_KEY = 'bah-organic-theme';

test.describe('app shell', () => {
  test('bare / redirects into a locale prefix', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(fr|en)$/);
  });

  test('locale prefix drives <html lang> and the header switch', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { name: 'Toutes les recettes' })).toBeVisible();

    await page.getByRole('button', { name: /English/i }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'All recipes' })).toBeVisible();
  });

  test('localized route segments resolve in both languages', async ({ page }) => {
    // Both the segment (recettes/recipes) and the slug are translated, so these
    // are genuinely different URLs reaching the same recipe.
    await page.goto('/fr/recettes/babka-au-chocolat');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Babka au chocolat');

    await page.goto('/en/recipes/chocolate-babka');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chocolate babka');
  });

  test('the language button carries the slug across, not only the segment', async ({ page }) => {
    /*
     * The test above proves both URLs exist; it navigates to each directly and
     * never presses the button, which is exactly how this shipped broken.
     *
     * The header translates route segments from the locale tables and cannot
     * translate a slug, because a slug is a database row. It used to carry the
     * current one across unchanged and produce /en/recipes/babka-au-chocolat —
     * a real route holding a slug that does not exist in that language, so
     * pressing "EN" on a recipe reported that the recipe was missing.
     */
    await page.goto('/fr/recettes/babka-au-chocolat');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Babka au chocolat');

    await page.getByRole('button', { name: /English/i }).click();
    await expect(page).toHaveURL(/\/en\/recipes\/chocolate-babka$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chocolate babka');

    // And back, because a one-directional lookup would pass the half above.
    await page.getByRole('button', { name: /français/i }).click();
    await expect(page).toHaveURL(/\/fr\/recettes\/babka-au-chocolat$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Babka au chocolat');
  });

  test('an unknown recipe slug renders the site 404, not a second one', async ({ page }) => {
    // A missing recipe used to render a bare heading and a button written into
    // the recipe page, while the designed 404 was reachable only by mistyping
    // a path that was not a recipe at all. Both are "no such recipe".
    await page.goto('/fr/recettes/pas-une-vraie-recette');

    await expect(page.getByText('404', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  });

  test('the 404 offers a recipe to try, and it goes somewhere real', async ({ page }) => {
    await page.goto('/fr/une-page-qui-nexiste-pas');

    const suggestion = page.locator('.hint').getByRole('link');
    await expect(suggestion).toBeVisible();

    // The point of the link is that it works, so follow it rather than trusting
    // the href: a suggestion pointing at another 404 would be worse than none.
    const title = (await suggestion.textContent())?.trim();
    await suggestion.click();
    await expect(page).toHaveURL(/\/fr\/recettes\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title!);
  });

  test('theme persists across a reload with no flash of the wrong theme', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: /thème sombre/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('dark');

    // The blocking script in index.html must set the attribute before the first
    // paint, so it is already correct at DOMContentLoaded — not after hydration.
    await page.goto('/fr', { waitUntil: 'commit' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('starts dark when the OS prefers dark and nothing is stored', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/fr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await context.close();
  });

  test('unknown route inside a locale renders the 404 page', async ({ page }) => {
    await page.goto('/fr/nawak');
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  });
});
