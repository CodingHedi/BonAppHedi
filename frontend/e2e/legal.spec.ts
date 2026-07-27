import { expect, test } from './fixtures';

/**
 * The mandatory notices. Two things are worth asserting and neither is about
 * looks: that they can be reached from an ordinary page, and that the privacy
 * policy still says the specific things it promises.
 *
 * Both routes existed for weeks with nothing on the site linking to them, which
 * is the failure this file exists to catch — a notice nobody can reach is not
 * published, however correct its contents.
 */
test.describe('legal pages', () => {
  test('the footer reaches both notices, in French', async ({ page }) => {
    await page.goto('/fr');

    await page.getByRole('contentinfo').getByRole('link', { name: 'Confidentialité' }).click();
    await expect(page).toHaveURL(/\/fr\/confidentialite$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confidentialité');

    await page.getByRole('contentinfo').getByRole('link', { name: 'Mentions légales' }).click();
    await expect(page).toHaveURL(/\/fr\/mentions-legales$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentions légales');
  });

  test('the footer reaches both notices, in English', async ({ page }) => {
    // The segments are translated, so these are different paths reaching the
    // same components — a hardcoded French segment would 404 here.
    await page.goto('/en');

    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/en\/privacy$/);

    await page.getByRole('contentinfo').getByRole('link', { name: 'Legal notice' }).click();
    await expect(page).toHaveURL(/\/en\/legal-notice$/);
  });

  test('the privacy policy names what it actually stores', async ({ page }) => {
    await page.goto('/fr/confidentialite');

    // Each of these is a statement about code, and each would be a lie if the
    // corresponding behaviour changed: the cookie name, the fact that the
    // address is hashed rather than kept, and the click-to-load video.
    await expect(page.getByText('bah-visitor')).toBeVisible();
    await expect(page.getByText(/HMAC-SHA256/)).toBeVisible();
    await expect(page.getByText(/youtube-nocookie\.com/)).toBeVisible();

    // The contact address and the host are deliberately not repeated here; the
    // page defers to the mentions légales and must keep linking there.
    await page.getByRole('link', { name: 'Mentions légales' }).first().click();
    await expect(page).toHaveURL(/\/fr\/mentions-legales$/);
  });

  test('reading the policy sets no cookie', async ({ page, context }) => {
    // Weak against the mocks, where no backend exists to set one, and kept for
    // the acceptance run against the real API — where the claim is real and
    // `VisitorIdentity` issuing a cookie on arrival rather than on the first
    // write would turn this page into a false statement.
    await page.goto('/fr/confidentialite');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const cookies = await context.cookies();
    expect(cookies.filter((c) => c.name === 'bah-visitor')).toEqual([]);
  });
});
