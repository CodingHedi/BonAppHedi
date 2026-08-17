import { describe, expect, it } from 'vitest';
import {
  BRAND_INKS,
  GROUNDS,
  KONAMI,
  MIN_RATIO,
  contrastRatio,
  defaultSet,
  isKonami,
  legibleInks,
  pushKey,
  shuffleSet,
} from './logo-palette';
import type { ResolvedTheme } from '../theme/theme.service';

const THEMES: ResolvedTheme[] = ['light', 'dark'];

/** Lehmer generator: varies like Math.random, repeats exactly like a fixture. */
const seeded = (start: number) => {
  let state = start;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
};

describe('contrastRatio', () => {
  it('agrees with the WCAG anchors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('does not care which way round the pair is given', () => {
    expect(contrastRatio('#1e1a1b', '#f8f5f4')).toBeCloseTo(
      contrastRatio('#f8f5f4', '#1e1a1b'),
      10,
    );
  });
});

describe('legibleInks', () => {
  it('excludes an ink that would vanish into the ground', () => {
    // Cream on Paper is 1.05:1. This is the pairing the floor exists for, and
    // the reason the shuffle draws from the whole palette rather than from one
    // theme's own ramp — where nothing would ever be excluded and the rule
    // would be decoration.
    expect(contrastRatio('#efe6d6', GROUNDS.light.hex)).toBeLessThan(MIN_RATIO);
    expect(legibleInks('light').map((i) => i.code)).not.toContain('C');
  });

  it('excludes the mirror of that on the dark ground', () => {
    expect(contrastRatio('#1e1a1b', GROUNDS.dark.hex)).toBeLessThan(MIN_RATIO);
    expect(legibleInks('dark').map((i) => i.code)).not.toContain('I');
  });

  it('keeps Orange on both grounds, which is what makes it the brand ink', () => {
    expect(legibleInks('light').map((i) => i.code)).toContain('A');
    expect(legibleInks('dark').map((i) => i.code)).toContain('A');
  });

  it('leaves enough of a pool for a shuffle to be worth doing', () => {
    // Two inks would give eight sets and read as a toggle rather than a
    // surprise. If a future palette change drops the pool below three, this is
    // the test that should be argued with rather than deleted.
    for (const theme of THEMES) expect(legibleInks(theme).length).toBeGreaterThanOrEqual(3);
  });
});

describe('shuffleSet', () => {
  it('never returns a block that fails the floor, for any seed', () => {
    // Exhaustive rather than sampled: the pick index is `random() * pool.length`
    // floored, so stepping the seed across [0, 1) in fine increments visits
    // every branch the function has. This is the property the whole feature
    // rests on — an easter egg is not an excuse for an unreadable header.
    for (const theme of THEMES) {
      const ground = GROUNDS[theme].hex;
      for (let seed = 0; seed < 1; seed += 0.001) {
        const set = shuffleSet(theme, () => seed);
        for (const hex of [set.mark, set.upper, set.lower]) {
          expect(contrastRatio(hex, ground)).toBeGreaterThanOrEqual(MIN_RATIO);
        }
      }
    }
  });

  it('draws only from the declared palette', () => {
    const known = new Set(BRAND_INKS.map((i) => i.hex));
    for (const theme of THEMES) {
      for (let seed = 0; seed < 1; seed += 0.017) {
        const set = shuffleSet(theme, () => seed);
        for (const hex of [set.mark, set.upper, set.lower]) expect(known).toContain(hex);
      }
    }
  });

  it('does not hand back the set it was told to avoid', () => {
    // A *varying* generator, seeded so the test is still deterministic. A
    // constant one cannot produce a different set at all, which is the case the
    // next test pins down — asserting both of a constant seed would be
    // asserting a contradiction.
    const random = seeded(7);
    const previous = shuffleSet('light', random);
    expect(shuffleSet('light', random, previous)).not.toEqual(previous);
  });

  it('terminates even when the randomness is degenerate', () => {
    // A generator that always returns the same value cannot produce a different
    // set, so the bounded loop has to give up and return a repeat rather than
    // spin. Nothing else in this file guards the header against a hang.
    const previous = shuffleSet('dark', () => 0.5);
    expect(() => shuffleSet('dark', () => 0.5, previous)).not.toThrow();
    expect(shuffleSet('dark', () => 0.5, previous)).toEqual(previous);
  });

  it('a seed of exactly 1 does not fall off the end of the pool', () => {
    // Math.random never returns 1, but a test double can, and an undefined here
    // would reach the DOM as the string "undefined".
    for (const theme of THEMES) {
      const set = shuffleSet(theme, () => 1);
      for (const hex of [set.mark, set.upper, set.lower]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('defaultSet', () => {
  it('is the reference each theme was chosen as', () => {
    // A·I·A on Paper, A·C·A on Umber. If these two ever disagree with
    // brand-logo.ts, the shipped logo and the one the shuffle returns to are
    // different logos.
    expect(defaultSet('light')).toEqual({
      mark: '#e87e13',
      upper: '#1e1a1b',
      lower: '#e87e13',
    });
    expect(defaultSet('dark')).toEqual({
      mark: '#e87e13',
      upper: '#efe6d6',
      lower: '#e87e13',
    });
  });
});

describe('the Konami window', () => {
  const type = (keys: readonly string[]) => keys.reduce<string[]>((w, k) => pushKey(w, k), []);
  const unlocks = (keys: readonly string[]) => isKonami(type(keys));

  it('completes on the sequence', () => {
    expect(unlocks(KONAMI)).toBe(true);
  });

  it('unlocks with caps lock on', () => {
    expect(unlocks([...KONAMI.slice(0, 8), 'B', 'A'])).toBe(true);
  });

  it('tolerates a false start, which is the case that actually happens', () => {
    // Three ups, not two. This is the case that failed under the progress
    // counter this window replaced: somebody hunting for an easter egg presses
    // up a few times before starting properly.
    expect(unlocks(['ArrowUp', ...KONAMI])).toBe(true);
    expect(unlocks(['ArrowUp', 'ArrowUp', 'ArrowUp', ...KONAMI])).toBe(true);
  });

  it('ignores whatever was typed before the code', () => {
    expect(unlocks(['x', 'Enter', 'ArrowDown', 'q', ...KONAMI])).toBe(true);
  });

  it('does not unlock on a wrong key inside the sequence', () => {
    expect(unlocks(['ArrowUp', 'ArrowUp', 'x', 'ArrowDown', 'ArrowLeft'])).toBe(false);
  });

  it('does not complete on a prefix', () => {
    expect(unlocks(KONAMI.slice(0, -1))).toBe(false);
  });

  it('never grows without bound', () => {
    // It is attached to every keystroke on the site, so it must not become a
    // transcript of the visit.
    const window = type(Array.from({ length: 500 }, () => 'ArrowUp'));
    expect(window.length).toBe(KONAMI.length);
  });
});
