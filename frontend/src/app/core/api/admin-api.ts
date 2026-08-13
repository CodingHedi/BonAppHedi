import { InjectionToken } from '@angular/core';
import type { Locale } from '../i18n/locale';
import type {
  AdminPhoto,
  AdminRecipeRow,
  AdminStats,
  ModerationItem,
  RecipeDraft,
  RecipeStatus,
} from './models';

/**
 * Authoring, moderation and the numbers behind them.
 *
 * Everything here is admin-only, and the guard in front of the route is a
 * convenience rather than the enforcement. Milestone 2 checks the session's role
 * on every one of these endpoints server-side; a browser deciding it is allowed
 * to do something is a suggestion, not a permission.
 *
 * `locale` on the read methods is a display concern only — it picks which
 * language a title is shown in, and never which recipes come back. The admin
 * sees every recipe regardless of what it has been translated into, since
 * finding the untranslated ones is half the job.
 */
export interface AdminApi {
  recipes(locale: Locale): Promise<readonly AdminRecipeRow[]>;

  /** Null for an unknown key, which is a 404 inside the editor. */
  draft(key: string): Promise<RecipeDraft | null>;

  /**
   * An empty recipe, already shaped: both locales present, one blank ingredient
   * and one blank step. Starting from a truly empty object would make the
   * editor's first job be "add a row" rather than "write something".
   */
  blank(): Promise<RecipeDraft>;

  /** Creates when the key is new, replaces when it is not. */
  save(draft: RecipeDraft): Promise<void>;

  setStatus(key: string, status: RecipeStatus): Promise<void>;

  /**
   * Replaces the recipe's photograph, because a recipe has one.
   *
   * The server decides what is an image — the file's name and type are both
   * written here and neither is believed — so a rejection is a normal outcome
   * rather than a bug, and the editor has to be able to say why.
   */
  uploadPhoto(key: string, file: File): Promise<AdminPhoto>;

  /** Back to the generated placeholder panel. */
  removePhoto(key: string): Promise<void>;

  pending(locale: Locale): Promise<readonly ModerationItem[]>;

  /** Approving publishes the comment; rejecting removes it from the site. */
  moderate(id: number, approve: boolean): Promise<void>;

  stats(locale: Locale): Promise<AdminStats>;
}

export const ADMIN_API = new InjectionToken<AdminApi>('AdminApi');
