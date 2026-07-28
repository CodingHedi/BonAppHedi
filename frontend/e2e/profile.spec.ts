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
 * The page's two halves, each a landmark named by its own heading.
 *
 * Scoped rather than reached for globally, because there are two Save buttons and
 * two status regions on this page and `getByRole('button', { name: 'Enregistrer' })`
 * is ambiguous between them. Positional (`.first()`) would work today and break the
 * first time the sections are reordered — which is exactly the kind of change that
 * should not need the tests edited.
 */
const nameBlock = (page: Page) => page.getByRole('region', { name: /Nom affiché|Display name/ });
const avatarBlock = (page: Page) =>
  page.getByRole('region', { name: /Votre vignette|Your avatar/ });

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

    // Twelve subjects, six tints and seven inks — six hues plus the default,
    // which is a choice in the row rather than an absence of one. Asserted by
    // count rather than by name so this does not have to be edited every time a
    // drawing is added, but a grid that silently rendered half of itself would
    // still fail.
    await expect(page.locator('[role="radiogroup"]').first().getByRole('radio')).toHaveCount(12);
    await expect(page.locator('[role="radiogroup"]').nth(1).getByRole('radio')).toHaveCount(6);
    await expect(page.locator('[role="radiogroup"]').nth(2).getByRole('radio')).toHaveCount(7);

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

    await avatarBlock(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(avatarBlock(page).getByRole('status')).toHaveText('Vignette enregistrée.');

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

  /**
   * Measured rather than inferred from the click.
   *
   * The suite's standing weakness is asserting calls instead of appearance — a
   * green run has already coexisted with a visibly broken video player. An ink
   * that is stored, selected and reported correctly while the icon stays the
   * colour it always was would pass every other assertion here, so this one
   * reads the colour the browser actually computed.
   */
  test('the ink changes the colour the icon is actually drawn in', async ({ page }) => {
    await signedIn(page, 'carrot/0');
    await page.goto(PROFILE);

    const disc = page.locator('.preview bah-avatar .disc');
    const colour = () => disc.evaluate((el) => getComputedStyle(el).color);

    const withDefaultInk = await colour();
    expect(withDefaultInk, 'the disc should have a resolved colour to begin with').toMatch(/^rgb/);

    // The far end of the ramp, as far from the accent as the ink goes, so a
    // binding that quietly did nothing could not pass by coincidence.
    await page.locator('[role="radiogroup"]').nth(2).getByRole('radio').last().click();
    await expect.poll(colour).not.toBe(withDefaultInk);

    // And back to the default, which is what makes it a choice in the row rather
    // than the absence of one.
    await page.locator('[role="radiogroup"]').nth(2).getByRole('radio').first().click();
    await expect.poll(colour).toBe(withDefaultInk);
  });

  test('saves the ink, not only the subject and the tint', async ({ page }) => {
    await signedIn(page, 'carrot/0');
    await page.goto(PROFILE);

    // The token gains a third segment here, and the round trip is the point: an
    // ink the picker writes and the server rejects would show as a save that
    // reported success and then came back changed.
    await page.locator('[role="radiogroup"]').nth(2).getByRole('radio').nth(4).click();
    await avatarBlock(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(avatarBlock(page).getByRole('status')).toHaveText('Vignette enregistrée.');

    await page.reload();
    await expect(
      page.locator('[role="radiogroup"]').nth(2).getByRole('radio').nth(4),
    ).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * The promise the picker is built on, measured rather than asserted.
   *
   * Offering a background colour and an icon colour separately is normally how
   * you get an invisible avatar. The design avoids it by storing only hues and
   * fixing both lightnesses in the stylesheet, per theme — so the claim is that
   * *no* pair of choices is illegible, and a claim like that is worth a number.
   *
   * Every combination is measured, in both themes, by cloning a real disc so the
   * component's own scoped styles apply. 3:1 is the WCAG 1.4.11 bar for non-text
   * contrast, which is what an icon is.
   */
  for (const theme of ['light', 'dark'] as const) {
    test(`every background and ink pair stays legible in the ${theme} theme`, async ({ page }) => {
      await signedIn(page);
      await page.goto(PROFILE);

      // Waited for, because evaluate does not retry: without this the measurement
      // races Angular's first render and reads an empty page, which fails as a
      // TypeError rather than as a contrast problem.
      await expect(page.locator('[role="radiogroup"]')).toHaveCount(3);
      await expect(page.locator('.preview .disc')).toBeVisible();

      if (theme === 'dark') {
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      }

      const worst = await page.evaluate(() => {
        // The ramp is read off the swatches rather than hardcoded here, so adding
        // a hue to the ramp extends this measurement instead of escaping it.
        const swatches = [...document.querySelectorAll('[role="radiogroup"]')][1];
        const hues = [...swatches.querySelectorAll<HTMLElement>('.disc')].map((el) =>
          el.style.getPropertyValue('--seed-hue').trim(),
        );

        // The whole component, not just the disc. The dark-theme rule is written
        // `:host-context([data-theme='dark']) .disc`, which Angular compiles to a
        // selector requiring the host element in the ancestor chain — so a bare
        // cloned disc silently keeps the light-theme colour and the dark theme
        // measures nothing at all.
        const source = document.querySelector<HTMLElement>('.preview bah-avatar');
        if (!source || hues.length === 0) return { ratio: -1, where: 'no avatar or no hues found' };

        const stage = document.createElement('div');
        document.body.append(stage);

        // Chrome reports some of these as `color(srgb 0.89 0.84 0.75)` — floats,
        // not 0-255 — and others as `rgba(227, 215, 192, 0.55)`. Reading the
        // first form as though it were the second makes every backdrop come out
        // near-black, which reads as a contrast failure in the design rather
        // than a units bug here.
        const parse = (colour: string): [number, number, number, number] => {
          const parts = colour.match(/[\d.]+/g)!.map(Number);
          const scale = colour.trimStart().startsWith('color(') ? 255 : 1;
          const [r, g, b] = parts.map((v) => v * scale);
          return [r, g, b, parts[3] ?? 1];
        };

        // srgb over an opaque backdrop.
        const over = (
          top: [number, number, number, number],
          base: [number, number, number, number],
        ): [number, number, number, number] => [
          top[0] * top[3] + base[0] * (1 - top[3]),
          top[1] * top[3] + base[1] * (1 - top[3]),
          top[2] * top[3] + base[2] * (1 - top[3]),
          1,
        ];

        const luminance = ([r, g, b]: [number, number, number, number]) => {
          const channel = (v: number) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };

        const contrast = (
          a: [number, number, number, number],
          b: [number, number, number, number],
        ) => {
          const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        };

        let ratio = Infinity;
        let where = '';

        // null is the default ink, which takes no class and no --ink-hue.
        const inks: (string | null)[] = [null, ...hues];

        for (const seed of hues) {
          for (const ink of inks) {
            const clone = source.cloneNode(true) as HTMLElement;
            stage.append(clone);

            const disc = clone.querySelector<HTMLElement>('.disc');
            if (!disc) {
              stage.remove();
              return { ratio: -1, where: 'the cloned avatar has no disc' };
            }

            disc.style.setProperty('--seed-hue', seed);
            disc.classList.toggle('inked', ink !== null);
            if (ink !== null) disc.style.setProperty('--ink-hue', ink);

            const style = getComputedStyle(disc);
            const base = parse(style.backgroundColor);
            const icon = parse(style.color);

            // .tinted lays a two-stop gradient over .washed, so the disc's real
            // colour is each stop composited over the solid base. Both stops are
            // measured and the worse one kept: an icon only has to be legible
            // against the part of the disc it actually sits on, and it sits on
            // all of it.
            const stops = style.backgroundImage.match(/(?:rgba?|color|hsla?)\([^)]*\)/g) ?? [];
            const backdrops = stops.length
              ? stops.map((stop) => over(parse(stop), base))
              : [base];

            for (const backdrop of backdrops) {
              const value = contrast(icon, backdrop);
              if (value < ratio) {
                ratio = value;
                where =
                  `background hue ${seed} with ink ${ink ?? 'default'}` +
                  ` — icon ${style.color} on rgb(${backdrop.slice(0, 3).map(Math.round).join(', ')})`;
              }
            }

            clone.remove();
          }
        }

        stage.remove();
        return { ratio, where };
      });

      expect(worst.ratio, `nothing was measured (${worst.where})`).toBeGreaterThan(0);
      expect(
        worst.ratio,
        `the worst pair is ${worst.where} at ${worst.ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    });
  }

  test('Save is inert until something has actually changed', async ({ page }) => {
    await signedIn(page, 'carrot/0');
    await page.goto(PROFILE);

    // Opening the page and pressing Save should not be a write. The button says
    // so rather than accepting the click and doing nothing.
    await expect(avatarBlock(page).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await page.locator('[role="radiogroup"]').nth(1).getByRole('radio').nth(2).click();
    await expect(avatarBlock(page).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
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
    await avatarBlock(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(avatarBlock(page).getByRole('status')).toHaveText('Vignette enregistrée.');

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
});

test.describe('choosing a display name', () => {
  const nameField = (page: Page) => nameBlock(page).getByRole('textbox');
  const nameStatus = (page: Page) => nameBlock(page).getByRole('status');

  test('offers the account name as the placeholder, and an empty field', async ({ page }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    // Empty means "no choice", and the placeholder shows what that falls back to.
    // A field pre-filled with the provider's name would make the two states
    // indistinguishable and every save a write.
    await expect(nameField(page)).toHaveValue('');
    await expect(nameField(page)).toHaveAttribute('placeholder', 'Hédi');
    await expect(nameBlock(page).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  test('saves a pseudonym and shows it in the header', async ({ page }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    await nameField(page).fill('Chef H');
    await nameBlock(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(nameStatus(page)).toHaveText('Nom enregistré.');

    // Reloaded, because the question is whether it was stored rather than whether
    // a signal was set.
    await page.reload();
    await expect(nameField(page)).toHaveValue('Chef H');
    await expect(page.locator('.lead')).toContainText('Chef H');
  });

  /**
   * The rename of comments *already posted* is not asserted here, and the reason
   * is worth writing down rather than leaving as a gap.
   *
   * The mock's `SocialStore` holds comments in memory, so a comment posted before
   * navigating to the profile page is gone by the time this suite could come back
   * and look at it. Reshaping the mock to persist them — purely so a test could
   * cross a navigation — would give this one assertion a blast radius across the
   * whole e2e suite, to re-cover something already covered where it actually
   * happens.
   *
   * So it is covered twice, at the levels that can see it:
   * `AuthApiTest.rewritesTheNameOnCommentsAlreadyPosted` against the real database
   * (confirmed to fail when the rewrite is removed), and
   * `social-store.spec.ts` against the mock's own modelling of it.
   *
   * What this file asserts is the half a browser can see: that the choice survives
   * a reload and that a comment written afterwards carries it.
   */
  test('a comment posted afterwards carries the pseudonym, and others keep theirs', async ({
    page,
  }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    await nameField(page).fill('Le Gourmand');
    await nameBlock(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(nameStatus(page)).toHaveText('Nom enregistré.');

    // The session persists across the navigation, so the name does too — which is
    // the thing being checked as much as the byline itself.
    await page.goto(BABKA);
    await page.locator('bah-comment-section textarea').fill('Excellente recette.');
    await page.getByRole('button', { name: 'Publier' }).click();

    const own = page.locator('bah-comment-section .comment').first();
    await expect(own).toContainText('Le Gourmand');
    await expect(own).not.toContainText('Hédi');

    // Camille is seeded and belongs to nobody, so a rename that reached beyond
    // this account would show up here.
    const thread = page.locator('bah-comment-section .comment');
    await expect(thread.filter({ hasText: 'Camille' })).toHaveCount(1);
  });

  test('clearing the field goes back to the account name', async ({ page }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    await nameField(page).fill('Le Gourmand');
    await nameBlock(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(nameStatus(page)).toHaveText('Nom enregistré.');

    // Emptying it is a clear, not a blank name — otherwise a pseudonym could be
    // set and never undone.
    await nameField(page).fill('');
    await expect(nameBlock(page).getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    await nameBlock(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(nameStatus(page)).toHaveText('Nom enregistré.');

    await expect(nameField(page)).toHaveValue('');
    await expect(page.locator('.lead')).toContainText('Hédi');

    await page.goto(BABKA);
    await page.locator('bah-comment-section textarea').fill('Un mot.');
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page.locator('bah-comment-section .comment').first()).toContainText('Hédi');
  });

  test('Save is inert until the name has actually changed', async ({ page }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    const save = nameBlock(page).getByRole('button', { name: 'Enregistrer' });
    await expect(save).toBeDisabled();

    await nameField(page).fill('Chef H');
    await expect(save).toBeEnabled();

    // Back to empty, which is what was stored, so there is nothing to save again.
    await nameField(page).fill('');
    await expect(save).toBeDisabled();
  });

  test('the field stops at the length the server accepts', async ({ page }) => {
    await signedIn(page);
    await page.goto(PROFILE);

    // maxlength is a courtesy, not the check — but a field that let somebody type
    // a paragraph and then answered 400 would be a worse way to learn the limit.
    await expect(nameField(page)).toHaveAttribute('maxlength', '30');
    await nameField(page).fill('x'.repeat(40));
    await expect(nameField(page)).toHaveValue('x'.repeat(30));
  });

  test('is translated, label and all', async ({ page }) => {
    await signedIn(page);
    await page.goto('/en/profile');

    // The heading names the region and the hidden label names the field, so both
    // have to be translated — and `getByRole('region', ...)` resolving at all is
    // the assertion that the heading was.
    await expect(nameBlock(page)).toBeVisible();
    await expect(nameBlock(page).getByRole('textbox')).toHaveAttribute('placeholder', 'Hédi');
    await expect(nameBlock(page).getByRole('button', { name: 'Save' })).toBeVisible();
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

/** Which subject, tint and ink are currently selected, as three labels. */
async function selection(page: Page): Promise<string> {
  const groups = page.locator('[role="radiogroup"]');
  const subject = await groups.first().locator('[aria-checked="true"]').getAttribute('aria-label');
  const tint = await groups.nth(1).locator('[aria-checked="true"]').getAttribute('aria-label');
  const ink = await groups.nth(2).locator('[aria-checked="true"]').getAttribute('aria-label');
  return `${subject}/${tint}/${ink}`;
}
