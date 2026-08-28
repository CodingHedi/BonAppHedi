import { describe, expect, it } from 'vitest';
import {
  fold,
  matchesFuzzy,
  matchesQuery,
  slugify,
  typoTolerance,
  withinEditDistance,
} from './text';

describe('fold', () => {
  it('strips the accents a French search box will never receive', () => {
    expect(fold('mijoté')).toBe('mijote');
    expect(fold('Crème brûlée')).toBe('creme brulee');
    expect(fold('Hédi')).toBe('hedi');
  });

  it('expands ligatures that are unreachable on a standard keyboard', () => {
    expect(fold('Œufs')).toBe('oeufs');
    expect(fold('œuf')).toBe('oeuf');
    expect(fold('nævus')).toBe('naevus');
  });
});

describe('matchesQuery', () => {
  it('matches regardless of the accents the visitor typed', () => {
    expect(matchesQuery(['Tajine de bœuf mijoté'], 'mijote')).toBe(true);
    expect(matchesQuery(['Tajine de bœuf mijoté'], 'mijoté')).toBe(true);
    expect(matchesQuery(['Œufs pochés'], 'oeufs')).toBe(true);
    expect(matchesQuery(['Œufs pochés'], 'ŒUFS')).toBe(true);
  });

  it('requires every term, in any order', () => {
    expect(matchesQuery(['Babka au chocolat'], 'babka chocolat')).toBe(true);
    expect(matchesQuery(['Babka au chocolat'], 'chocolat babka')).toBe(true);
    expect(matchesQuery(['Babka au chocolat'], 'babka vanille')).toBe(false);
  });

  it('treats an empty query as matching everything', () => {
    expect(matchesQuery(['anything'], '')).toBe(true);
    expect(matchesQuery(['anything'], '   ')).toBe(true);
  });

  it('searches across every field it is given', () => {
    const haystack = ['Chakchouka', 'Un plat à partager', 'Œufs', 'Poivron rouge'];
    expect(matchesQuery(haystack, 'poivron')).toBe(true);
    expect(matchesQuery(haystack, 'oeufs')).toBe(true);
  });
});

describe('withinEditDistance', () => {
  it('counts a swap of neighbours as one edit, not two', () => {
    // The whole reason this is Damerau rather than plain Levenshtein.
    // Transposition is what most typing mistakes actually are, and under plain
    // Levenshtein a single swap costs a short word its entire budget.
    expect(withinEditDistance('recetet', 'recette', 1)).toBe(true);
    expect(withinEditDistance('chakchoukа'.replace('а', 'a'), 'chakchouka', 1)).toBe(true);
  });

  it('counts insertions, deletions and substitutions', () => {
    expect(withinEditDistance('babca', 'babka', 1)).toBe(true); // substitution
    expect(withinEditDistance('babk', 'babka', 1)).toBe(true); // deletion
    expect(withinEditDistance('babkaa', 'babka', 1)).toBe(true); // insertion
  });

  it('refuses anything past the budget', () => {
    expect(withinEditDistance('babca', 'babka', 0)).toBe(false);
    expect(withinEditDistance('zzzzz', 'babka', 2)).toBe(false);
  });

  it('rules out a length gap without doing the work', () => {
    expect(withinEditDistance('a', 'abcdefgh', 2)).toBe(false);
  });

  it('is symmetric, since neither string is the authority', () => {
    expect(withinEditDistance('poivron', 'poivre', 2)).toBe(
      withinEditDistance('poivre', 'poivron', 2),
    );
  });
});

describe('typoTolerance', () => {
  it('gives short terms nothing to drift with', () => {
    // `sel` and `ail` are real searches here. One edit from a three-letter word
    // reaches most of the dictionary, which would make the shortest and most
    // common queries the least predictable on the site.
    expect(typoTolerance('sel')).toBe(0);
    expect(typoTolerance('ail')).toBe(0);
  });

  it('scales with length, because a fixed budget is wrong at both ends', () => {
    expect(typoTolerance('babka')).toBe(1);
    expect(typoTolerance('chakchouka')).toBe(2);
  });
});

describe('matchesFuzzy', () => {
  const shakshuka = ['Chakchouka', 'Œufs pochés, poivron rouge, tomate'];

  it('forgives the typo that makes a search look broken', () => {
    expect(matchesFuzzy(shakshuka, 'chakchuka')).toBe(true);
    expect(matchesFuzzy(shakshuka, 'chakchoukka')).toBe(true);
    expect(matchesFuzzy(['Babka au chocolat'], 'babca')).toBe(true);
  });

  it('still folds accents and ligatures', () => {
    expect(matchesFuzzy(shakshuka, 'oeuf')).toBe(true);
    expect(matchesFuzzy(shakshuka, 'poivron')).toBe(true);
  });

  it('matches a prefix, so typing as you go still narrows', () => {
    expect(matchesFuzzy(shakshuka, 'chak')).toBe(true);
    expect(matchesFuzzy(shakshuka, 'poiv')).toBe(true);
  });

  it('requires every term, as the strict matcher does', () => {
    expect(matchesFuzzy(shakshuka, 'chakchuka poivron')).toBe(true);
    expect(matchesFuzzy(shakshuka, 'chakchuka vanille')).toBe(false);
  });

  it('does not match something entirely different', () => {
    expect(matchesFuzzy(shakshuka, 'zzzzz')).toBe(false);
    expect(matchesFuzzy(['Babka au chocolat'], 'tajine')).toBe(false);
  });

  it('does not drag in the near neighbours of a real ingredient', () => {
    // `poivron` and `poivre` are two edits apart and both are seeded here, so
    // this is the collision worth pinning. At seven characters the budget is
    // one, which is what keeps them apart — a table that handed out two edits
    // sooner would answer "poivron" with the recipes containing pepper.
    expect(matchesFuzzy(['Sel et poivre'], 'poivron')).toBe(false);
  });

  it('is broader than the strict matcher, which is why it runs second', () => {
    // Everything strict finds, fuzzy also finds; the reverse is the point. The
    // list page only reaches for this once `matchesQuery` has returned nothing
    // at all, so a search that already works is never widened underneath the
    // person typing it.
    expect(matchesQuery(['Babka au chocolat'], 'babca')).toBe(false);
    expect(matchesFuzzy(['Babka au chocolat'], 'babca')).toBe(true);
  });
});

describe('slugify', () => {
  it('produces the seed slugs from their titles', () => {
    expect(slugify('Babka au chocolat')).toBe('babka-au-chocolat');
    expect(slugify('Tajine de bœuf')).toBe('tajine-de-boeuf');
    expect(slugify('Jus grenade & orange')).toBe('jus-grenade-orange');
    expect(slugify('Cheesecake basque')).toBe('cheesecake-basque');
  });

  it('does not leave leading or trailing separators', () => {
    expect(slugify('  ¡Hola!  ')).toBe('hola');
    expect(slugify('---')).toBe('');
  });
});
