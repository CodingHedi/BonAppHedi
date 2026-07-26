import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SocialApi } from '../core/api/social-api';
import type { Comment, RatingSummary, ReactionState } from '../core/api/models';
import type { Locale } from '../core/i18n/locale';

/**
 * The write API over HTTP.
 *
 * Every call here is a mutation, and each one carries two things the reads do
 * not: the session cookie the browser sends on its own, and the `X-XSRF-TOKEN`
 * header Angular's HttpClient adds from the `XSRF-TOKEN` cookie. Neither is
 * arranged here — `withXsrfConfiguration` in app.config.ts already matches
 * Spring's `CookieCsrfTokenRepository` defaults, which is why this file contains
 * no interceptor and no header plumbing at all.
 *
 * PUT for rating and reacting because both are idempotent replacements on the
 * server, and a retry after a dropped connection must not count twice.
 */
@Injectable()
export class HttpSocialApi implements SocialApi {
  private readonly http = inject(HttpClient);

  async rate(slug: string, stars: number, locale: Locale): Promise<RatingSummary> {
    return firstValueFrom(
      this.http.put<RatingSummary>(`${this.recipe(slug)}/rating`, { stars }, { params: { locale } }),
    );
  }

  async react(slug: string, reacted: boolean, locale: Locale): Promise<ReactionState> {
    return firstValueFrom(
      this.http.put<ReactionState>(
        `${this.recipe(slug)}/reaction`,
        { reacted },
        { params: { locale } },
      ),
    );
  }

  async comments(slug: string, locale: Locale): Promise<readonly Comment[]> {
    return firstValueFrom(
      this.http.get<Comment[]>(`${this.recipe(slug)}/comments`, { params: { locale } }),
    );
  }

  /**
   * Returns what the server created, not what was sent. Moderation is its
   * decision, so the comment may come back PENDING — assuming PUBLISHED here
   * would show the author a state the site does not actually have.
   */
  async addComment(slug: string, bodyMarkdown: string, locale: Locale): Promise<Comment> {
    return firstValueFrom(
      this.http.post<Comment>(
        `${this.recipe(slug)}/comments`,
        { bodyMarkdown },
        { params: { locale } },
      ),
    );
  }

  /** No locale: a comment has one id across both languages, unlike a recipe. */
  async deleteComment(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/comments/${id}`));
  }

  /** Slugs are locale-scoped and arrive from the URL, so they are encoded once here. */
  private recipe(slug: string): string {
    return `/api/recipes/${encodeURIComponent(slug)}`;
  }
}
