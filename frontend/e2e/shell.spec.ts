import { expect, test } from '@playwright/test';

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
    await page.goto('/fr/recettes/babka-au-chocolat');
    await expect(page.locator('h1')).toContainText('babka-au-chocolat');

    await page.goto('/en/recipes/chocolate-babka');
    await expect(page.locator('h1')).toContainText('chocolate-babka');
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
