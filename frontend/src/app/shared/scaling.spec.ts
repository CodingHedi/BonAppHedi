import { describe, expect, it } from 'vitest';
import { MAX_SERVINGS, MIN_SERVINGS, clampServings, scaleQuantity } from './scaling';

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

const at = (servings: number) =>
  BABKA.map((i) => scaleQuantity(i.base, 2, servings, i.unit)).join(' / ');

describe('scaleQuantity', () => {
  it('reproduces the seed recipe at its base serving count', () => {
    expect(at(2)).toBe('250 / 100 / 60 / 7 / 2 / 40 / 80');
  });

  it('scales the whole recipe to 3 servings', () => {
    // The acceptance figure from the implementation plan.
    expect(at(3)).toBe('375 / 150 / 90 / 10.5 / 3 / 60 / 120');
  });

  it('halves cleanly to 1 serving', () => {
    expect(at(1)).toBe('125 / 50 / 30 / 3.5 / 1 / 20 / 40');
  });

  it('holds up at the maximum', () => {
    expect(at(12)).toBe('1500 / 600 / 360 / 42 / 12 / 240 / 480');
  });

  it('never shows a fractional count for countable units', () => {
    // 2 eggs at 3 servings is 3, at 5 servings is 5 — but at 7 it is 7, and the
    // odd multiples are where a naive implementation leaks ".5 eggs".
    for (let servings = MIN_SERVINGS; servings <= MAX_SERVINGS; servings++) {
      expect(scaleQuantity(2, 2, servings, 'pc')).not.toContain('.');
    }
    // 1 egg for 2 servings at 3 servings is 1.5 → must round, not truncate.
    expect(scaleQuantity(1, 2, 3, 'pc')).toBe('2');
  });

  it('drops a trailing .0 rather than printing it', () => {
    expect(scaleQuantity(250, 2, 3, 'g')).toBe('375');
    expect(scaleQuantity(250, 2, 3, 'g')).not.toBe('375.0');
  });

  it('keeps one decimal when the value genuinely has one', () => {
    expect(scaleQuantity(7, 2, 3, 'g')).toBe('10.5');
    expect(scaleQuantity(7, 2, 1, 'g')).toBe('3.5');
  });

  it('leaves non-scalable ingredients at their base amount', () => {
    // "A pinch of salt" does not become twelve pinches.
    expect(scaleQuantity(1, 2, 12, 'pinch', false)).toBe('1');
  });

  it('returns null when there is no measurable quantity', () => {
    // e.g. "Salt and pepper, to taste" — the caller renders the note instead.
    expect(scaleQuantity(null, 2, 4, '')).toBeNull();
  });

  it('does not emit Infinity if a recipe has a zero base serving count', () => {
    expect(scaleQuantity(100, 0, 4, 'g')).toBe('400');
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
