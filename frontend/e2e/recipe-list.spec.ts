import { expect, test } from './fixtures';

test.describe('recipe list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/fr');
  });

  test('renders the published recipes, and only those', async ({ page }) => {
    // Six are seeded; one is a DRAFT and belongs to the admin area alone.
    await expect(page.locator('bah-recipe-card')).toHaveCount(5);
    await expect(page.getByText('5 recettes')).toBeVisible();
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
    await expect(page.locator('bah-recipe-card')).toHaveCount(5);
  });

  test('a typo still finds the recipe, and says that it guessed', async ({ page }) => {
    // The exact search finds nothing for this, so the tolerant one answers —
    // and announces itself, because near misses presented as matches are worse
    // than no results.
    await page.getByRole('searchbox').fill('chakchuka');

    await expect(page.getByRole('heading', { name: 'Chakchouka' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Aucun résultat exact');
  });

  test('an exact search is never widened underneath the visitor', async ({ page }) => {
    // "poivron" is two edits from "poivre", which other recipes contain. It
    // matches exactly here, so the tolerant pass must never run.
    await page.getByRole('searchbox').fill('poivron');

    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('tags narrow the grid, and combine', async ({ page }) => {
    const dessert = page.getByRole('button', { name: 'dessert' });
    await dessert.click();
    await expect(dessert).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('bah-recipe-card')).toHaveCount(2);

    // A second tag narrows further rather than adding to the results: picking
    // two filters asks for both, and a filter that grows the grid reads as
    // broken.
    await page.getByRole('button', { name: 'chocolat' }).click();
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
    // Scoped to the grid: the carousel carries the same title above it.
    await expect(page.locator('bah-recipe-card h3')).toHaveText('Babka au chocolat');
  });

  test('a tag is removed on its own, without rebuilding the query', async ({ page }) => {
    await page.getByRole('button', { name: 'dessert' }).click();
    await page.getByRole('button', { name: 'chocolat' }).click();
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);

    // Pressing it again lets go of that one tag and keeps the rest.
    await page.getByRole('button', { name: 'chocolat' }).click();
    await expect(page.locator('bah-recipe-card')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'dessert' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the search box clears on its own', async ({ page }) => {
    const search = page.getByRole('searchbox');
    await search.fill('babka');
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);

    await page.getByRole('button', { name: 'Effacer la recherche' }).click();
    await expect(search).toHaveValue('');
    await expect(page.locator('bah-recipe-card')).toHaveCount(5);
  });

  test('clear all appears only when there is something to clear', async ({ page }) => {
    const clearAll = page.getByRole('button', { name: 'Tout effacer' });
    await expect(clearAll).toHaveCount(0);

    await page.getByRole('searchbox').fill('babka');
    await page.getByRole('button', { name: 'dessert' }).click();
    await expect(clearAll).toBeVisible();

    await clearAll.click();
    await expect(page.getByRole('searchbox')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'dessert' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('bah-recipe-card')).toHaveCount(5);
    await expect(clearAll).toHaveCount(0);
  });

  test('clearing everything leaves the sort order alone', async ({ page }) => {
    // Sort is how the list is ordered, not what it contains. Resetting it would
    // undo a choice about a different question.
    await page.getByLabel('Trier par date').selectOption('oldest');
    await page.getByRole('searchbox').fill('babka');

    await page.getByRole('button', { name: 'Tout effacer' }).click();

    await expect(page.getByLabel('Trier par date')).toHaveValue('oldest');
    await expect(page.locator('bah-recipe-card h3').first()).toHaveText('Pain au levain');
  });

  test('the header magnifier reaches the search box from another page', async ({ page }) => {
    // It was a labelled button that did nothing, on every page, since the
    // prototype was transcribed.
    await page.goto('/fr/recettes/babka-au-chocolat');
    await page.getByRole('button', { name: 'Rechercher' }).click();

    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.getByRole('searchbox')).toBeFocused();
  });

  test('and focuses the box when already on the list', async ({ page }) => {
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await expect(page.getByRole('searchbox')).toBeFocused();
  });

  test('the focus request does not linger for the next visit', async ({ page }) => {
    // A flag left standing would mean that arriving at the home page — at any
    // point after the magnifier had ever been pressed — moved the cursor into
    // the search box unasked, which steals the keyboard from someone who came
    // to read.
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await expect(page.getByRole('searchbox')).toBeFocused();

    await page.locator('bah-recipe-card').first().click();
    await expect(page).toHaveURL(/\/fr\/recettes\//);

    await page.goBack();
    await expect(page.locator('bah-recipe-card').first()).toBeVisible();
    await expect(page.getByRole('searchbox')).not.toBeFocused();
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
    await expect(page.locator('bah-recipe-card')).toHaveCount(5);
    await expect(page.getByRole('heading', { name: 'Chocolate babka' }).first()).toBeVisible();

    await page.locator('bah-recipe-card').filter({ hasText: 'Chocolate babka' }).click();
    await expect(page).toHaveURL(/\/en\/recipes\/chocolate-babka$/);
  });

  test('card links carry the locale-correct slug', async ({ page }) => {
    await page.locator('bah-recipe-card').filter({ hasText: 'Babka au chocolat' }).click();
    await expect(page).toHaveURL(/\/fr\/recettes\/babka-au-chocolat$/);
  });
});
