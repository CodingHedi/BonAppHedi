import { expect, test } from './fixtures';
import { stubYouTubeApi, youtubeCalls } from './youtube-stub';

const BABKA = '/fr/recettes/babka-au-chocolat';

/** Hosts that would mean a third party learned the visitor's IP. */
const GOOGLE_HOSTS = /youtube\.com|youtube-nocookie\.com|ytimg\.com|google\.com|gstatic\.com|doubleclick/i;

test.describe('recipe detail', () => {
  test('renders the recipe', async ({ page }) => {
    await page.goto(BABKA);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Babka au chocolat');
    await expect(page.getByText('4.0 / 5')).toBeVisible();
    await expect(page.getByText('Par Hédi')).toBeVisible();
    await expect(page.locator('bah-step-list li')).toHaveCount(5);
    await expect(page.locator('bah-ingredient-panel li')).toHaveCount(7);
  });

  test('rendered markdown is actually styled, not just present', async ({ page }) => {
    // Measured, because this is the failure mode this suite is worst at. The
    // markdown component injects its HTML with [innerHTML], so Angular's
    // emulated encapsulation never stamps those elements — and every `.prose *`
    // rule, which lived in that component, compiled to a selector matching
    // nothing. Blockquotes had no bar, headings were browser-default sizes,
    // inline code had no background. Every existing assertion about markdown
    // checks that an element exists, and all of them passed throughout.
    await page.goto(BABKA);

    const body = page.locator('bah-markdown .prose').first();
    await expect(body.locator('p').first()).toBeVisible();

    // The last block of prose carries no trailing margin, which is a rule only
    // this stylesheet has — the browser default is 1em, so an unstyled
    // paragraph reads as a number rather than as zero. Asserted on the last
    // child because that is the one rule whose correct value cannot be reached
    // by accident.
    const trailing = await body
      .locator('p')
      .last()
      .evaluate((node) => getComputedStyle(node).marginBottom);

    expect(trailing, 'prose is falling back to browser default spacing').toBe('0px');
  });

  test('quick facts show prep, cook and difficulty', async ({ page }) => {
    await page.goto(BABKA);

    const facts = page.locator('bah-quick-facts');
    await expect(facts).toContainText('15 min');
    await expect(facts).toContainText('45 min');
    // Dots are a graphic; the level must be readable as words.
    await expect(facts.getByLabel('Difficulté : facile')).toBeVisible();
  });

  test.describe('servings scaler', () => {
    const amounts = (page: import('@playwright/test').Page) =>
      page.locator('bah-ingredient-panel .amount').allInnerTexts();

    test('starts at the recipe base and scales every quantity', async ({ page }) => {
      await page.goto(BABKA);
      await expect(page.locator('bah-ingredient-panel output')).toHaveText('2');
      expect(await amounts(page)).toEqual([
        '250 g',
        '100 g',
        '60 g',
        '7 g',
        '2 pc',
        '40 g',
        '80 ml',
      ]);

      await page.getByRole('button', { name: 'Augmenter le nombre de portions' }).click();
      await expect(page.locator('bah-ingredient-panel output')).toHaveText('3');
      expect(await amounts(page)).toEqual([
        '375 g',
        '150 g',
        '90 g',
        '10.5 g',
        '3 pc',
        '60 g',
        '120 ml',
      ]);
    });

    test('eggs never show a fraction at any serving count', async ({ page }) => {
      await page.goto(BABKA);
      const increase = page.getByRole('button', { name: 'Augmenter le nombre de portions' });

      for (let i = 0; i < 10; i++) {
        await increase.click();
        const eggs = await page.locator('bah-ingredient-panel .amount').nth(4).innerText();
        expect(eggs, 'egg count must stay whole').not.toContain('.');
      }
    });

    test('clamps at both ends and disables the buttons there', async ({ page }) => {
      await page.goto(BABKA);
      const decrease = page.getByRole('button', { name: 'Diminuer le nombre de portions' });
      const increase = page.getByRole('button', { name: 'Augmenter le nombre de portions' });
      const output = page.locator('bah-ingredient-panel output');

      await decrease.click();
      await expect(output).toHaveText('1');
      await expect(decrease).toBeDisabled();

      // Exactly 1 → 12. Clicking past the limit would hang on a disabled
      // button rather than being harmlessly ignored.
      for (let i = 0; i < 11; i++) await increase.click();
      await expect(output).toHaveText('12');
      await expect(increase).toBeDisabled();
    });
  });

  test.describe('video facade', () => {
    test('contacts no Google domain until the visitor presses play', async ({ page }) => {
      // The entire justification for the click-to-load facade: reading a recipe
      // must not disclose the visitor's IP to Google, which is also what keeps
      // the site clear of a cookie-consent obligation.
      //
      // Deliberately runs against the real network with no stub: it asserts
      // what genuinely leaves the browser.
      const thirdParty: string[] = [];
      page.on('request', (request) => {
        if (GOOGLE_HOSTS.test(request.url())) thirdParty.push(request.url());
      });

      await page.goto(BABKA, { waitUntil: 'networkidle' });
      expect(thirdParty, 'no third-party request before the play click').toEqual([]);

      // The poster must be ours. The component's own placeholder would have
      // fetched a thumbnail from i.ytimg.com, which is why it is disabled.
      await expect(page.locator('bah-recipe-media bah-image')).toBeVisible();
      await expect(page.locator('bah-recipe-media iframe')).toHaveCount(0);

      await page.getByRole('button', { name: 'Lire la vidéo' }).click();

      // The request being *attempted* is the proof the facade released; whether
      // Google answers is not this project's concern.
      await expect
        .poll(() => thirdParty.length, { message: 'play must load the YouTube API' })
        .toBeGreaterThan(0);
    });

    test('embeds against the nocookie host and never plain youtube.com', async ({ page }) => {
      await stubYouTubeApi(page);
      await page.goto(BABKA);
      await page.getByRole('button', { name: 'Lire la vidéo' }).click();

      await expect.poll(async () => (await youtubeCalls(page)).length).toBeGreaterThan(0);
      const construct = (await youtubeCalls(page)).find((call) => call.type === 'construct');
      expect(construct?.options?.host).toBe('https://www.youtube-nocookie.com');
      expect(construct?.options?.videoId).toBe('YE7VzlLtp-4');
    });

    test('the player fills the media box instead of a letterboxed strip', async ({ page }) => {
      // The player injects its iframe into a wrapper div it owns, which has no
      // height of its own. A plain height:100% on the iframe therefore resolves
      // against auto and collapses it to the 150px iframe default — the video
      // played as a strip across the middle of an otherwise empty 16/9 box.
      await stubYouTubeApi(page);
      await page.goto(BABKA);
      await page.getByRole('button', { name: 'Lire la vidéo' }).click();

      const frame = page.locator('bah-recipe-media iframe');
      await expect(frame).toBeVisible();

      const media = await page.locator('bah-recipe-media .media').boundingBox();
      const played = await frame.boundingBox();
      expect(played?.width).toBeCloseTo(media!.width, 0);
      expect(played?.height).toBeCloseTo(media!.height, 0);
    });

    test('a step timestamp loads the player positioned at that moment', async ({ page }) => {
      await stubYouTubeApi(page);
      await page.goto(BABKA);
      expect(await youtubeCalls(page)).toEqual([]);

      // Step 3 is at 02:14 = 134s. From a cold page this must both load the
      // player and position it — starting from zero would mean the visitor has
      // to seek manually, defeating the point of the link.
      await page.getByRole('button', { name: /02:14/ }).click();

      await expect
        .poll(async () => (await youtubeCalls(page)).some((c) => c.type === 'cueVideoById'))
        .toBe(true);

      const cue = (await youtubeCalls(page)).find((call) => call.type === 'cueVideoById');
      expect(cue?.options?.startSeconds).toBe(134);
    });

    test('seeking an already-playing video does not reload it', async ({ page }) => {
      await stubYouTubeApi(page);
      await page.goto(BABKA);

      await page.getByRole('button', { name: 'Lire la vidéo' }).click();
      await expect.poll(async () => (await youtubeCalls(page)).length).toBeGreaterThan(0);

      await page.getByRole('button', { name: /02:14/ }).click();

      await expect.poll(async () => (await youtubeCalls(page)).some((c) => c.type === 'seekTo')).toBe(
        true,
      );
      const constructs = (await youtubeCalls(page)).filter((c) => c.type === 'construct');
      expect(constructs, 'the player must be built once, then seeked').toHaveLength(1);
      expect((await youtubeCalls(page)).find((c) => c.type === 'seekTo')?.seconds).toBe(134);
    });

    test('recipes without a video show neither badge nor timestamps', async ({ page }) => {
      await page.goto('/fr/recettes/cheesecake-basque');

      await expect(page.getByRole('button', { name: 'Lire la vidéo' })).toHaveCount(0);
      await expect(page.locator('bah-step-list .timestamp')).toHaveCount(0);
      // The photo still renders; only the video affordances are absent.
      await expect(page.locator('bah-recipe-media bah-image')).toBeVisible();
    });
  });

  test('English detail page resolves by its own slug', async ({ page }) => {
    await page.goto('/en/recipes/chocolate-babka');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chocolate babka');
    await expect(page.locator('bah-ingredient-panel')).toContainText('Flour');
    // Unit labels are localized even though the unit key is not.
    await expect(page.locator('bah-ingredient-panel .amount').nth(4)).toHaveText('2 pcs');
  });

  test('non-scalable ingredients keep their amount', async ({ page }) => {
    // Shakshuka's salt and pepper have no quantity at all and must not gain one.
    await page.goto('/fr/recettes/chakchouka');
    const panel = page.locator('bah-ingredient-panel');
    await expect(panel).toContainText('Sel et poivre');
    await expect(panel).toContainText('au goût');
  });

  test('an unknown slug offers a way back rather than an error', async ({ page }) => {
    await page.goto('/fr/recettes/nexiste-pas');
    await expect(page.getByText('Cette recette est introuvable.')).toBeVisible();
  });

  test('breadcrumb returns to the list in the right locale', async ({ page }) => {
    await page.goto('/en/recipes/chocolate-babka');
    await page.locator('.breadcrumb a').click();
    await expect(page).toHaveURL(/\/en$/);
  });
});
