import { Injectable } from '@angular/core';
import {
  DefaultTranspiler,
  type TranslocoTranspiler,
  type TranspileParams,
} from '@jsverse/transloco';

import { DEFAULT_LOCALE, LOCALE_IDS, isLocale } from './locale';

/**
 * ICU plurals, resolved without `new Function`.
 *
 * `@jsverse/transloco-messageformat` compiles each message into JavaScript at
 * runtime, which is a full ICU implementation and also the sole reason
 * `'unsafe-eval'` had to be in the Content-Security-Policy — the one term a CSP
 * exists to forbid, carried for six strings. This does the same job for the
 * subset those strings actually use, with no code generation anywhere.
 *
 * **The plural categories come from `Intl.PluralRules`, not from a hand-written
 * rule.** That distinction is the whole reason this is safe to do. French counts
 * zero as singular ("0 étoile") and English does not ("0 stars"); French has a
 * `many` category that English lacks; and none of that is guessable from the
 * language tag. `Intl` is CLDR, shipped in the browser, and gets it right for
 * every locale — including ones this site does not have yet.
 *
 * `#` is formatted with `Intl.NumberFormat` for the same reason, and it is not
 * cosmetic: French groups thousands with a narrow no-break space, so 1234
 * renders "1 234 recettes" and never "1,234". The table in
 * `plural-transpiler.spec.ts` is the output messageformat produced for these
 * exact strings, so a regression shows up as a diff against what the site used
 * to render rather than against someone's expectation of it.
 *
 * What is deliberately *not* implemented, because no message uses it: `select`,
 * `selectordinal`, offsets, date and number skeletons, and quoting a literal
 * `#`. Adding any of them is a reason to reconsider the dependency rather than
 * to grow this file.
 */
@Injectable()
export class PluralTranspiler extends DefaultTranspiler implements TranslocoTranspiler {
  private locale = LOCALE_IDS[DEFAULT_LOCALE];

  override transpile(options: TranspileParams): unknown {
    // Interpolation of `{{ param }}` first, exactly as the messageformat
    // transpiler did: single braces are ICU's and double braces are Transloco's,
    // so the two passes cannot see each other's syntax.
    const interpolated = super.transpile(options);
    const params = (options.params ?? {}) as Params;

    return typeof interpolated === 'string'
      ? render(interpolated, params, this.locale)
      : interpolated;
  }

  /**
   * Transloco calls this from `setActiveLang`, which `LocaleService.init()`
   * always reaches at bootstrap — but never at construction, so the field above
   * has to hold the default rather than wait to be told.
   */
  onLangChanged(lang: string): void {
    this.locale = LOCALE_IDS[isLocale(lang) ? lang : DEFAULT_LOCALE];
  }
}

type Params = Record<string, unknown>;

/** Index of the `}` closing the `{` at `open`, or -1 if the braces do not balance. */
function closingBrace(text: string, open: number): number {
  let depth = 0;

  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') {
      depth += 1;
    } else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Replaces every `{name, plural, …}` in `text` with the case that applies.
 *
 * The regex only finds where a plural *starts*; where it ends is found by
 * counting braces, because a case body contains braces of its own and a
 * non-greedy `}` match would stop at the first one.
 */
function render(text: string, params: Params, locale: string): string {
  // Constructed per call rather than hoisted: a module-level /g regex carries
  // `lastIndex` between calls, and recursion below would then resume mid-string.
  const start = /\{\s*(\w+)\s*,\s*plural\s*,/g;

  let out = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = start.exec(text)) !== null) {
    const close = closingBrace(text, match.index);
    if (close === -1) break;

    const body = text.slice(match.index + match[0].length, close);
    out += text.slice(cursor, match.index) + choose(body, Number(params[match[1]]), params, locale);

    cursor = close + 1;
    start.lastIndex = cursor;
  }

  return cursor === 0 ? text : out + text.slice(cursor);
}

function choose(body: string, count: number, params: Params, locale: string): string {
  const cases = parseCases(body);
  const known = Number.isFinite(count);
  const category = known ? new Intl.PluralRules(locale).select(count) : 'other';

  // ICU's own precedence: an exact `=n` beats the plural category, and a
  // category the message does not spell out falls back to `other`. That last
  // step is load-bearing here — French puts 1000000 in `many`, no message
  // declares one, and without the fallback the string would render empty.
  const chosen = cases.get(`=${count}`) ?? cases.get(category) ?? cases.get('other') ?? '';

  // Nested plurals first, so each `#` is consumed by the plural that encloses
  // it. Whatever survives that belongs to this level.
  const resolved = render(chosen, params, locale);
  return resolved.replaceAll('#', known ? new Intl.NumberFormat(locale).format(count) : '');
}

/** `=0 {none} one {# thing} other {# things}` → those three cases by selector. */
function parseCases(body: string): Map<string, string> {
  const cases = new Map<string, string>();
  const selector = /(=\d+|\w+)\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = selector.exec(body)) !== null) {
    const open = match.index + match[0].length - 1;
    const close = closingBrace(body, open);
    if (close === -1) break;

    cases.set(match[1], body.slice(open + 1, close));
    // Past the whole case body, so a `word {` inside it is never read as the
    // next selector.
    selector.lastIndex = close + 1;
  }

  return cases;
}
