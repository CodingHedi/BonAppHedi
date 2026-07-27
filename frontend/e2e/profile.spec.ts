import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The account page, where an avatar is chosen (ADR 7).
 *
 * The fixture fails these on any console error or failed request even when the
 * assertions pass, which matters more here than usual: the whole point of a
 * chosen avatar is that displaying one costs no request at all.
 */

const PROFILE = '/fr/profil';
const BABKA = '/fr/recettes/babka-au-chocolat';

/** Hosts that would mean a picture came from somewhere other than this site. */
const REMOTE_IMAGE = /googleusercontent\.com|graph\.facebook\.com|gravatar/i;

/**
 * Signs in by planting the mock's session, as the admin specs do.
 *
 * Only when there is not one already, which matters here and nowhere else: an
 * init script runs on *every* navigation, so seeding unconditionally would put
 * the starting avatar back on each reload and quietly undo the thing these tests
 * are about. Storage is per test, so this cannot leak between them.
 */
async function signedIn(page: Page, avatar: string | null = null) {
  await page.addInitScript(
    ([token]) => {
      if (localStorage.getItem('bah-mock-session')) return;
      localStorage.setItem(
        'bah-mock-session',
        JSON.stringify({ id: 'e2e', displayName: 'Hédi', avatar: token, isAdmin: false }),
      );
    },
    [avatar],
  );
}

test.describe('access', () => {
  test('a signed-out visitor is offered sign-in rather than a blank profile', async ({ page }) => {
    // Unlike the admin area, which sends a stranger home: being signed out here
    // is an ordinary state with an obvious remedy, and there is no reason to
    // pretend the page does not exist.
    await page.goto(PROFILE);

    await expect(page).toHaveURL(/\/fr\/connexion/);
    // Carrying where they were going, so signing in lands them on it.
    await expect(page).toHaveURL(/returnTo=/);
  });

  test('the header offers no account button until there is an account', async ({ page }) => {
    await page.goto(BABKA);
    await expect(page.getByRole('link', { name: 'Mon compte' })).toHaveCount(0);
  });

  test('the header and the footer both lead to it once signed in', async ({ page }) => {
    await signedIn(page);
    await page.goto(BABKA);

    // Two ways in: the header avatar, and the footer link that says "sign in"
    // when there is nobody signed in.
    await expect(page.getByRole('link', { name: 'Mon compte' })).toHaveCount(2);
    await expect(page.getByRole('link', { name: "S'identifier" })).toHaveCount(0);

    await page.getByRole('link', { name: 'Mon compte' }).first().click();
    await expect(page).toHaveURL(/\/fr\/profil$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon compte');
  });
});

test.describe('choosing an avatar', () => {
  test('offers every subject and every tint, and no image anywhere', async ({ page }) => {
    const remote: string[] = [];
    page.on('request', (request) => {
      if (REMOTE_IMAGE.test(request.url())) remote.push(request.url());
    });

    await signedIn(page);
    await page.goto(PROFILE, { waitUntil: 'networkidle' });

    // Twelve subjects and six tints. Asserted by count rather than by name so
    // this does not have to be edited every time a drawing is added — but a
    // grid that silently rendered half of itself would still fail.
    await expect(page.locator('[role="radiogroup"]').first().getByRole('radio')).toHaveCount(12);
    await expect(page.locator('[role="radiogroup"]').nth(1).getByRole('radio')).toHaveCount(6);

    // Every swatch is drawn, not fetched. This is the assertion the feature
    // exists for.
    await expect(page.locator('bah-avatar svg').first()).toBeVisible();
    await expect(page.locator('bah-avatar img')).toHaveCount(0);
    expect(remote, 'an avatar must cost no request to a third party').toEqual([]);
  });

  test('saves a choice and shows it in the header', async ({ page }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    // The eighth subject on the fourth tint — anything other than the default,
    // so a page that saved its initial state would fail.
    await page.locator('[role="radiogroup"]').first().getByRole('radio').nth(7).click();
    await page.locator('[role="radiogroup"]').nth(1).getByRole('radio').nth(3).click();

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveText('Vignette enregistrée.');

    // Reloaded, because the interesting question is whether it was stored rather
    // than whether a signal was set.
    await page.reload();
    await expect(page.locator('bah-site-header bah-avatar svg')).toBeVisible();
    await expect(page.locator('[role="radiogroup"]').first().getByRole('radio').nth(7)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('[role="radiogroup"]').nth(1).getByRole('radio').nth(3)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Save is inert until something has actually changed', async ({ page }) => {
    await signedIn(page, 'carrot/0');
    await page.goto(PROFILE);

    // Opening the page and pressing Save should not be a write. The button says
    // so rather than accepting the click and doing nothing.
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await page.locator('[role="radiogroup"]').nth(1).getByRole('radio').nth(2).click();
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  test('the shuffle button always changes the selection', async ({ page }) => {
    await signedIn(page, 'carrot/0');
    await page.goto(PROFILE);

    // A shuffle that can land on what you already had reads as a dead button.
    // Pressed repeatedly because it is random: any single press could coincide.
    //
    // Polled rather than read once. `getAttribute` is not a web-first assertion
    // and does not retry, so reading the selection immediately after the click
    // races Angular's render and fails about one press in twelve — which looks
    // exactly like the shuffle having landed on the same avatar.
    for (let i = 0; i < 12; i++) {
      const before = await selection(page);
      await page.getByRole('button', { name: 'Au hasard' }).click();
      await expect.poll(() => selection(page)).not.toEqual(before);
    }
  });

  test('a comment shows the avatar its author chose', async ({ page }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    await page.locator('[role="radiogroup"]').first().getByRole('radio').nth(4).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveText('Vignette enregistrée.');

    await page.goto(BABKA);
    await page.locator('bah-comment-section textarea').fill('Testée et approuvée.');
    await page.getByRole('button', { name: 'Publier' }).click();

    const own = page.locator('bah-comment-section .comment').first();
    await expect(own).toContainText('Hédi');
    await expect(own.locator('bah-avatar .disc svg')).toBeVisible();
  });

  test('is translated, including the subject names', async ({ page }) => {
    await signedIn(page);
    await page.goto('/en/profile');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My account');
    await expect(page.getByRole('button', { name: 'Surprise me' })).toBeVisible();
    // The subjects are the accessible name of each swatch, so leaving them
    // untranslated would leave the grid unusable by anyone not reading French.
    await expect(page.getByRole('radio', { name: 'Rolling pin' })).toBeVisible();
  });

  test('switching language stays on the profile rather than 404ing', async ({ page }) => {
    // The header translates route segments by looking each one up, and two were
    // missing from that list — so /fr/connexion asked for /en/connexion, which is
    // not a route, and the catch-all rendered the 404 page.
    await signedIn(page);
    await page.goto(PROFILE);

    await page.getByRole('button', { name: /English/ }).click();
    await expect(page).toHaveURL(/\/en\/profile$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My account');
  });
});

/** Which subject and tint are currently selected, as two indices. */
async function selection(page: Page): Promise<string> {
  const groups = page.locator('[role="radiogroup"]');
  const subject = await groups.first().locator('[aria-checked="true"]').getAttribute('aria-label');
  const tint = await groups.nth(1).locator('[aria-checked="true"]').getAttribute('aria-label');
  return `${subject}/${tint}`;
}
