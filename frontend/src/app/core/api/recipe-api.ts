import { InjectionToken } from '@angular/core';
import type { Locale } from '../i18n/locale';
import type {
  Author,
  HeroSlide,
  Page,
  RecipeDetail,
  RecipeQuery,
  RecipeSummary,
  Tag,
} from './models';

/**
 * Everything the public site needs to read recipes.
 *
 * Promise-based rather than Observable: each of these is a single request with
 * a single answer, which is what `resource()` consumes, and it keeps the RxJS
 * surface out of components that have no use for it.
 */
export interface RecipeApi {
  list(query: RecipeQuery): Promise<Page<RecipeSummary>>;
  featured(locale: Locale): Promise<readonly HeroSlide[]>;
  /** Null rather than a throw: "no such recipe" is a 404 page, not an error state. */
  bySlug(slug: string, locale: Locale): Promise<RecipeDetail | null>;
  tags(locale: Locale): Promise<readonly Tag[]>;
  authors(): Promise<readonly Author[]>;
}

/**
 * The M1 → M2 seam. Components inject this token and never learn whether they
 * got the mock or the HTTP implementation; milestone 2 rebinds it in
 * app.config.ts and nothing else changes.
 */
export const RECIPE_API = new InjectionToken<RecipeApi>('RecipeApi');
