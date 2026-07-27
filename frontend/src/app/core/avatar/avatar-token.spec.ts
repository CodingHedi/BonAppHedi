import { describe, expect, it, vi } from 'vitest';
import {
  AVATAR_ICONS,
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

describe('parseAvatar', () => {
  it('round-trips what formatAvatar writes, for every combination offered', () => {
    // Exhaustive on purpose — it is 72 cases, and it is the only assertion that
    // the picker cannot offer a choice the parser then rejects.
    for (const icon of AVATAR_ICONS) {
      for (let tint = 0; tint < AVATAR_TINTS; tint++) {
        expect(parseAvatar(formatAvatar({ icon, tint }))).toEqual({ icon, tint });
      }
    }
  });

  it('reads a well-formed token', () => {
    expect(parseAvatar('carrot/3')).toEqual({ icon: 'carrot', tint: 3 });
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
    ['a third segment', 'carrot/2/x'],
    ['a negative tint', 'carrot/-1'],
    ['a non-numeric tint', 'carrot/x'],
    ['a URL, which is what this replaced', 'https://lh3.googleusercontent.com/a/x'],
  ])('rejects %s', (_why, token) => {
    expect(parseAvatar(token)).toBeNull();
  });

  it('rejects spellings of a valid tint that the picker never writes', () => {
    // `Number(' 1')` is 1 and `Number('1e0')` is 1, so a lenient parser accepts
    // rows that come back out differently than they went in.
    expect(parseAvatar('carrot/ 1')).toBeNull();
    expect(parseAvatar('carrot/1e0')).toBeNull();
    expect(parseAvatar('carrot/01')).toBeNull();
  });
});

describe('the tint ramp', () => {
  it('has a hue for every slot a token may carry', () => {
    // The component indexes AVATAR_TINT_HUES with the parsed tint, so a ramp
    // shorter than AVATAR_TINTS would render `undefined` as a hue and produce a
    // grey disc rather than a tinted one.
    expect(AVATAR_TINT_HUES).toHaveLength(AVATAR_TINTS);
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
    const current = { icon: 'carrot', tint: 0 } as const;

    // Every draw, not a sample: the exclusion is an index shift, and an
    // off-by-one in it only shows up at one specific value of Math.random.
    for (let i = 0; i < AVATAR_ICONS.length * AVATAR_TINTS - 1; i++) {
      const at = i / (AVATAR_ICONS.length * AVATAR_TINTS - 1) - Number.EPSILON;
      vi.spyOn(Math, 'random').mockReturnValue(Math.max(0, at));

      const rolled = randomAvatar(current);
      expect(formatAvatar(rolled)).not.toBe(formatAvatar(current));
      expect(parseAvatar(formatAvatar(rolled))).toEqual(rolled);
    }

    vi.restoreAllMocks();
  });

  it('can reach every combination when nothing is excluded', () => {
    const seen = new Set<string>();
    const total = AVATAR_ICONS.length * AVATAR_TINTS;

    for (let i = 0; i < total; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / total);
      seen.add(formatAvatar(randomAvatar()));
    }

    // A picker whose shuffle cannot land on some of its own grid is a bug the
    // eye would never catch.
    expect(seen.size).toBe(total);
    vi.restoreAllMocks();
  });
});
