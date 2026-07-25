/**
 * Accent- and ligature-insensitive folding for search.
 *
 * Mandatory for French, not a refinement: nobody types "mijoté" with the accent
 * into a search box, and "œufs" is unreachable from a standard keyboard. A
 * search that only matches exact accents is a search that appears broken.
 */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toLowerCase()
    .trim();
}

/** True when every whitespace-separated term in the needle appears in the haystack. */
export function matchesQuery(haystack: readonly string[], needle: string): boolean {
  const terms = fold(needle).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const folded = haystack.map(fold).join(' ');
  return terms.every((term) => folded.includes(term));
}

/** Accent-stripped, hyphenated slug. Mirrors the backend's slug generation. */
export function slugify(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
