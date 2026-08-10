import { expect, test } from './fixtures';

const RECIPE = '/fr/recettes/babka-au-chocolat';

const opener = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Rechercher' });

const box = (page: import('@playwright/test').Page) =>
  page.locator('bah-quick-search input[type="search"]');

const hits = (page: import('@playwright/test').Page) =>
  page.locator('bah-quick-search .hit');

test.describe('quick search', () => {
  test('opens in place and does not leave the page', async ({ page }) => {
    // The whole point of the change: looking something up from halfway down a
    // recipe used to cost you the recipe.
    await page.goto(RECIPE);
    await opener(page).click();

    await expect(box(page)).toBeFocused();
    await expect(page).toHaveURL(new RegExp(RECIPE + '$'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Babka au chocolat');
  });

  test('answers as you type, without a navigation', async ({ page }) => {
    await page.goto(RECIPE);
    await opener(page).click();
    await box(page).fill('levain');

    await expect(hits(page)).toHaveCount(1);
    await expect(hits(page).first()).toContainText('Pain au levain');
    await expect(page).toHaveURL(new RegExp(RECIPE + '$'));
  });

  test('searches ingredients, not only titles', async ({ page }) => {
    // searchText carries the ingredient names, which is why "which recipe uses
    // saffron?" is answerable without the list endpoint shipping every row.
    await page.goto('/fr');
    await opener(page).click();
    await box(page).fill('abricots');

    await expect(hits(page).first()).toContainText('Tajine');
  });

  test('forgives a typo and says that it did', async ({ page }) => {
    // Exact first, fuzzy only when exact found nothing — and the near miss is
    // announced rather than silently widening the search.
    await page.goto('/fr');
    await opener(page).click();
    await box(page).fill('chakchuka');

    await expect(hits(page).first()).toContainText('Chakchouka');
    await expect(page.locator('bah-quick-search .note')).toContainText('chakchuka');
  });

  test('folds accents, because nobody types them', async ({ page }) => {
    await page.goto('/fr');
    await opener(page).click();
    await box(page).fill('mijote');

    await expect(hits(page).first()).toContainText('Tajine');
  });

  test('choosing a result is the only thing that navigates', async ({ page }) => {
    await page.goto(RECIPE);
    await opener(page).click();
    await box(page).fill('chakchouka');
    await hits(page).first().click();

    await expect(page).toHaveURL(/\/fr\/recettes\/chakchouka$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chakchouka');
  });

  test('the keyboard alone can reach a recipe', async ({ page }) => {
    await page.goto('/fr');
    await opener(page).click();
    await box(page).fill('cheesecake');
    await box(page).press('ArrowDown');
    await box(page).press('Enter');

    await expect(page).toHaveURL(/\/fr\/recettes\/cheesecake-basque$/);
  });

  test('Escape closes it and leaves the page alone', async ({ page }) => {
    await page.goto(RECIPE);
    await opener(page).click();
    await box(page).fill('pain');
    await expect(hits(page).first()).toBeVisible();

    await box(page).press('Escape');

    await expect(hits(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(RECIPE + '$'));
  });

  test('says so when nothing matches', async ({ page }) => {
    await page.goto('/fr');
    await opener(page).click();
    await box(page).fill('zzzzzzzz');

    await expect(hits(page)).toHaveCount(0);
    await expect(page.locator('bah-quick-search .note')).toBeVisible();
  });

  test('a draft is not reachable through it', async ({ page }) => {
    // The quick search reads the public list, so "unpublished" has to mean
    // unpublished here too rather than merely unlisted.
    await page.goto('/fr');
    await opener(page).click();
    await box(page).fill('grenade');

    await expect(hits(page)).toHaveCount(0);
  });
});
