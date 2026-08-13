import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AdminApi } from '../core/api/admin-api';
import type {
  AdminPhoto,
  AdminRecipeRow,
  AdminStats,
  ModerationItem,
  RecipeDraft,
  RecipeStatus,
} from '../core/api/models';
import type { Locale } from '../core/i18n/locale';

/**
 * The admin area over HTTP.
 *
 * Every path here is under `/api/admin`, which the server guards as a whole with
 * a single ROLE_ADMIN rule. The route guard in front of these screens decides
 * what the UI offers and enforces nothing — a 403 from any of these is the real
 * answer, and it is the one that matters.
 *
 * `locale` is a display concern throughout: it picks the language a title is
 * shown in and never which recipes come back. An admin sees drafts, archived
 * recipes and untranslated ones, because finding those is the job.
 */
@Injectable()
export class HttpAdminApi implements AdminApi {
  private readonly http = inject(HttpClient);

  async recipes(locale: Locale): Promise<readonly AdminRecipeRow[]> {
    return firstValueFrom(
      this.http.get<AdminRecipeRow[]>('/api/admin/recipes', { params: { locale } }),
    );
  }

  /** Null for an unknown key, which the editor renders as its own 404. */
  async draft(key: string): Promise<RecipeDraft | null> {
    try {
      return await firstValueFrom(
        this.http.get<RecipeDraft>(`/api/admin/recipes/${encodeURIComponent(key)}`),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * Asked of the server rather than built here, so that what "empty" means —
   * both locales present, one blank ingredient, one blank step — has one
   * definition. Two copies of that shape would drift, and the drift would show
   * up as a save that fails validation for reasons the editor cannot explain.
   */
  async blank(): Promise<RecipeDraft> {
    return firstValueFrom(this.http.get<RecipeDraft>('/api/admin/recipes/blank'));
  }

  /** Creates when the key is new, replaces when it is not: one button, either way. */
  async save(draft: RecipeDraft): Promise<void> {
    await firstValueFrom(this.http.put<void>('/api/admin/recipes', draft));
  }

  async setStatus(key: string, status: RecipeStatus): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`/api/admin/recipes/${encodeURIComponent(key)}/status`, { status }),
    );
  }

  /**
   * `FormData` and no `Content-Type` header, deliberately. Setting it by hand
   * is the classic way to break a multipart request: the boundary is generated
   * with the body, so a hand-written `multipart/form-data` arrives without one
   * and the server parses nothing. Leaving it unset lets the browser write
   * both.
   */
  async uploadPhoto(key: string, file: File): Promise<AdminPhoto> {
    const body = new FormData();
    body.append('file', file);

    return firstValueFrom(
      this.http.put<AdminPhoto>(`/api/admin/recipes/${encodeURIComponent(key)}/photo`, body),
    );
  }

  async removePhoto(key: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/admin/recipes/${encodeURIComponent(key)}/photo`),
    );
  }

  async pending(locale: Locale): Promise<readonly ModerationItem[]> {
    return firstValueFrom(
      this.http.get<ModerationItem[]>('/api/admin/comments/pending', { params: { locale } }),
    );
  }

  /** Approving publishes the comment; rejecting removes it from the site. */
  async moderate(id: number, approve: boolean): Promise<void> {
    await firstValueFrom(this.http.post<void>(`/api/admin/comments/${id}/moderate`, { approve }));
  }

  async stats(locale: Locale): Promise<AdminStats> {
    return firstValueFrom(this.http.get<AdminStats>('/api/admin/stats', { params: { locale } }));
  }
}
