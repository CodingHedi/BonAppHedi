/**
 * The API contract.
 *
 * These types are the agreement between the mock services (milestone 1) and the
 * Spring Boot API (milestone 2). The backend must produce JSON that is
 * field-for-field assignable to these interfaces — that is the acceptance test
 * for the swap, not a nice-to-have.
 *
 * Everything here is already resolved to a single locale. The client never sees
 * a translation map: the server picks the language from the request and returns
 * one version. Only the admin write payloads carry every locale at once.
 */

import type { Locale } from '../i18n/locale';

export type Difficulty = 1 | 2 | 3;
export type TagVariant = 'accent' | 'accent2';
export type RecipeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type SortOrder = 'recent' | 'oldest';

export interface Tag {
  readonly slug: string;
  readonly label: string;
  /** Drives .tag--accent vs .tag--accent2. Data, not presentation logic. */
  readonly colorVariant: TagVariant;
  readonly count?: number;
}

export interface Author {
  readonly slug: string;
  /** A proper noun: never translated. */
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly bio?: string;
}

export interface ImageRef {
  /** Null until real photography exists, which is the current state. */
  readonly url: string | null;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  /** Average colour, used to tint the placeholder so it does not read as broken. */
  readonly dominant?: string;
}

export interface RatingSummary {
  readonly average: number;
  readonly count: number;
  /** What this visitor gave, if anything. Null for a first-time reader. */
  readonly yourRating: number | null;
}

/** The same recipe's slug in the other language, so the switcher can navigate. */
export interface LocaleAlternate {
  readonly locale: Locale;
  readonly slug: string;
}

export interface RecipeSummary {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly image: ImageRef;
  readonly tags: readonly Tag[];
  readonly author: Author;
  /** ISO-8601 UTC. Formatted client-side so it stays correct as time passes. */
  readonly publishedAt: string;
  readonly prepMinutes: number | null;
  readonly cookMinutes: number | null;
  readonly difficulty: Difficulty;
  readonly rating: { readonly average: number; readonly count: number };
  /**
   * Precomputed haystack for client-side search: title, excerpt, tag labels and
   * ingredient names concatenated.
   *
   * Exists so the browser can search ingredients ("which recipe uses saffron?")
   * without the list endpoint shipping every ingredient row for every card. The
   * server builds it on write; the client only folds and matches against it.
   */
  readonly searchText: string;
}

export interface HeroSlide {
  readonly slug: string;
  readonly kicker: string;
  readonly title: string;
  /** Deliberately separate from the card excerpt: the hero copy is longer. */
  readonly excerpt: string;
  readonly image: ImageRef;
}

export interface Ingredient {
  readonly id: number;
  readonly position: number;
  readonly name: string;
  readonly baseQuantity: number | null;
  /** Unit key ('g', 'ml', 'pc'), not a label. Labels are localized in the UI. */
  readonly unit: string;
  readonly note: string | null;
  /** False for things like "salt, a pinch" that must not multiply. */
  readonly scalable: boolean;
}

export interface Step {
  readonly id: number;
  readonly position: number;
  readonly body: string;
  readonly durationMinutes: number | null;
  /** Offset into the recipe video, driving the (mm:ss) jump links. */
  readonly videoOffsetSeconds: number | null;
}

export interface RecipeDetail extends RecipeSummary {
  readonly bodyMarkdown: string;
  /** Server-rendered and sanitized in M2. Empty in M1, where the client renders. */
  readonly bodyHtml: string;
  /** The serving count the stored quantities are expressed for. */
  readonly baseServings: number;
  readonly youtubeVideoId: string | null;
  readonly ingredients: readonly Ingredient[];
  readonly steps: readonly Step[];
  readonly rating: RatingSummary;
  readonly reactions: { readonly count: number; readonly reacted: boolean };
  readonly commentCount: number;
  readonly alternates: readonly LocaleAlternate[];
}

export interface RecipeQuery {
  readonly locale: Locale;
  readonly query?: string;
  readonly tag?: string | null;
  readonly author?: string | null;
  readonly sort?: SortOrder;
  readonly page?: number;
  readonly size?: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}
