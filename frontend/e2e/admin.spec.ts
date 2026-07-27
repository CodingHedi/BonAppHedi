import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const ADMIN = '/fr/admin';
const BABKA = '/fr/recettes/babka-au-chocolat';
/** Seeded DRAFT, so it must be absent from everything public. */
const DRAFT_SLUG = '/fr/recettes/jus-grenade-orange';

/**
 * Signs in by planting the mock's session before the app boots.
 *
 * Going through the comment box works and is covered once below, but every
 * other test here is about the admin area rather than about how one arrives at
 * it, and paying two navigations per test to re-prove the sign-in flow makes
 * the suite slower without making it stricter.
 */
async function signedInAs(page: Page, role: 'admin' | 'reader') {
  await page.addInitScript(
    ([isAdmin]) => {
      localStorage.setItem(
        'bah-mock-session',
        JSON.stringify({
          id: 'e2e',
          displayName: isAdmin ? 'Hédi' : 'Camille',
          avatar: 'pot/0',
          isAdmin,
        }),
      );
    },
    [role === 'admin'],
  );
}

test.describe('access', () => {
  test('a signed-out visitor is sent home rather than shown the door', async ({ page }) => {
    await page.goto(ADMIN);
    await expect(page).toHaveURL(/\/fr$/);
  });

  test('a signed-in reader without the role is sent home too', async ({ page }) => {
    // Being signed in is not the same as being allowed in.
    await signedInAs(page, 'reader');
    await page.goto(ADMIN);
    await expect(page).toHaveURL(/\/fr$/);
  });

  test('the header offers no way in unless you are an admin', async ({ page }) => {
    await page.goto(BABKA);
    await expect(page.getByRole('link', { name: "Ouvrir l'administration" })).toHaveCount(0);
  });

  test('signing in as the admin opens the door, without a reload', async ({ page }) => {
    // The one test that walks the real path: sign in through the comment box,
    // then reach the admin area by clicking, exactly as a person would.
    await page.goto(BABKA);
    await page.getByRole('button', { name: /Google/ }).click();
    await expect(page.locator('bah-comment-section textarea')).toBeVisible();

    await page.getByRole('link', { name: "Ouvrir l'administration" }).click();
    await expect(page).toHaveURL(/\/fr\/admin\/recipes$/);
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });
});

test.describe('recipe table', () => {
  test.beforeEach(async ({ page }) => signedInAs(page, 'admin'));

  test('lists every recipe including the ones the public cannot see', async ({ page }) => {
    await page.goto(ADMIN);

    await expect(page.locator('table tbody tr')).toHaveCount(6);
    await expect(page.locator('table tbody')).toContainText('brouillon');
  });

  test('shows which languages a recipe is still missing', async ({ page }) => {
    // Finding the untranslated ones is half the job, so both languages are
    // always listed and the absent one is struck through rather than omitted.
    await page.goto(ADMIN);
    await expect(page.locator('table tbody .lang').first()).toBeVisible();
  });
});

test.describe('drafts are genuinely unpublished', () => {
  test('a draft is absent from the public list', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('bah-recipe-card')).toHaveCount(5);
    await expect(page.locator('bah-recipe-card', { hasText: 'Jus grenade' })).toHaveCount(0);
  });

  test('a draft’s own URL is a 404, not merely unlisted', async ({ page }) => {
    // Otherwise "unpublished" would mean nothing more than "hard to find".
    await page.goto(DRAFT_SLUG);
    await expect(page.getByText('Cette recette est introuvable.')).toBeVisible();
  });

  test('publishing one puts it on the public site', async ({ page }) => {
    await signedInAs(page, 'admin');
    await page.goto(ADMIN);

    const draft = page.locator('table tbody tr', { hasText: 'brouillon' });
    await draft.getByRole('button', { name: 'Publier' }).click();
    await expect(page.locator('table tbody')).not.toContainText('brouillon');

    // Client-side back to the public list: a reload would rebuild the mock
    // store from the seed and throw the change away.
    await page.getByRole('link', { name: 'Accueil' }).click();
    await expect(page.locator('bah-recipe-card')).toHaveCount(6);
  });
});

test.describe('recipe editor', () => {
  test.beforeEach(async ({ page }) => signedInAs(page, 'admin'));

  test('edits both languages behind locale tabs', async ({ page }) => {
    await page.goto('/fr/admin/recipes/babka');

    const title = page.locator('input.input').first();
    await expect(title).toHaveValue('Babka au chocolat');

    await page.getByRole('tab', { name: 'EN' }).click();
    await expect(title).toHaveValue('Chocolate babka');

    // Shared fields are outside the tabs: they belong to the recipe, not to a
    // translation, which is the whole reason the tabs exist.
    await expect(page.getByLabel('Portions')).toHaveValue('2');
  });

  test('arrow keys move between the locale tabs', async ({ page }) => {
    await page.goto('/fr/admin/recipes/babka');

    const fr = page.getByRole('tab', { name: 'FR' });
    await fr.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'EN' })).toHaveAttribute('aria-selected', 'true');
  });

  test('a saved title reaches the public page', async ({ page }) => {
    await page.goto('/fr/admin/recipes/babka');

    await page.locator('input.input').first().fill('Babka revisitée');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.ok')).toBeVisible();

    await page.getByRole('link', { name: 'Accueil' }).click();
    await expect(page.locator('bah-recipe-card').first()).toContainText('Babka revisitée');
  });

  test('a save cannot wipe the ratings it never carried', async ({ page }) => {
    // The draft has no rating fields, so a save that spread it over the stored
    // record would reset every score the first time a typo was fixed.
    await page.goto('/fr/admin/recipes/babka');
    await page.locator('input.input').first().fill('Babka relue');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.ok')).toBeVisible();

    await page.getByRole('link', { name: 'Accueil' }).click();
    await page.getByRole('link', { name: /Babka relue/ }).first().click();

    // Scoped to the detail page: `.meta` also exists on every list card, so an
    // unscoped locator matches five things and asserts nothing.
    const meta = page.locator('bah-recipe-detail-page .meta');
    await expect(meta).toContainText('4.0 / 5');
    await expect(meta).toContainText('1 avis');
  });

  test('ingredients and steps can be added and removed', async ({ page }) => {
    await page.goto('/fr/admin/recipes/babka');

    const ingredients = page.getByLabel("Nom de l'ingrédient");

    // Wait for the form before counting, or `before` is 0 and the assertion
    // below passes against an empty editor.
    await expect(ingredients.first()).toBeVisible();
    const before = await ingredients.count();

    await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
    await expect(ingredients).toHaveCount(before + 1);

    await page.getByRole('button', { name: 'Supprimer la ligne' }).first().click();
    await expect(ingredients).toHaveCount(before);
  });

  test('a new recipe cannot be saved without a key', async ({ page }) => {
    await page.goto('/fr/admin/recipes/new');
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    // Exact, or it also matches "Identifiant vidéo YouTube".
    await page.getByLabel('Identifiant', { exact: true }).fill('tarte-tatin');
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  test('creating one moves the editor to its own URL', async ({ page }) => {
    await page.goto('/fr/admin/recipes/new');

    // Exact, or it also matches "Identifiant vidéo YouTube".
    await page.getByLabel('Identifiant', { exact: true }).fill('tarte-tatin');
    await page.locator('input.input').first().fill('Tarte Tatin');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // So a reload lands on the recipe rather than back on an empty form.
    await expect(page).toHaveURL(/\/admin\/recipes\/tarte-tatin$/);
  });

  test('an unknown key says so instead of rendering an empty form', async ({ page }) => {
    await page.goto('/fr/admin/recipes/nexiste-pas');
    await expect(page.getByText('Cette recette est introuvable.')).toBeVisible();
  });
});

test.describe('moderation', () => {
  test.beforeEach(async ({ page }) => signedInAs(page, 'admin'));

  test('queues the comment the public thread is hiding', async ({ page }) => {
    await page.goto('/fr/admin/comments');

    await expect(page.locator('.item')).toHaveCount(1);
    await expect(page.locator('.item')).toContainText('premier !!!');
    // Named with the recipe it belongs to, or the decision has no context.
    await expect(page.locator('.item')).toContainText('Chakchouka');
  });

  test('approving publishes it to the thread', async ({ page }) => {
    await page.goto('/fr/admin/comments');
    await page.getByRole('button', { name: 'Approuver' }).click();
    await expect(page.locator('.empty')).toBeVisible();

    await page.getByRole('link', { name: 'Accueil' }).click();
    await page.getByRole('link', { name: /Chakchouka/ }).first().click();
    await expect(page.locator('bah-comment-section')).toContainText('premier !!!');
    await expect(page.locator('bah-comment-section h2')).toHaveText('2 commentaires');
  });

  test('rejecting removes it from the site entirely', async ({ page }) => {
    await page.goto('/fr/admin/comments');
    await page.getByRole('button', { name: 'Rejeter' }).click();
    await expect(page.locator('.empty')).toBeVisible();

    await page.getByRole('link', { name: 'Accueil' }).click();
    await page.getByRole('link', { name: /Chakchouka/ }).first().click();
    await expect(page.locator('bah-comment-section')).not.toContainText('premier !!!');
    await expect(page.locator('bah-comment-section h2')).toHaveText('1 commentaire');
  });
});

test.describe('analytics', () => {
  test.beforeEach(async ({ page }) => signedInAs(page, 'admin'));

  test('counts what the site has accumulated', async ({ page }) => {
    await page.goto('/fr/admin/stats');

    const tiles = page.locator('.tile');
    await expect(tiles.nth(0)).toContainText('5');
    await expect(tiles.nth(0)).toContainText('Recettes publiées');
    await expect(tiles.nth(1)).toContainText('1');
    await expect(tiles.nth(1)).toContainText('Brouillons');
  });

  test('surfaces the moderation backlog where it will be seen', async ({ page }) => {
    await page.goto('/fr/admin/stats');
    await expect(page.locator('.pending')).toContainText('1');
  });

  test('separates “not rated yet” from “rated badly”', async ({ page }) => {
    // Only the babka has a rating, so the leaderboard has exactly one entry
    // rather than six recipes tied at zero.
    await page.goto('/fr/admin/stats');
    await expect(page.locator('.top li')).toHaveCount(1);
  });
});

test.describe('english locale', () => {
  test.beforeEach(async ({ page }) => signedInAs(page, 'admin'));

  test('the admin area is translated', async ({ page }) => {
    await page.goto('/en/admin');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administration');
    await expect(page.locator('.sections')).toContainText('Moderation');
    await expect(page.locator('table tbody')).toContainText('draft');
  });
});
