import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCALES, type Locale } from './locale';
import { PluralTranspiler } from './plural-transpiler';

/**
 * The table below is not what anyone expected the output to be — it is what
 * `@messageformat/core` actually produced for these exact strings, captured
 * before it was removed. That makes this a regression test against the site's
 * previous rendering rather than against a fresh reading of the ICU spec, which
 * is the only version of this test worth having: the risk in dropping a
 * dependency is a case nobody thought to look at.
 *
 * Two rows in it are the whole reason `Intl.PluralRules` does the deciding:
 *
 *   - `rating.star` at 0 is **"0 étoile"**, singular, because French counts zero
 *     as one. English gives "0 stars". No `=0` case exists in either message, so
 *     this comes purely from the locale's plural rules.
 *   - `rating.star` at 1000000 lands in French's `many` category, which none of
 *     these messages declares. It has to fall back to `other`, or the string
 *     renders empty.
 *
 * The thousands separator is asserted too. French uses U+202F, a narrow no-break
 * space, and a plain space would be a visible defect that reads as a typo.
 */

/** Narrow no-break space — French's thousands separator, invisible in a diff. */
const NNBSP = '\u202f';

const COUNTS = [0, 1, 2, 11, 1234, 1000000] as const;

const GOLDEN: Record<Locale, Record<string, readonly string[]>> = {
  fr: {
    'list.count': [
      'aucune recette',
      '1 recette',
      '2 recettes',
      '11 recettes',
      `1${NNBSP}234 recettes`,
      `1${NNBSP}000${NNBSP}000 recettes`,
    ],
    'recipe.reviews': [
      'aucun avis',
      '1 avis',
      '2 avis',
      '11 avis',
      `1${NNBSP}234 avis`,
      `1${NNBSP}000${NNBSP}000 avis`,
    ],
    'rating.star': [
      '0 étoile',
      '1 étoile',
      '2 étoiles',
      '11 étoiles',
      `1${NNBSP}234 étoiles`,
      `1${NNBSP}000${NNBSP}000 étoiles`,
    ],
    'reactions.count': [
      '0 réaction',
      '1 réaction',
      '2 réactions',
      '11 réactions',
      `1${NNBSP}234 réactions`,
      `1${NNBSP}000${NNBSP}000 réactions`,
    ],
    'comments.heading': [
      '0 commentaire',
      '1 commentaire',
      '2 commentaires',
      '11 commentaires',
      `1${NNBSP}234 commentaires`,
      `1${NNBSP}000${NNBSP}000 commentaires`,
    ],
    'admin.statPending': [
      '0 en attente',
      '1 en attente',
      '2 en attente',
      '11 en attente',
      `1${NNBSP}234 en attente`,
      `1${NNBSP}000${NNBSP}000 en attente`,
    ],
  },
  en: {
    'list.count': [
      'no recipes',
      '1 recipe',
      '2 recipes',
      '11 recipes',
      '1,234 recipes',
      '1,000,000 recipes',
    ],
    'recipe.reviews': [
      'no reviews',
      '1 review',
      '2 reviews',
      '11 reviews',
      '1,234 reviews',
      '1,000,000 reviews',
    ],
    'rating.star': ['0 stars', '1 star', '2 stars', '11 stars', '1,234 stars', '1,000,000 stars'],
    'reactions.count': [
      '0 reactions',
      '1 reaction',
      '2 reactions',
      '11 reactions',
      '1,234 reactions',
      '1,000,000 reactions',
    ],
    'comments.heading': [
      '0 comments',
      '1 comment',
      '2 comments',
      '11 comments',
      '1,234 comments',
      '1,000,000 comments',
    ],
    'admin.statPending': [
      '0 awaiting',
      '1 awaiting',
      '2 awaiting',
      '11 awaiting',
      '1,234 awaiting',
      '1,000,000 awaiting',
    ],
  },
};

/** Read from public/, so this asserts against the bundles that actually ship. */
function bundle(locale: Locale): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'i18n', `${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

function lookUp(source: Record<string, unknown>, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], source);

  if (typeof value !== 'string') throw new Error(`${key} is missing from the bundle`);
  return value;
}

describe('PluralTranspiler', () => {
  let transpiler: PluralTranspiler;

  const say = (value: string, params: Record<string, unknown> = {}) =>
    transpiler.transpile({ value, params, translation: {}, key: 'spec' });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PluralTranspiler] });
    transpiler = TestBed.inject(PluralTranspiler);
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      beforeEach(() => transpiler.onLangChanged(locale));

      for (const [key, expected] of Object.entries(GOLDEN[locale])) {
        it(`renders ${key} exactly as messageformat did`, () => {
          const source = lookUp(bundle(locale), key);

          expect(COUNTS.map((count) => say(source, { count }))).toEqual(expected);
        });
      }
    });
  }

  it('is French before any language has been announced', () => {
    // onLangChanged fires from setActiveLang and never at construction, so the
    // window between bootstrap and LocaleService.init() renders with whatever
    // the field was initialised to. French is the app's default; English here
    // would mean anyone who saw that frame saw the wrong language.
    expect(say('{count, plural, one {# étoile} other {# étoiles}}', { count: 0 })).toBe('0 étoile');
  });

  it('still interpolates Transloco params around a plural', () => {
    transpiler.onLangChanged('en');

    expect(
      say('{{ who }} left {count, plural, one {# note} other {# notes}} today', {
        who: 'Hédi',
        count: 3,
      }),
    ).toBe('Hédi left 3 notes today');
  });

  it('resolves several plurals in one string, repeatably', () => {
    transpiler.onLangChanged('en');
    const source = '{a, plural, one {# tag} other {# tags}}, {b, plural, one {# step} other {# steps}}';

    // Called twice on purpose. A `/g` regex hoisted to module scope keeps its
    // lastIndex between calls, and the second render would silently start
    // partway through the string.
    expect(say(source, { a: 1, b: 4 })).toBe('1 tag, 4 steps');
    expect(say(source, { a: 1, b: 4 })).toBe('1 tag, 4 steps');
  });

  it('leaves a message with no plural in it untouched', () => {
    expect(say('Bonjour {{ name }}', { name: 'Camille' })).toBe('Bonjour Camille');
  });
});
