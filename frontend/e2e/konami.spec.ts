import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/** The ground the logo sits on: `--color-bg` for the theme in force. */
const PAPER = '#f8f5f4';

async function enterCode(page: Page) {
  for (const key of CODE) await page.keyboard.press(key);
}

/**
 * Whether the shuffle is driving the logo.
 *
 * Deliberately not "are the colours different from the shipped ones". The
 * shuffle draws from a pool that contains Orange and Ink, so `A·I·A` — the
 * shipped reference — is one of the 216 sets it can legitimately return, and a
 * test comparing colours fails roughly one run in two hundred for a reason
 * that is not a defect. It cost two red runs here before it was written this
 * way. Locked removes these properties; unlocked sets them.
 */
const shuffleDriving = (page: Page) =>
  page.evaluate(
    () =>
      !!(document.querySelector('bah-brand-logo') as HTMLElement).style.getPropertyValue(
        '--logo-mark',
      ),
  );

/** The three block colours as the browser has actually resolved them. */
const inks = (page: Page) =>
  page.evaluate(() =>
    ['mark', 'upper', 'lower'].map(
      (block) =>
        getComputedStyle(document.querySelector(`bah-brand-logo g.${block}`) as SVGElement).fill,
    ),
  );

/** WCAG ratio, over whatever `rgb(...)` form getComputedStyle handed back. */
function ratio(cssColor: string, hex: string): number {
  const parse = (c: string) =>
    c.startsWith('#')
      ? [1, 3, 5].map((i) => parseInt(c.substr(i, 2), 16))
      : c.match(/\d+/g)!.slice(0, 3).map(Number);

  const lum = (rgb: number[]) => {
    const v = rgb.map((n) => {
      const s = n / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };

  const [a, b] = [lum(parse(cssColor)), lum(parse(hex))].sort((m, n) => n - m);
  return (a + 0.05) / (b + 0.05);
}

test.describe('the Konami code', () => {
  test('the logo is the chosen reference until the code is entered', async ({ page }) => {
    await page.goto('/fr');
    // A·I·A on Paper: orange pot, ink wordmark, orange HÉDI.
    expect(await inks(page)).toEqual(['rgb(232, 126, 19)', 'rgb(30, 26, 27)', 'rgb(232, 126, 19)']);
    expect(await shuffleDriving(page)).toBe(false);
  });

  test('entering it hands the logo to the shuffle', async ({ page }) => {
    await page.goto('/fr');
    await enterCode(page);
    await expect.poll(() => shuffleDriving(page)).toBe(true);
  });

  test('every unlocked colour stays legible on the ground it sits on', async ({ page }) => {
    // The one property the feature must not break, and the reason the contrast
    // floor is in the palette rather than in the component. Ten re-rolls: the
    // shuffle is random, so one sample would pass against an implementation
    // that is wrong nine times in ten.
    await page.goto('/fr');
    await enterCode(page);
    await expect.poll(() => shuffleDriving(page)).toBe(true);

    for (let roll = 0; roll < 10; roll++) {
      await page.locator('bah-brand-logo').click();
      await page.waitForURL(/\/fr$/);
      for (const ink of await inks(page)) {
        expect(ratio(ink, PAPER), `${ink} on paper`).toBeGreaterThanOrEqual(1.6);
      }
    }
  });

  test('the unlock survives a reload, and re-rolls on each one', async ({ page }) => {
    await page.goto('/fr');
    await enterCode(page);
    await expect.poll(() => shuffleDriving(page)).toBe(true);

    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await page.reload();
      // Still unlocked after a reload: this is what the stored flag buys, and
      // "a new set each time we refresh" needs it to survive at all.
      await expect.poll(() => shuffleDriving(page)).toBe(true);
      seen.add((await inks(page)).join());
    }

    // Ten reloads landing on one set would mean the roll happens at unlock
    // rather than at startup. Two identical rolls are ordinary; ten are not.
    expect(seen.size).toBeGreaterThan(1);
  });

  test('the code does not fire while typing in a field', async ({ page }) => {
    // "ba" is two letters of ordinary French and the arrows move a caret, so a
    // sequence that completed inside the search box would recolour the header
    // for anyone who typed the wrong thing.
    await page.goto('/fr');
    const search = page.getByRole('searchbox');
    await search.click();
    await enterCode(page);

    expect(await shuffleDriving(page)).toBe(false);
    expect(await inks(page)).toEqual(['rgb(232, 126, 19)', 'rgb(30, 26, 27)', 'rgb(232, 126, 19)']);
  });

  test('a false start still unlocks it', async ({ page }) => {
    // Somebody hunting for this presses up a few times before starting
    // properly. The rolling window handles it; the progress counter it
    // replaced did not, and that was found by a unit test rather than here.
    await page.goto('/fr');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
    await enterCode(page);

    await expect.poll(() => shuffleDriving(page)).toBe(true);
  });
});
