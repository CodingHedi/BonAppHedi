import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './locale';

/**
 * Guards the failure mode bilingual sites actually ship: a key added to one
 * file and forgotten in the other, so a visitor sees the raw dotted key on the
 * page. Cheap to check, invisible until someone reports it.
 *
 * Reads the files from disk rather than importing them, so this asserts against
 * what actually gets served out of public/ — and so a new locale is covered by
 * adding it to LOCALES, with no change here.
 */

type Json = { [key: string]: string | Json };

const SOURCES: ReadonlyArray<readonly [string, Json]> = LOCALES.map(
  (locale) =>
    [
      locale,
      JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'i18n', `${locale}.json`), 'utf8'),
      ) as Json,
    ] as const,
);

function flatten(value: Json, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out.set(path, child);
    else for (const [k, v] of flatten(child, path)) out.set(k, v);
  }
  return out;
}

const tables = new Map(SOURCES.map(([locale, json]) => [locale, flatten(json)] as const));

describe('translation files', () => {
  it('define exactly the same keys in every locale', () => {
    const [reference, ...others] = [...tables.entries()];
    const expected = [...reference[1].keys()].sort();

    for (const [locale, table] of others) {
      const actual = [...table.keys()].sort();
      const missing = expected.filter((key) => !table.has(key));
      const extra = actual.filter((key) => !reference[1].has(key));

      expect(missing, `missing from ${locale}.json`).toEqual([]);
      expect(extra, `absent from ${reference[0]}.json but present in ${locale}.json`).toEqual([]);
    }
  });

  it('has no empty strings', () => {
    for (const [locale, table] of tables) {
      for (const [key, value] of table) {
        expect(value.trim(), `${locale}.json → ${key}`).not.toBe('');
      }
    }
  });

  it('uses matching interpolation placeholders across locales', () => {
    // "Switch to {{language}}" translated as "Passer en {{langue}}" renders a
    // literal placeholder to the user. The names must line up.
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

    const [reference, ...others] = [...tables.entries()];
    for (const [locale, table] of others) {
      for (const [key, value] of table) {
        const expected = placeholders(reference[1].get(key) ?? '');
        expect(placeholders(value), `${locale}.json → ${key}`).toEqual(expected);
      }
    }
  });

  it('keeps the French zero-is-singular rule that English does not share', () => {
    // French pluralizes 0 as singular ("0 réaction"); English does not
    // ("0 reactions"). Hand-rolled pluralizers get this wrong, which is why
    // these strings are ICU and why the asymmetry is asserted rather than
    // assumed.
    expect(tables.get('fr')!.get('reactions.count')).toContain('=0 {0 réaction}');
    expect(tables.get('en')!.get('reactions.count')).toContain('=0 {0 reactions}');
  });
});
