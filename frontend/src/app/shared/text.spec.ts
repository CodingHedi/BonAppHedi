import { describe, expect, it } from 'vitest';
import { fold, matchesQuery, slugify } from './text';

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
