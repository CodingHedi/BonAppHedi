import { expect, test } from './fixtures';
// The type only — the `test` runtime always comes from the fixture.
import type { Page } from '@playwright/test';

/** Opens the tag dropdown, unless it is already open. */
async function openTags(page: Page) {
  const trigger = page.getByRole('button', { name: 'Trier par tags' });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

/** Ticks or unticks one tag, opening the dropdown first if it is shut. */
async function toggleTag(page: Page, label: string) {
  await openTags(page);
  await page.getByRole('checkbox', { name: label }).click();
}

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
    await toggleTag(page, 'dessert');
    await expect(page.getByRole('checkbox', { name: 'dessert' })).toBeChecked();
    await expect(page.locator('bah-recipe-card')).toHaveCount(2);

    // A second tag narrows further rather than adding to the results: picking
    // two filters asks for both, and a filter that grows the grid reads as
    // broken.
    await toggleTag(page, 'chocolat');
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);
    // Scoped to the grid: the carousel carries the same title above it.
    await expect(page.locator('bah-recipe-card h3')).toHaveText('Babka au chocolat');
  });

  test('the trigger counts what is on, so a shut list still says so', async ({ page }) => {
    // The one thing a dropdown costs over chips is that the active tags are
    // invisible while it is closed. The count is what buys that back.
    const trigger = page.getByRole('button', { name: 'Trier par tags' });
    await expect(trigger).not.toContainText('1');

    await toggleTag(page, 'dessert');
    await page.keyboard.press('Escape');

    await expect(page.getByRole('checkbox', { name: 'dessert' })).toHaveCount(0);
    await expect(trigger).toContainText('1');
  });

  test('a tag is removed on its own, without rebuilding the query', async ({ page }) => {
    await toggleTag(page, 'dessert');
    await toggleTag(page, 'chocolat');
    await expect(page.locator('bah-recipe-card')).toHaveCount(1);

    // Unticking one lets go of that tag and keeps the rest.
    await toggleTag(page, 'chocolat');
    await expect(page.locator('bah-recipe-card')).toHaveCount(2);
    await expect(page.getByRole('checkbox', { name: 'dessert' })).toBeChecked();
  });

  test('the tag list closes on Escape and on a press outside it', async ({ page }) => {
    await openTags(page);
    await expect(page.getByRole('checkbox', { name: 'dessert' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('checkbox', { name: 'dessert' })).toHaveCount(0);
    // Escape has to hand focus back, or the next Tab starts from the top of the
    // document because the element it was on has gone.
    await expect(page.getByRole('button', { name: 'Trier par tags' })).toBeFocused();

    await openTags(page);
    await page.locator('h2').first().click();
    await expect(page.getByRole('checkbox', { name: 'dessert' })).toHaveCount(0);
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
    await toggleTag(page, 'dessert');
    await page.keyboard.press('Escape');
    await expect(clearAll).toBeVisible();

    await clearAll.click();
    await expect(page.getByRole('searchbox')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Trier par tags' })).not.toContainText('1');
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

  // The three specs that stood here covered the magnifier navigating to this
  // page and focusing its box, and went with that behaviour. The magnifier now
  // answers where it is pressed, and quick-search.spec.ts covers it.
  //
  // One of them was the flake recorded in Docs/backlog.md — it failed about
  // half the time on a view-transition abort raised by its own goBack(). It is
  // gone because the behaviour it guarded is gone, which is a better end than
  // either fix that entry proposed.

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
    //
    // The unit is deliberately not pinned, and this used to say `jours`. Seed
    // dates count back from SEED_NOW, a frozen instant, so the gap to real time
    // only grows: the babka is `daysAgo(4)` and read "il y a 4 jours" the week
    // the seed was written, "il y a 1 mois" five weeks later. Asserting the unit
    // is asserting how long ago somebody authored the seed, which is not what
    // this test is for — it went red on 2026-08-26 having caught nothing.
    //
    // timestamp.spec.ts reached the same conclusion first and says why in its
    // header: a literal here passes today and fails on a Tuesday for no reason.
    const stamp = page
      .locator('bah-recipe-card')
      .filter({ hasText: 'Babka au chocolat' })
      .locator('time');

    await expect(stamp).toHaveText(/^il y a \d+ \S+$/);

    // The other half of "from real timestamps": rendered beside a
    // machine-readable date, not beside a string somebody typed.
    await expect(stamp).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
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

  test('a card reserves its image box whether or not the photograph arrives', async ({ page }) => {
    // Why this is asserted on the box and not on a layout-shift number: a
    // photograph costing zero shift is the *consequence*, and it cannot be made
    // to fail here. Removing the reservation does not produce a shift, it
    // produces a card that is the wrong size from the first paint onwards - so
    // a CLS assertion stays green through exactly the regression it was written
    // for. Measured 2026-08-17 by breaking it on purpose; see
    // scripts/grid-perf.mjs, which found the page's shift identical at 6, 100
    // and 300 cards and never once attributed to an image.
    //
    // The mechanism is .media's fixed 190px, not anything image.ts does with
    // the stored width and height - it never reads them. So the box is asserted
    // directly: 190 regardless of what is inside it, which is what makes the
    // arrival of a photograph a non-event.
    //
    // Blocking the images to prove the point is what the fixture is for and
    // must not be worked around: an aborted request logs a console error, and
    // that is a genuine failure signal being borrowed for a convenience.
    // The photographs here have three different aspect ratios, so a box sized
    // by its image could not be 190 for all of them anyway.
    const cards = page.locator('bah-recipe-card');
    await expect(cards.first()).toBeVisible();

    const heights = await cards
      .locator('.media')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));

    // Five seeded published recipes, five identical boxes. Written out rather
    // than derived from `heights`, so an empty grid fails here instead of
    // satisfying the assertion with nothing in it.
    expect(heights).toEqual([190, 190, 190, 190, 190]);
  });
});

/** One shifted element, as `tagname.class` — what these two specs assert on. */
type Shifted = { element: string; value: number; at: number };

/**
 * Records every layout shift from before the first paint, naming what moved.
 *
 * Must be installed before `goto`, which is why these specs sit outside the
 * describe above and do their own navigation: its `beforeEach` has already
 * loaded the page by the time a test body runs.
 */
async function recordShifts(page: Page) {
  await page.addInitScript(() => {
    interface ShiftSource {
      node?: Node | null;
    }
    interface Shift extends PerformanceEntry {
      value: number;
      hadRecentInput: boolean;
      sources?: ShiftSource[];
    }

    const found: { element: string; value: number; at: number }[] = [];
    (window as unknown as { __shifts: typeof found }).__shifts = found;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Shift[]) {
        if (entry.hadRecentInput || entry.value <= 0.0001) continue;
        for (const source of entry.sources ?? []) {
          const node = source.node;
          if (!(node instanceof Element)) continue;
          const classes = node.className;
          const suffix =
            typeof classes === 'string' && classes
              ? `.${classes.trim().split(/\s+/).join('.')}`
              : '';
          found.push({
            element: `${node.tagName.toLowerCase()}${suffix}`,
            value: +entry.value.toFixed(4),
            at: Math.round(entry.startTime),
          });
        }
      }
      // buffered:true replays what happened before this observer existed, so
      // the entries from the frames that matter here are not missed.
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/**
 * Everything that moved, once the page has stopped moving.
 *
 * Settled rather than merely painted: both shifts guarded below happen while
 * the skeletons are on screen, so reading this before the real cards arrive
 * would come back empty with the page still in motion.
 */
async function shiftedElements(page: Page): Promise<Shifted[]> {
  await expect(page.locator('bah-recipe-card')).toHaveCount(5);
  return page.evaluate(() => (window as unknown as { __shifts: Shifted[] }).__shifts);
}

/**
 * Two shifts, both of which were the page's largest when they were found, and
 * both of the same kind: something stood in for something else at the wrong
 * size.
 *
 * These are CLS assertions, which the image-box spec above argues against - and
 * the distinction is the whole point. There, the shift was a *consequence* of a
 * reserved box, and removing the reservation produced no shift at all, so the
 * number could not fail for the reason it was written. Here the movement is the
 * defect, and both were confirmed to fail by undoing the fix.
 *
 * Attributed rather than totalled, deliberately. A bare CLS budget goes red for
 * whatever drifts near the threshold next and sends the reader to a comment
 * about something that is behaving perfectly.
 */
test.describe('loading the list', () => {
  test('the footer never moves', async ({ page }) => {
    // The shell paints before the lazy route chunk arrives, so <main> is empty
    // for a frame, the sticky footer sits at the bottom of the viewport, and the
    // skeleton then pushes it out of sight. 0.065 of the page's 0.083 when it
    // was found, identical at 6, 100 and 300 recipes. main.unrouted in app.ts is
    // what holds it; removing that binding measures 0.1124 here.
    await recordShifts(page);
    await page.goto('/fr');

    await expect(page.locator('bah-site-footer')).toBeAttached();
    const moved = await shiftedElements(page);

    expect(moved.filter((s) => s.element.startsWith('bah-site-footer'))).toEqual([]);
  });

  test('the hero skeleton is exactly as tall as the carousel that replaces it', async ({
    page,
  }) => {
    // .hero-skeleton used a margin where bah-hero-carousel uses padding, so its
    // 8px bottom collapsed into .filters' 56px top and the skeleton stood 8px
    // shorter than what replaced it. Everything below the hero dropped by that
    // on every load - the whole of the page's remaining 0.0174 once the footer
    // was dealt with.
    //
    // Asserted as two heights and not as a shift, which is the opposite choice
    // to the footer above and for a reason worth writing down: it was tried the
    // other way first and the guard was useless. Here the movement is only
    // 0.0008 at this viewport against an optimised build's 0.0174, small enough
    // that whether the layout-shift API reports it at all depends on where the
    // mock's random 120-320ms latency happens to land. It passed with the defect
    // deliberately reinstated, twice. A guard that is usually green on a broken
    // page is worse than no guard, so this asserts the geometry that causes the
    // shift rather than the shift itself - exactly the argument the image-box
    // spec above makes.
    await page.goto('/fr');

    // The skeleton is on screen for at least the mock's minimum latency, which
    // is comfortably longer than this takes to resolve.
    const skeleton = await page
      .locator('.hero-skeleton')
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));

    await expect(page.locator('bah-hero-carousel')).toBeVisible();
    const carousel = await page
      .locator('bah-hero-carousel')
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));

    expect(skeleton).toBe(carousel);
  });
});
