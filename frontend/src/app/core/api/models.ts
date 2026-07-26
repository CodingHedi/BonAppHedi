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

// --- Identity ----------------------------------------------------------------

/**
 * Which OAuth providers exist is configuration, not code (ADR 0003). The server
 * only returns the ones it holds credentials for, so adding Facebook later is a
 * config change and a restart — the UI renders whatever arrives and has no
 * provider list of its own.
 */
export type ProviderId = 'google' | 'facebook';

export interface AuthProvider {
  readonly id: ProviderId;
  /** A brand name: never translated. */
  readonly label: string;
}

export interface AuthUser {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  /** Drives access to the admin area. Asserted server-side too — this is UI only. */
  readonly isAdmin: boolean;
}

// --- Social ------------------------------------------------------------------

/**
 * PENDING exists because comments are moderated. The author still sees their own
 * pending comment — silently swallowing it reads as a broken form and gets the
 * same thing posted three more times.
 */
export type CommentStatus = 'PUBLISHED' | 'PENDING' | 'REJECTED';

/** Deliberately not `Author`: a commenter has no slug, no bio and no page. */
export interface CommentAuthor {
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface Comment {
  readonly id: number;
  readonly author: CommentAuthor;
  readonly bodyMarkdown: string;
  /** Server-rendered and sanitized in M2. Empty in M1, where the client renders. */
  readonly bodyHtml: string;
  readonly createdAt: string;
  readonly status: CommentStatus;
  /** Whether the signed-in visitor wrote it, so the UI can offer to delete it. */
  readonly mine: boolean;
}

export interface ReactionState {
  readonly count: number;
  readonly reacted: boolean;
}

// --- Admin -------------------------------------------------------------------

/**
 * The write side of a recipe.
 *
 * This is the one place in the contract that carries every language at once.
 * Everything the public site reads is already resolved to a single locale,
 * because a reader wants one; an author is writing both and needs to see them
 * together, which is what the editor's locale tabs are for.
 *
 * Read-only facts a recipe accumulates — its rating totals, its reaction count,
 * when it was first published — are deliberately absent. They are not authored,
 * so a save must not be able to overwrite them.
 */
export interface TranslationDraft {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly bodyMarkdown: string;
}

export interface IngredientDraft {
  readonly baseQuantity: number | null;
  readonly unit: string;
  readonly scalable: boolean;
  readonly t: Record<Locale, { readonly name: string; readonly note: string | null }>;
}

export interface StepDraft {
  readonly durationMinutes: number | null;
  readonly videoOffsetSeconds: number | null;
  readonly t: Record<Locale, { readonly body: string }>;
}

export interface RecipeDraft {
  readonly key: string;
  readonly status: RecipeStatus;
  readonly tagKeys: readonly string[];
  readonly prepMinutes: number | null;
  readonly cookMinutes: number | null;
  readonly difficulty: Difficulty;
  readonly baseServings: number;
  readonly youtubeVideoId: string | null;
  readonly ingredients: readonly IngredientDraft[];
  readonly steps: readonly StepDraft[];
  readonly t: Record<Locale, TranslationDraft>;
}

/** A row in the admin's recipe table. Drafts included — that is the point. */
export interface AdminRecipeRow {
  readonly key: string;
  readonly title: string;
  readonly status: RecipeStatus;
  readonly publishedAt: string;
  /** Languages this recipe actually has a title in, so gaps are visible. */
  readonly translated: readonly Locale[];
  readonly ratingCount: number;
  readonly commentCount: number;
}

/** A comment awaiting a decision, carrying enough context to judge it. */
export interface ModerationItem {
  readonly comment: Comment;
  readonly recipeKey: string;
  readonly recipeTitle: string;
}

export interface AdminStats {
  readonly recipes: Record<RecipeStatus, number>;
  readonly comments: { readonly total: number; readonly pending: number };
  readonly ratings: { readonly count: number; readonly average: number };
  readonly reactions: number;
  readonly top: readonly AdminTopRecipe[];
}

export interface AdminTopRecipe {
  readonly key: string;
  readonly title: string;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly commentCount: number;
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
