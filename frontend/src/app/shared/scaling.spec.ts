import { describe, expect, it } from 'vitest';
import { MAX_SERVINGS, MIN_SERVINGS, clampServings, scaleMeasure } from './scaling';

/** The babka, as seeded: quantities expressed for 2 servings. */
const BABKA = [
  { name: 'Farine', base: 250, unit: 'g' },
  { name: 'Chocolat noir', base: 100, unit: 'g' },
  { name: 'Beurre', base: 60, unit: 'g' },
  { name: 'Levure fraîche', base: 7, unit: 'g' },
  { name: 'Œufs', base: 2, unit: 'pc' },
  { name: 'Sucre', base: 40, unit: 'g' },
  { name: 'Lait tiède', base: 80, unit: 'ml' },
] as const;

/** Renders as the panel does, so the assertions read like the page. */
const show = (m: ReturnType<typeof scaleMeasure>) => (m ? `${m.value} ${m.unit}` : null);

const at = (servings: number) =>
  BABKA.map((i) => show(scaleMeasure(i.base, 2, servings, i.unit))).join(' / ');

describe('scaleMeasure', () => {
  it('reproduces the seed recipe at its base serving count', () => {
    expect(at(2)).toBe('250 g / 100 g / 60 g / 7 g / 2 pc / 40 g / 80 ml');
  });

  it('scales the whole recipe to 3 servings', () => {
    // The acceptance figure from the implementation plan.
    expect(at(3)).toBe('375 g / 150 g / 90 g / 10.5 g / 3 pc / 60 g / 120 ml');
  });

  it('halves cleanly to 1 serving', () => {
    expect(at(1)).toBe('125 g / 50 g / 30 g / 3.5 g / 1 pc / 20 g / 40 ml');
  });

  it('holds up at the maximum', () => {
    // The flour crosses a kilogram here, which is the whole reason the unit is
    // returned rather than assumed.
    expect(at(12)).toBe('1.5 kg / 600 g / 360 g / 42 g / 12 pc / 240 g / 480 ml');
  });

  it('never shows a fractional count for countable units', () => {
    // 2 eggs at 3 servings is 3, at 5 servings is 5 — but at 7 it is 7, and the
    // odd multiples are where a naive implementation leaks ".5 eggs".
    for (let servings = MIN_SERVINGS; servings <= MAX_SERVINGS; servings++) {
      expect(scaleMeasure(2, 2, servings, 'pc')?.value).not.toContain('.');
    }
    // 1 egg for 2 servings at 3 servings is 1.5 → must round, not truncate.
    expect(scaleMeasure(1, 2, 3, 'pc')?.value).toBe('2');
  });

  it('drops a trailing .0 rather than printing it', () => {
    expect(scaleMeasure(250, 2, 3, 'g')?.value).toBe('375');
    expect(scaleMeasure(250, 2, 3, 'g')?.value).not.toBe('375.0');
  });

  it('keeps one decimal when the value genuinely has one', () => {
    expect(scaleMeasure(7, 2, 3, 'g')?.value).toBe('10.5');
    expect(scaleMeasure(7, 2, 1, 'g')?.value).toBe('3.5');
  });

  it('leaves non-scalable ingredients at their base amount', () => {
    // "A pinch of salt" does not become twelve pinches.
    expect(show(scaleMeasure(1, 2, 12, 'pinch', false))).toBe('1 pinch');
  });

  it('returns null when there is no measurable quantity', () => {
    // e.g. "Salt and pepper, to taste" — the caller renders the note instead.
    expect(scaleMeasure(null, 2, 4, '')).toBeNull();
  });

  it('does not emit Infinity if a recipe has a zero base serving count', () => {
    expect(show(scaleMeasure(100, 0, 4, 'g'))).toBe('400 g');
  });
});

describe('scaleMeasure across a metric boundary', () => {
  it('reads a kilogram as a kilogram', () => {
    // Exactly at the boundary: "1000 g" is a quantity nobody writes down.
    expect(show(scaleMeasure(1000, 1, 1, 'g'))).toBe('1 kg');
    expect(show(scaleMeasure(1500, 1, 1, 'g'))).toBe('1.5 kg');
    expect(show(scaleMeasure(2000, 1, 1, 'g'))).toBe('2 kg');
  });

  it('reads a litre as a litre', () => {
    expect(show(scaleMeasure(1000, 1, 1, 'ml'))).toBe('1 l');
    expect(show(scaleMeasure(1500, 1, 1, 'ml'))).toBe('1.5 l');
  });

  it('stays in the small unit right up to the boundary', () => {
    expect(show(scaleMeasure(999, 1, 1, 'g'))).toBe('999 g');
    expect(show(scaleMeasure(999.5, 1, 1, 'g'))).toBe('999.5 g');
    expect(show(scaleMeasure(999, 1, 1, 'ml'))).toBe('999 ml');
  });

  it('keeps two decimals when the conversion needs them', () => {
    // 1.2 kg would quietly lose 34 g of flour, which a baker would notice.
    expect(show(scaleMeasure(1234, 1, 1, 'g'))).toBe('1.23 kg');
    expect(show(scaleMeasure(1050, 1, 1, 'g'))).toBe('1.05 kg');
    // ...but never pads to two.
    expect(show(scaleMeasure(1100, 1, 1, 'g'))).toBe('1.1 kg');
  });

  it('converts only the units that have a bigger sibling', () => {
    // No rule was asked for on these, and inventing one would change amounts
    // nobody complained about.
    expect(show(scaleMeasure(1500, 1, 1, 'cl'))).toBe('1500 cl');
    expect(show(scaleMeasure(1500, 1, 1, 'tbsp'))).toBe('1500 tbsp');
    expect(show(scaleMeasure(1500, 1, 1, 'pc'))).toBe('1500 pc');
  });

  it('converts a unit the editor typed in the wrong case', () => {
    // The unit field is free text, so 'G' and 'mL' both reach this function.
    expect(show(scaleMeasure(1500, 1, 1, 'G'))).toBe('1.5 kg');
    expect(show(scaleMeasure(1500, 1, 1, 'mL'))).toBe('1.5 l');
  });

  it('converts a non-scalable ingredient too', () => {
    // Its amount is fixed, but 1500 g is still 1.5 kg on the page.
    expect(show(scaleMeasure(1500, 2, 12, 'g', false))).toBe('1.5 kg');
  });

  it('crosses the boundary only once the stepper gets there', () => {
    // The babka's flour: grams at 7 servings, kilograms at 8.
    expect(show(scaleMeasure(250, 2, 7, 'g'))).toBe('875 g');
    expect(show(scaleMeasure(250, 2, 8, 'g'))).toBe('1 kg');
  });
});

describe('clampServings', () => {
  it('holds the range the stepper allows', () => {
    expect(clampServings(0)).toBe(MIN_SERVINGS);
    expect(clampServings(-5)).toBe(MIN_SERVINGS);
    expect(clampServings(13)).toBe(MAX_SERVINGS);
    expect(clampServings(999)).toBe(MAX_SERVINGS);
    expect(clampServings(6)).toBe(6);
  });

  it('truncates fractions and survives NaN', () => {
    expect(clampServings(3.7)).toBe(3);
    expect(clampServings(Number.NaN)).toBe(MIN_SERVINGS);
  });
});
