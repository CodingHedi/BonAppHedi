import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {
  DEFAULT_LOCALE,
  type Locale,
  type RouteKey,
  SEGMENTS,
  isLocale,
  localeFromPath,
  negotiateLocale,
} from './locale';

const STORAGE_KEY = 'bah-locale';

/**
 * Owns "which language are we in" for the whole app.
 *
 * The URL is the source of truth — not this service. A locale change is a
 * navigation, not a state mutation, which is what makes every page in both
 * languages independently linkable, bookmarkable and crawlable.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);

  private readonly current = signal<Locale>(DEFAULT_LOCALE);

  readonly locale = this.current.asReadonly();
  readonly other = computed<Locale>(() => (this.current() === 'fr' ? 'en' : 'fr'));

  /** Called once at bootstrap, before the router resolves the first route. */
  init(): void {
    const fromUrl = localeFromPath(this.document.location.pathname);
    this.apply(fromUrl ?? this.preferred());
  }

  /** The locale to send someone who arrived at a URL with no prefix at all. */
  preferred(): Locale {
    return negotiateLocale(this.read(), this.document.defaultView?.navigator.languages ?? []);
  }

  /** Records a deliberate choice so a later visit to `/` lands in the same language. */
  remember(locale: Locale): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). The URL
      // still carries the locale, so this is a lost convenience, not a bug.
    }
  }

  apply(locale: Locale): void {
    this.current.set(locale);
    this.transloco.setActiveLang(locale);
    this.document.documentElement.setAttribute('lang', locale);
  }

  /** `segment('recipes')` → `'recettes'` in French, `'recipes'` in English. */
  segment(key: RouteKey, locale: Locale = this.current()): string {
    return SEGMENTS[locale][key];
  }

  /** Builds a router link array, e.g. `['/fr', 'recettes', 'babka-au-chocolat']`. */
  link(parts: readonly (string | number)[] = [], locale: Locale = this.current()): unknown[] {
    return [`/${locale}`, ...parts];
  }

  recipeLink(slug: string, locale: Locale = this.current()): unknown[] {
    return this.link([this.segment('recipes', locale), slug], locale);
  }

  private read(): string | null {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY) ?? null;
      return isLocale(stored) ? stored : null;
    } catch {
      return null;
    }
  }
}
