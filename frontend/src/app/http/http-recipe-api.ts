import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RecipeApi } from '../core/api/recipe-api';
import type {
  Author,
  HeroSlide,
  Page,
  RecipeDetail,
  RecipeQuery,
  RecipeSummary,
  Tag,
} from '../core/api/models';
import type { Locale } from '../core/i18n/locale';
import { matchesQuery } from '../shared/text';

/**
 * The read API over HTTP.
 *
 * Same-origin in every environment, so the paths are relative and there is no
 * base URL to configure: in development the Angular dev server proxies `/api` to
 * :8080, and in production the two are served from one origin. That is also what
 * makes session cookies workable at all (ADR 0003).
 */
@Injectable()
export class HttpRecipeApi implements RecipeApi {
  private readonly http = inject(HttpClient);

  /**
   * Filtering by tag, author and order is the server's job; filtering by the
   * search box is not.
   *
   * `searchText` exists on every summary precisely so the browser can search
   * ingredient names without the list endpoint shipping every ingredient row for
   * every card. Sending the query to the server instead would either mean
   * shipping them anyway or a second round trip per keystroke.
   */
  async list(query: RecipeQuery): Promise<Page<RecipeSummary>> {
    let params = new HttpParams().set('locale', query.locale);
    if (query.tag) params = params.set('tag', query.tag);
    if (query.author) params = params.set('author', query.author);
    if (query.sort) params = params.set('sort', query.sort);

    const page = await firstValueFrom(
      this.http.get<Page<RecipeSummary>>('/api/recipes', { params }),
    );

    const term = query.query?.trim();
    if (!term) return page;

    const items = page.items.filter((item) => matchesQuery([item.searchText], term));
    return { items, page: 0, size: items.length, total: items.length };
  }

  async featured(locale: Locale): Promise<readonly HeroSlide[]> {
    return firstValueFrom(
      this.http.get<HeroSlide[]>('/api/recipes/featured', { params: { locale } }),
    );
  }

  /**
   * Null rather than a throw, because "no such recipe" is a 404 page and not an
   * error state. The server answers 404 for an unknown slug, a draft and a slug
   * belonging to the other language alike, and the difference is deliberately
   * not visible from here either.
   */
  async bySlug(slug: string, locale: Locale): Promise<RecipeDetail | null> {
    try {
      return await firstValueFrom(
        this.http.get<RecipeDetail>(`/api/recipes/${encodeURIComponent(slug)}`, {
          params: { locale },
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return null;
      throw error;
    }
  }

  async tags(locale: Locale): Promise<readonly Tag[]> {
    return firstValueFrom(this.http.get<Tag[]>('/api/tags', { params: { locale } }));
  }

  async authors(): Promise<readonly Author[]> {
    return firstValueFrom(this.http.get<Author[]>('/api/authors'));
  }
}
