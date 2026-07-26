import { InjectionToken } from '@angular/core';
import type { Locale } from '../i18n/locale';
import type { Comment, RatingSummary, ReactionState } from './models';

/**
 * Everything a visitor can *write* about a recipe.
 *
 * Kept separate from `RecipeApi` rather than bolted onto it, because the two
 * have different shapes in milestone 2: recipe reads are cacheable and
 * anonymous, whereas every call here is a mutation carrying a session cookie and
 * an XSRF header. Splitting them keeps that distinction visible at the seam
 * instead of hiding it inside one grab-bag interface.
 *
 * Slugs are locale-scoped (`babka-au-chocolat` vs `chocolate-babka`), so every
 * call takes the locale it was resolved in. The server needs it to find the row;
 * it is not a display concern.
 */
export interface SocialApi {
  /**
   * Ratings are one-per-visitor and idempotent: rating again replaces the
   * previous score rather than adding a second one. Returns the recomputed
   * summary so the UI never has to guess what the new average became.
   */
  rate(slug: string, stars: number, locale: Locale): Promise<RatingSummary>;

  /** Toggling off is the same call with `reacted: false`, so it stays idempotent. */
  react(slug: string, reacted: boolean, locale: Locale): Promise<ReactionState>;

  comments(slug: string, locale: Locale): Promise<readonly Comment[]>;

  /**
   * Requires a session. Returns the created comment — which may come back
   * PENDING, since moderation is the server's decision and not the client's to
   * assume.
   */
  addComment(slug: string, bodyMarkdown: string, locale: Locale): Promise<Comment>;

  deleteComment(id: number): Promise<void>;
}

/**
 * The M1 → M2 seam for writes. Milestone 2 rebinds this to an HTTP
 * implementation in app.config.ts and no component changes.
 */
export const SOCIAL_API = new InjectionToken<SocialApi>('SocialApi');
