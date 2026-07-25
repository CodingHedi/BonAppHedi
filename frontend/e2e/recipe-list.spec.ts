import { expect, test } from './fixtures';

test.describe('recipe list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/fr');
  });

  test('renders the six seeded recipes', async ({ page }) => {
    await expect(page.locator('bah-recipe-card')).toHaveCount(6);
    await expect(page.getByText('6 recettes')).toBeVisible();
  });

  test('search folds accents, so "mijote" finds the tajine', async ({ page }) => {
    const search = page.getByRole('searchbox');

    await search.fill('mijote');
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Tajine de bœuf' })).toBeVisible();

    // The accented spelling must behave identically.
    await search.fill('mijoté');
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
  });

  test('search reaches ingredient names, not just titles', async ({ page }) => {
    // "Poivron" appears only in the shakshuka's ingredient list.
    await page.getByRole('searchbox').fill('poivron');
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Chakchouka' })).toBeVisible();
  });

  test('an unmatched search offers a way out', async ({ page }) => {
    await page.getByRole('searchbox').fill('zzzzz');
    await expect(page.locator('bah-recipe-card')).toHaveCount(0);

    await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
    await expect(page.locator('bah-recipe-card')).toHaveCount(6);
  });

  test('tag filter narrows the grid', async ({ page }) => {
    await page.getByLabel('Trier par tags').selectOption('dessert');
    await expect(page.locator('bah-recipe-card')).toHaveCount(2);
  });

  test('sort order flips the grid', async ({ page }) => {
    const titles = () => page.locator('bah-recipe-card h3');

    // Newest first by default: the babka is 4 days old.
    await expect(titles().first()).toHaveText('Babka au chocolat');

    await page.getByLabel('Trier par date').selectOption('oldest');
    // Oldest is the sourdough at 34 days.
    await expect(titles().first()).toHaveText('Pain au levain');
  });

  test('relative dates are rendered from real timestamps', async ({ page }) => {
    // Proves the pipe ran rather than a hardcoded string being displayed.
    const card = page.locator('bah-recipe-card').filter({ hasText: 'Babka au chocolat' });
    await expect(card.locator('time')).toHaveText(/il y a \d+ jours?/);
  });

  test('carousel arrows wrap in both directions', async ({ page }) => {
    const heading = page.locator('bah-hero-carousel h2').first();
    await expect(heading).toHaveText('Babka au chocolat');

    // Backwards from the first slide lands on the last.
    await page.getByRole('button', { name: 'Précédent' }).click();
    await expect(page.locator('bah-hero-carousel h2').nth(2)).toBeVisible();

    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(heading).toHaveText('Babka au chocolat');
  });

  test('dots jump to a slide and mark the current one', async ({ page }) => {
    await page.getByRole('button', { name: 'Aller à la diapositive 2' }).click();
    await expect(page.getByRole('button', { name: 'Aller à la diapositive 2' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('inactive slides are inert, so tab order skips them', async ({ page }) => {
    const slides = page.locator('bah-hero-carousel article');
    await expect(slides.nth(0)).not.toHaveAttribute('inert', /.*/);
    await expect(slides.nth(1)).toHaveAttribute('inert', '');
  });

  test('English locale shows translated content and slugs', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('heading', { name: 'All recipes' })).toBeVisible();
    await expect(page.locator('bah-recipe-card')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: 'Chocolate babka' }).first()).toBeVisible();

    await page.locator('bah-recipe-card').filter({ hasText: 'Chocolate babka' }).click();
    await expect(page).toHaveURL(/\/en\/recipes\/chocolate-babka$/);
  });

  test('card links carry the locale-correct slug', async ({ page }) => {
    await page.locator('bah-recipe-card').filter({ hasText: 'Babka au chocolat' }).click();
    await expect(page).toHaveURL(/\/fr\/recettes\/babka-au-chocolat$/);
  });
});
