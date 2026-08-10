import { Injectable, signal } from '@angular/core';
import type { LocaleAlternate } from '../api/models';
import type { Locale } from './locale';

/**
 * Carries "this page is also that URL in the other language" from a page to the
 * header's language button.
 *
 * The header can translate route *segments* on its own — `recettes` becomes
 * `recipes` — because those are in the locale tables. It cannot translate a
 * recipe **slug**: slugs live in the database, and `babka-au-chocolat` is
 * `chocolate-babka` only because a row says so. So the page that knows supplies
 * it, and the header asks.
 *
 * Without this the language button kept the current slug and produced
 * `/en/recipes/babka-au-chocolat` — a real route with a slug that does not
 * exist in that language, so it resolved to nothing and the visitor was told
 * the recipe was missing. The API had carried `alternates` end to end since M2
 * and nothing had ever read it.
 *
 * **Published against the slug it describes, and matched on the way out.** The
 * page sets this and the header only uses it when the URL it is leaving still
 * ends in that slug. That is what makes a stale entry harmless: navigate to a
 * page that publishes nothing and the last recipe's alternates are still held
 * here, but they no longer match the URL being translated, so they are ignored
 * rather than silently rewriting some other page's address.
 */
@Injectable({ providedIn: 'root' })
export class LocaleAlternatesService {
  private readonly current = signal<readonly LocaleAlternate[]>([]);

  publish(alternates: readonly LocaleAlternate[]): void {
    this.current.set(alternates);
  }

  clear(): void {
    this.current.set([]);
  }

  /**
   * The slug for `target`, but only if `slug` is genuinely the counterpart in
   * the language being left. Null means "no counterpart known", and the caller
   * should keep whatever segment it already had.
   */
  counterpart(slug: string, target: Locale): string | null {
    const known = this.current();
    if (!known.some((alternate) => alternate.slug === slug)) return null;

    return known.find((alternate) => alternate.locale === target)?.slug ?? null;
  }
}
