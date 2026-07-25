/**
 * Locale primitives.
 *
 * Two things are localized in a URL, and it is important to keep them apart:
 *
 *   1. The route SEGMENT   — /fr/recettes/…  vs  /en/recipes/…
 *   2. The recipe SLUG     — babka-au-chocolat vs chocolate-babka
 *
 * Segments live here because they are structural and finite. Slugs live in the
 * database on the translation row, because they belong to the content.
 *
 * Angular's Router has no native support for localized paths, so the route
 * array is generated per locale from SEGMENTS at bootstrap.
 */

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** French is the default and the fallback everywhere, including hreflang x-default. */
export const DEFAULT_LOCALE: Locale = 'fr';

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
};

/** Angular `LOCALE_ID` values — not the same strings as our URL prefixes. */
export const LOCALE_IDS: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

export type RouteKey = 'recipes' | 'legal' | 'privacy' | 'admin';

export const SEGMENTS: Record<Locale, Record<RouteKey, string>> = {
  fr: {
    recipes: 'recettes',
    legal: 'mentions-legales',
    privacy: 'confidentialite',
    admin: 'admin',
  },
  en: {
    recipes: 'recipes',
    legal: 'legal-notice',
    privacy: 'privacy',
    admin: 'admin',
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Reads the locale out of a path such as `/en/recipes/chocolate-babka`. */
export function localeFromPath(pathname: string): Locale | null {
  const segment = pathname.split('/')[1];
  return isLocale(segment) ? segment : null;
}

/**
 * Best guess at a first-time visitor's language, in descending order of how
 * much it reflects an actual choice they made:
 *   1. a locale they previously picked (cookie/storage, passed in by the caller)
 *   2. the browser's Accept-Language preferences
 *   3. French
 */
export function negotiateLocale(stored: string | null, browserLanguages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;

  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** `/fr/recettes/babka` → `['recettes', 'babka']` */
export function stripLocale(pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean);
  return isLocale(parts[0]) ? parts.slice(1) : parts;
}
