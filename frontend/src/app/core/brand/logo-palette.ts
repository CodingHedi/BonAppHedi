import type { ResolvedTheme } from '../theme/theme.service';

/**
 * The palette the logo may be drawn in, and the rule for which parts of it are
 * legible on which ground.
 *
 * Every value here is one of the codes from the logo proof sheet — the page the
 * mark was chosen on — and the codes are kept because they are how the decision
 * was recorded: the site's logo is `A·C·A on U` in the dark theme and
 * `A·I·A on P` in the light one, which is this file's vocabulary.
 *
 * Pure on purpose. The shuffle has one property worth testing — that it cannot
 * produce an illegible logo — and a function taking its randomness as an
 * argument can be tested for that exhaustively, which a service reading
 * Math.random cannot.
 */

export interface BrandInk {
  /** The proof sheet's one-letter code, e.g. `A` for Orange. */
  readonly code: string;
  readonly name: string;
  readonly hex: string;
}

/** Orange. Outside both ramps and carried by both themes — see `--color-brand`. */
export const ORANGE: BrandInk = { code: 'A', name: 'Orange', hex: '#e87e13' };

/**
 * Both themes' inks, plus Orange.
 *
 * Deliberately the whole palette rather than the current theme's three. The
 * point of the shuffle is that it reaches for colours the site would not
 * normally put in the header, and confining it to one theme's own ramp would
 * make it nearly invisible — those three are chosen to sit together. It is also
 * what makes the contrast rule below do real work: Cream on Paper is 1.05:1 and
 * has to be excluded by measurement, not by taste.
 */
export const BRAND_INKS: readonly BrandInk[] = [
  ORANGE,
  { code: 'I', name: 'Ink', hex: '#1e1a1b' },
  { code: 'W', name: 'Wine', hex: '#a04a64' },
  { code: 'O', name: 'Olive', hex: '#77854a' },
  { code: 'C', name: 'Cream', hex: '#efe6d6' },
  { code: 'R', name: 'Rust', hex: '#a15a35' },
  { code: 'T', name: 'Spruce', hex: '#4f7d74' },
];

/**
 * What the logo actually sits on: `--color-bg` for the theme in force.
 *
 * The header's own background is `color-mix(--color-bg 90%, transparent)` over
 * the page, so the page colour is the honest ground — and these two are the
 * proof sheet's `P` and `U`, the grounds the chosen references name.
 */
export const GROUNDS: Record<ResolvedTheme, BrandInk> = {
  light: { code: 'P', name: 'Paper', hex: '#f8f5f4' },
  dark: { code: 'U', name: 'Umber', hex: '#241f1a' },
};

/**
 * The floor a shuffled ink must clear against the ground.
 *
 * 1.6:1 is the proof sheet's own threshold, where it hid the pairings that
 * vanish at small sizes. It is deliberately *not* a text-contrast rule: a logo
 * is a shape rather than something to be read, and holding it to 4.5:1 would
 * reject the orange-on-paper pairing the brand actually leads with.
 */
export const MIN_RATIO = 1.6;

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio, 1:1 to 21:1. Order of the arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The inks that clear `MIN_RATIO` against a theme's ground. */
export function legibleInks(theme: ResolvedTheme): readonly BrandInk[] {
  const ground = GROUNDS[theme].hex;
  return BRAND_INKS.filter((ink) => contrastRatio(ink.hex, ground) >= MIN_RATIO);
}

/** One colour per block of the lockup. */
export interface LogoSet {
  readonly mark: string;
  readonly upper: string;
  readonly lower: string;
}

/** The reference the site ships with, per theme. `A·I·A` / `A·C·A`. */
export function defaultSet(theme: ResolvedTheme): LogoSet {
  return {
    mark: ORANGE.hex,
    upper: theme === 'dark' ? '#efe6d6' : '#1e1a1b',
    lower: ORANGE.hex,
  };
}

/**
 * A random legible set, never repeating the one passed as `previous`.
 *
 * `random` is a parameter rather than a call to Math.random so the invariant —
 * that every block clears the floor — can be proved over every seed rather than
 * sampled. The `previous` guard is what makes clicking the logo feel like it
 * did something: without it a three-ink pool repeats itself often enough to
 * look broken.
 */
export function shuffleSet(
  theme: ResolvedTheme,
  random: () => number = Math.random,
  previous?: LogoSet,
): LogoSet {
  const pool = legibleInks(theme);
  const pick = () => pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].hex;

  // Bounded rather than `while (true)`: with a pool this small a run of equal
  // draws is unlikely but not impossible, and an easter egg must not be able to
  // hang the header. Falling out of the loop returns a legible set that merely
  // repeats, which is the harmless failure.
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = { mark: pick(), upper: pick(), lower: pick() };
    if (
      !previous ||
      candidate.mark !== previous.mark ||
      candidate.upper !== previous.upper ||
      candidate.lower !== previous.lower
    ) {
      return candidate;
    }
  }
  return { mark: pick(), upper: pick(), lower: pick() };
}

/**
 * The Konami code, as `KeyboardEvent.key` values.
 *
 * `b` and `a` are compared lowercased, so it still unlocks with caps lock on —
 * an easter egg that silently depends on shift state is one nobody finds.
 */
export const KONAMI = [
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
] as const;

/**
 * The last few keys pressed, newest last, never longer than the sequence.
 *
 * A rolling window rather than a progress counter, and that is a correction
 * rather than a preference. The counter version reset to "does this key start
 * the sequence again", which looks right and is not: `↑↑↑↓↓←→←→ba` fails under
 * it, because the third up resets to 1 and the first down then finds `↑`
 * expected. Pressing up three times is exactly what someone hunting for an
 * easter egg does. A window has no such state to get wrong — a trailing match
 * is a match however much junk came before it.
 */
export function pushKey(recent: readonly string[], key: string): string[] {
  const normalised = key.length === 1 ? key.toLowerCase() : key;
  return [...recent, normalised].slice(-KONAMI.length);
}

/** Whether those keys are the code. */
export function isKonami(recent: readonly string[]): boolean {
  return recent.length === KONAMI.length && KONAMI.every((key, i) => key === recent[i]);
}
