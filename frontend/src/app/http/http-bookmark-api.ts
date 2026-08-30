import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BookmarkApi } from '../core/api/bookmark-api';
import type { Locale } from '../core/i18n/locale';

/**
 * Saved recipes over HTTP.
 *
 * Session cookie and `X-XSRF-TOKEN` are arranged by `withXsrfConfiguration` in
 * app.config.ts, exactly as for the other write API — there is no header
 * plumbing here for the same reason there is none in `HttpSocialApi`.
 *
 * PUT throughout, including for the merge, because both are idempotent: saving
 * an already-saved recipe changes nothing, and merging a list is a union, so a
 * client that retries after a dropped connection cannot make a mess.
 */
@Injectable()
export class HttpBookmarkApi implements BookmarkApi {
  private readonly http = inject(HttpClient);

  async list(): Promise<readonly string[]> {
    return firstValueFrom(this.http.get<string[]>('/api/auth/bookmarks'));
  }

  async merge(keys: readonly string[]): Promise<readonly string[]> {
    return firstValueFrom(this.http.put<string[]>('/api/auth/bookmarks', { keys }));
  }

  async set(slug: string, bookmarked: boolean, locale: Locale): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(
        `/api/recipes/${encodeURIComponent(slug)}/bookmark`,
        { bookmarked },
        { params: { locale } },
      ),
    );
  }
}
