/**
 * The avatar vocabulary: an icon name, a tint slot and optionally an ink slot,
 * stored as one short string such as `carrot/3` or `carrot/3/5`.
 *
 * ADR 7 is the reasoning. The short version: a commenter's avatar used to be
 * the URL Google returned, which made reading a recipe disclose the visitor's
 * IP address to Google. An avatar is now something chosen on the site, and
 * choosing from a fixed set means it can be stored as a token and rendered from
 * a registry the frontend already ships — no upload, no bytes, no request.
 *
 * **These names are a persisted vocabulary, not an internal enum.** They are in
 * the database against real accounts, so a name may be added but never renamed
 * or reused for a different drawing. An unknown one is not an error: `parse`
 * returns null and the caller falls back to the initial-in-a-tint placeholder,
 * so a token written by a later build degrades in an older one.
 *
 * **Only hues are stored — never a lightness.** That is what makes the picker
 * safe to open up: the disc's lightness comes from the theme and the ink's comes
 * from the theme, so no pair of choices can produce a dark icon on a dark
 * background. A free colour picker would have to be contrast-checked to promise
 * the same thing, and a contrast check is only a curated palette arrived at the
 * hard way.
 */

import type { IconName } from '../icons/icons.data';

/**
 * The selection offered on the profile page, in the order it is drawn there.
 *
 * Twelve because the grid is six across: two full rows on a phone and one on a
 * wide screen, with no ragged last row at either size.
 */
export const AVATAR_ICONS = [
  'carrot',
  'citrus',
  'cherry',
  'herb',
  'egg',
  'bread',
  'cupcake',
  'mushroom',
  'pot',
  'pan',
  'rolling-pin',
  'mug',
] as const satisfies readonly IconName[];

export type AvatarIcon = (typeof AVATAR_ICONS)[number];

/**
 * Six tints, as hues.
 *
 * The ramp was anchored at both of the site's accents — slot 0 the hue of
 * `--color-accent`, slot 5 the hue of `--color-accent-2`, four steps between —
 * so the picker offered six visibly different tints without introducing a
 * colour the design did not already use.
 *
 * That was true of "Umber", whose accents were rust (hue 20) and teal (171).
 * The palette is now wine (342) and olive (74), so these hues no longer track
 * it, and the anchoring above describes where they came from rather than what
 * they currently match. Left that way on purpose (ADR 9): the hues are
 * presentation, but the *slots* are stored in `app_user.avatar` against real
 * accounts, so re-anchoring the ramp silently recolours every avatar anybody
 * has already chosen. That is a decision about existing accounts, not a
 * mechanical consequence of a palette swap.
 *
 * Saturation and lightness are not stored: they come from the same washed
 * treatment the placeholder uses, so an avatar sits in the page rather than
 * shouting out of it.
 */
export const AVATAR_TINT_HUES = [20, 42, 68, 104, 140, 171] as const;

export const AVATAR_TINTS = AVATAR_TINT_HUES.length;

/**
 * What the icon itself may be coloured, as slots into the same ramp.
 *
 * `null` is the original ink — the accent, dark on the light theme and light on
 * the dark one — and it is first because it is what every account chosen before
 * this existed already has. Keeping it a real choice rather than an absence
 * means the look those accounts have is still reachable from the picker.
 *
 * The ramp is reused rather than a second one invented: the disc and the icon
 * drawn from one set of hues is what stops an avatar becoming two unrelated
 * colours stuck together.
 */
export const AVATAR_INKS = [null, ...AVATAR_TINT_HUES.map((_, slot) => slot)] as const;

export interface Avatar {
  readonly icon: AvatarIcon;
  readonly tint: number;
  /** A slot in the hue ramp, or null for the accent ink every older token has. */
  readonly ink: number | null;
}

/**
 * `{ icon: 'carrot', tint: 3, ink: null }` → `'carrot/3'`, and
 * `{ icon: 'carrot', tint: 3, ink: 5 }` → `'carrot/3/5'`.
 *
 * The neutral ink writes two segments rather than a third meaning "default", so
 * every state has exactly one spelling. Two ways to write the same avatar is how
 * rows start round-tripping differently than they arrived.
 */
export function formatAvatar(avatar: Avatar): string {
  const base = `${avatar.icon}/${avatar.tint}`;
  return avatar.ink === null ? base : `${base}/${avatar.ink}`;
}

/**
 * `'carrot/3'` → `{ icon: 'carrot', tint: 3, ink: null }`, `'carrot/3/5'` →
 * `{ …, ink: 5 }`, and anything else → null.
 *
 * Deliberately total: null for absent, for malformed, for an icon this build
 * does not know and for a slot outside the ramp. Every one of those has the same
 * right answer on screen — the placeholder — and a parser that threw would turn
 * one stale row into a broken comment thread.
 *
 * A two-segment token is not legacy-with-a-shim, it is the neutral ink spelled
 * the only way it is spelled. Accounts that chose an avatar before the ink
 * existed therefore keep rendering exactly as they did.
 */
export function parseAvatar(token: string | null | undefined): Avatar | null {
  if (!token) return null;

  const [icon, slot, inkSlot, ...rest] = token.split('/');
  if (rest.length > 0) return null;

  if (!(AVATAR_ICONS as readonly string[]).includes(icon)) return null;

  // `Number('')` is 0 and `Number('1e1')` is 10, so the digits are checked
  // before the value: an avatar token is one of a closed set of strings, and
  // accepting spellings of it that the picker never writes only creates rows
  // that round-trip differently than they arrived.
  if (!/^\d$/.test(slot ?? '')) return null;

  const tint = Number(slot);
  if (tint >= AVATAR_TINTS) return null;

  let ink: number | null = null;
  if (inkSlot !== undefined) {
    // Same strictness as the tint, and for the same reason. `carrot/3/` is not
    // a neutral ink written oddly; it is a token the picker cannot produce.
    if (!/^\d$/.test(inkSlot)) return null;

    ink = Number(inkSlot);
    if (ink >= AVATAR_TINTS) return null;
  }

  return { icon: icon as AvatarIcon, tint, ink };
}

/**
 * A random avatar — what the profile page's shuffle button rolls, and the whole
 * of the "generator" ADR 7 describes. Nothing is generated that the grid cannot
 * also express, so there is one stored form and one renderer.
 *
 * `not` is the current choice, excluded so a press always visibly changes
 * something. A shuffle that can land on what you already had reads as a dead
 * button, and with 504 combinations it would happen about one press in five
 * hundred — rare enough to look like an intermittent bug rather than a rule.
 */
export function randomAvatar(not?: Avatar | null): Avatar {
  const combinations = AVATAR_ICONS.length * AVATAR_TINTS * AVATAR_INKS.length;
  const excluded = not ? indexOfAvatar(not) : -1;

  // Drawn from the combinations *other than* the current one, rather than
  // re-rolled until it differs: one call to Math.random, and no loop that is
  // unbounded in theory.
  let index = Math.floor(Math.random() * (excluded >= 0 ? combinations - 1 : combinations));
  if (excluded >= 0 && index >= excluded) index++;

  const ink = AVATAR_INKS[index % AVATAR_INKS.length];
  const rest = Math.floor(index / AVATAR_INKS.length);

  return {
    icon: AVATAR_ICONS[Math.floor(rest / AVATAR_TINTS)],
    tint: rest % AVATAR_TINTS,
    ink,
  };
}

/**
 * The inverse of the arithmetic in `randomAvatar`, and the reason the exclusion
 * works: an avatar the roll can produce has to map back to the index that
 * produces it, or "not this one" excludes some other one.
 */
function indexOfAvatar(avatar: Avatar): number {
  const inkSlot = AVATAR_INKS.indexOf(avatar.ink as (typeof AVATAR_INKS)[number]);
  if (inkSlot < 0) return -1;

  return (AVATAR_ICONS.indexOf(avatar.icon) * AVATAR_TINTS + avatar.tint) * AVATAR_INKS.length + inkSlot;
}
