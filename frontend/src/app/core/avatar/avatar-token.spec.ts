import { describe, expect, it, vi } from 'vitest';
import {
  AVATAR_ICONS,
  AVATAR_INKS,
  AVATAR_TINTS,
  AVATAR_TINT_HUES,
  formatAvatar,
  parseAvatar,
  randomAvatar,
} from './avatar-token';

/**
 * The token is what reaches the database, so these tests are mostly about the
 * boundary rather than the happy path: a value written by a later build, or by
 * hand, must render the placeholder instead of breaking a comment thread.
 */

const COMBINATIONS = AVATAR_ICONS.length * AVATAR_TINTS * AVATAR_INKS.length;

describe('parseAvatar', () => {
  it('round-trips what formatAvatar writes, for every combination offered', () => {
    // Exhaustive on purpose — it is 504 cases, and it is the only assertion that
    // the picker cannot offer a choice the parser then rejects.
    for (const icon of AVATAR_ICONS) {
      for (let tint = 0; tint < AVATAR_TINTS; tint++) {
        for (const ink of AVATAR_INKS) {
          expect(parseAvatar(formatAvatar({ icon, tint, ink }))).toEqual({ icon, tint, ink });
        }
      }
    }
  });

  it('reads a well-formed token', () => {
    expect(parseAvatar('carrot/3')).toEqual({ icon: 'carrot', tint: 3, ink: null });
    expect(parseAvatar('carrot/3/5')).toEqual({ icon: 'carrot', tint: 3, ink: 5 });
  });

  it('treats a two-segment token as the neutral ink, not as a token to migrate', () => {
    // Every avatar chosen before the ink existed is spelled this way, and the
    // whole compatibility story is this one line: it parses, and it renders the
    // accent it always did.
    expect(parseAvatar('bread/3')?.ink).toBeNull();
    expect(formatAvatar({ icon: 'bread', tint: 3, ink: null })).toBe('bread/3');
  });

  it('treats absent and empty as no choice made', () => {
    expect(parseAvatar(null)).toBeNull();
    expect(parseAvatar(undefined)).toBeNull();
    expect(parseAvatar('')).toBeNull();
  });

  it.each([
    ['an icon this build does not know', 'pineapple/2'],
    ['a tint past the end of the ramp', 'carrot/6'],
    ['no tint at all', 'carrot'],
    ['an empty tint', 'carrot/'],
    ['a non-numeric ink', 'carrot/2/x'],
    ['an empty ink', 'carrot/2/'],
    ['an ink past the end of the ramp', 'carrot/2/6'],
    ['a fourth segment', 'carrot/2/3/4'],
    ['a negative tint', 'carrot/-1'],
    ['a non-numeric tint', 'carrot/x'],
    ['a URL, which is what this replaced', 'https://lh3.googleusercontent.com/a/x'],
  ])('rejects %s', (_why, token) => {
    expect(parseAvatar(token)).toBeNull();
  });

  it('rejects spellings of a valid slot that the picker never writes', () => {
    // `Number(' 1')` is 1 and `Number('1e0')` is 1, so a lenient parser accepts
    // rows that come back out differently than they went in.
    expect(parseAvatar('carrot/ 1')).toBeNull();
    expect(parseAvatar('carrot/1e0')).toBeNull();
    expect(parseAvatar('carrot/01')).toBeNull();
    expect(parseAvatar('carrot/1/01')).toBeNull();
    expect(parseAvatar('carrot/1/ 1')).toBeNull();
  });
});

describe('the tint ramp', () => {
  it('has a hue for every slot a token may carry', () => {
    // The component indexes AVATAR_TINT_HUES with the parsed tint, so a ramp
    // shorter than AVATAR_TINTS would render `undefined` as a hue and produce a
    // grey disc rather than a tinted one.
    expect(AVATAR_TINT_HUES).toHaveLength(AVATAR_TINTS);
  });

  it('offers the neutral ink and one slot per hue, and nothing else', () => {
    // The component indexes the same ramp with the ink slot, so an ink ramp
    // longer than the tint one would render `undefined` as a hue — an icon in
    // `hsl(undefined 48% 26%)`, which is no colour at all.
    expect(AVATAR_INKS[0]).toBeNull();
    expect(AVATAR_INKS).toHaveLength(AVATAR_TINTS + 1);
    expect(AVATAR_INKS.filter((ink) => ink !== null)).toEqual([...AVATAR_TINT_HUES.keys()]);
  });
});

describe('randomAvatar', () => {
  it('returns something the parser accepts', () => {
    for (let i = 0; i < 50; i++) {
      const rolled = randomAvatar();
      expect(parseAvatar(formatAvatar(rolled))).toEqual(rolled);
    }
  });

  it('never returns the avatar it was told to avoid', () => {
    const current = { icon: 'carrot', tint: 0, ink: null } as const;

    // Every draw, not a sample: the exclusion is an index shift, and an
    // off-by-one in it only shows up at one specific value of Math.random.
    for (let i = 0; i < COMBINATIONS - 1; i++) {
      const at = i / (COMBINATIONS - 1) - Number.EPSILON;
      vi.spyOn(Math, 'random').mockReturnValue(Math.max(0, at));

      const rolled = randomAvatar(current);
      expect(formatAvatar(rolled)).not.toBe(formatAvatar(current));
      expect(parseAvatar(formatAvatar(rolled))).toEqual(rolled);
    }

    vi.restoreAllMocks();
  });

  it('excludes the current avatar wherever it sits in the ramp, not only at zero', () => {
    // The exclusion is an index, so an avatar at slot 0 would be skipped by
    // arithmetic that is wrong for every other slot. This is the case that
    // caught it: an ink in the middle of the ramp.
    const current = { icon: 'mug', tint: 4, ink: 2 } as const;

    for (let i = 0; i < COMBINATIONS - 1; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / (COMBINATIONS - 1) - Number.EPSILON);
      expect(formatAvatar(randomAvatar(current))).not.toBe(formatAvatar(current));
    }

    vi.restoreAllMocks();
  });

  it('can reach every combination when nothing is excluded', () => {
    const seen = new Set<string>();

    for (let i = 0; i < COMBINATIONS; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / COMBINATIONS);
      seen.add(formatAvatar(randomAvatar()));
    }

    // A picker whose shuffle cannot land on some of its own grid is a bug the
    // eye would never catch.
    expect(seen.size).toBe(COMBINATIONS);
    vi.restoreAllMocks();
  });
});
