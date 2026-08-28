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

/**
 * How far a term may be from a word and still count as the same word.
 *
 * Scaled by length, because a fixed budget is wrong at both ends: one edit on a
 * three-letter term reaches most of the dictionary, and two edits on a
 * twelve-letter one is a stricter test than one edit on a five-letter one.
 *
 * Short terms get nothing. `sel` and `oeuf` are real searches on this site, and
 * letting them drift would make the shortest, most common queries the least
 * predictable.
 */
export function typoTolerance(term: string): number {
  if (term.length <= 3) return 0;
  if (term.length <= 7) return 1;
  return 2;
}

/**
 * Optimal string alignment distance, stopping as soon as it exceeds `max`.
 *
 * Damerau rather than plain Levenshtein — it counts a swap of two adjacent
 * characters as one edit rather than two, and transposition is what most typing
 * mistakes actually are: `recetet`, `chakchouka` typed `chakchoukа`. Under plain
 * Levenshtein a swap costs the entire budget of a short word.
 *
 * Bounded so a long ingredient list stays cheap: the row minimum is checked each
 * pass and the whole comparison abandoned once nothing can bring it back under
 * the limit.
 */
export function withinEditDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (max <= 0) return false;
  // Length alone can rule it out before any work is done.
  if (Math.abs(a.length - b.length) > max) return false;

  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    let best = current[0];

    for (let j = 1; j <= b.length; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;

      let cost = Math.min(
        current[j - 1] + 1, // insertion
        previous[j] + 1, // deletion
        previous[j - 1] + substitution,
      );

      // The transposition case: the last two characters are each other's.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cost = Math.min(cost, twoBack[j - 2] + 1);
      }

      current[j] = cost;
      if (cost < best) best = cost;
    }

    if (best > max) return false;

    twoBack = previous;
    previous = current;
  }

  return previous[b.length] <= max;
}

/**
 * The same match, forgiving of typos.
 *
 * Deliberately *not* what the search box uses first. `matchesQuery` runs on its
 * own and this is only reached when it found nothing at all, which keeps every
 * precise search precise: `poivron` is within two edits of `poivre`, and a
 * search that quietly widened would answer a question nobody asked.
 *
 * A term matches a word when it is a substring of it — so prefixes still work —
 * or when the two are within `typoTolerance` edits of each other.
 */
export function matchesFuzzy(haystack: readonly string[], needle: string): boolean {
  const terms = fold(needle).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const words = fold(haystack.join(' '))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  return terms.every((term) => {
    const budget = typoTolerance(term);
    return words.some(
      (word) => word.includes(term) || (budget > 0 && withinEditDistance(term, word, budget)),
    );
  });
}

/** Accent-stripped, hyphenated slug. Mirrors the backend's slug generation. */
export function slugify(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
