/**
 * The avatar vocabulary: an icon name and a tint slot, stored as one short
 * string such as `carrot/3`.
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
 * The ramp is anchored at both of the site's own accents — slot 0 is the hue of
 * `--color-accent` (#a15a35, rust) and slot 5 is the hue of `--color-accent-2`
 * (#4f7d74, teal) — with four steps between. So the picker offers six visibly
 * different tints without introducing a colour the design does not already use,
 * which is the constraint the image placeholder's warm band exists to respect.
 *
 * Saturation and lightness are not stored: they come from the same washed
 * treatment the placeholder uses, so an avatar sits in the page rather than
 * shouting out of it.
 */
export const AVATAR_TINT_HUES = [20, 42, 68, 104, 140, 171] as const;

export const AVATAR_TINTS = AVATAR_TINT_HUES.length;

export interface Avatar {
  readonly icon: AvatarIcon;
  readonly tint: number;
}

/** `{ icon: 'carrot', tint: 3 }` → `'carrot/3'`. */
export function formatAvatar(avatar: Avatar): string {
  return `${avatar.icon}/${avatar.tint}`;
}

/**
 * `'carrot/3'` → `{ icon: 'carrot', tint: 3 }`, and anything else → null.
 *
 * Deliberately total: null for absent, for malformed, for an icon this build
 * does not know and for a tint outside the ramp. Every one of those has the same
 * right answer on screen — the placeholder — and a parser that threw would turn
 * one stale row into a broken comment thread.
 */
export function parseAvatar(token: string | null | undefined): Avatar | null {
  if (!token) return null;

  const [icon, slot, ...rest] = token.split('/');
  if (rest.length > 0) return null;

  if (!(AVATAR_ICONS as readonly string[]).includes(icon)) return null;

  // `Number('')` is 0 and `Number('1e1')` is 10, so the digits are checked
  // before the value: an avatar token is one of a closed set of strings, and
  // accepting spellings of it that the picker never writes only creates rows
  // that round-trip differently than they arrived.
  if (!/^\d$/.test(slot ?? '')) return null;

  const tint = Number(slot);
  if (tint >= AVATAR_TINTS) return null;

  return { icon: icon as AvatarIcon, tint };
}

/**
 * A random avatar — what the profile page's shuffle button rolls, and the whole
 * of the "generator" ADR 7 describes. Nothing is generated that the grid cannot
 * also express, so there is one stored form and one renderer.
 *
 * `not` is the current choice, excluded so a press always visibly changes
 * something. A shuffle that can land on what you already had reads as a dead
 * button, and with 72 combinations it would happen about one press in seventy —
 * often enough to be noticed and rare enough to look like an intermittent bug.
 */
export function randomAvatar(not?: Avatar | null): Avatar {
  const combinations = AVATAR_ICONS.length * AVATAR_TINTS;
  const excluded = not ? AVATAR_ICONS.indexOf(not.icon) * AVATAR_TINTS + not.tint : -1;

  // Drawn from the combinations *other than* the current one, rather than
  // re-rolled until it differs: one call to Math.random, and no loop that is
  // unbounded in theory.
  let index = Math.floor(Math.random() * (excluded >= 0 ? combinations - 1 : combinations));
  if (excluded >= 0 && index >= excluded) index++;

  return {
    icon: AVATAR_ICONS[Math.floor(index / AVATAR_TINTS)],
    tint: index % AVATAR_TINTS,
  };
}
