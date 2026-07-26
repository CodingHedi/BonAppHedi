import { Injectable, inject } from '@angular/core';
import { LOCALES, type Locale } from '../core/i18n/locale';
import type { AdminApi } from '../core/api/admin-api';
import type {
  AdminRecipeRow,
  AdminStats,
  AdminTopRecipe,
  ModerationItem,
  RecipeDraft,
  RecipeStatus,
} from '../core/api/models';
import { RecipeStore } from './recipe-store';
import { SocialStore } from './social-store';
import type { SeedRecipe } from './seed-data';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => sleep(120 + Math.random() * 200);

/**
 * The admin half of the mock backend.
 *
 * Its real job is translation, in both directions, between how a recipe is
 * *stored* — one language-neutral record with a per-locale map, shaped like the
 * database — and how it is *edited*, which is the same thing minus everything
 * an author does not own.
 *
 * That asymmetry is the interesting part. `save` deliberately reads the existing
 * record and carries forward its ratings, reaction count, publication date and
 * hero copy, because a draft does not contain them. Spreading the draft over
 * the record without that step would silently reset every recipe's score the
 * first time somebody fixed a typo.
 */
@Injectable()
export class MockAdminApi implements AdminApi {
  private readonly store = inject(RecipeStore);
  private readonly social = inject(SocialStore);

  async recipes(locale: Locale): Promise<readonly AdminRecipeRow[]> {
    await latency();
    return this.store.all().map((recipe) => this.toRow(recipe, locale));
  }

  async draft(key: string): Promise<RecipeDraft | null> {
    await latency();

    const recipe = this.store.byKey(key);
    return recipe ? this.toDraft(recipe) : null;
  }

  async blank(): Promise<RecipeDraft> {
    await latency();

    const empty = <T>(make: () => T): Record<Locale, T> =>
      Object.fromEntries(LOCALES.map((locale) => [locale, make()])) as Record<Locale, T>;

    return {
      key: '',
      status: 'DRAFT',
      tagKeys: [],
      prepMinutes: null,
      cookMinutes: null,
      difficulty: 1,
      baseServings: 2,
      youtubeVideoId: null,
      ingredients: [
        {
          baseQuantity: null,
          unit: 'g',
          scalable: true,
          t: empty(() => ({ name: '', note: null })),
        },
      ],
      steps: [
        {
          durationMinutes: null,
          videoOffsetSeconds: null,
          t: empty(() => ({ body: '' })),
        },
      ],
      t: empty(() => ({ slug: '', title: '', excerpt: '', bodyMarkdown: '' })),
    };
  }

  async save(draft: RecipeDraft): Promise<void> {
    await latency();

    const key = draft.key.trim();
    if (!key) throw new Error('a recipe needs a key');

    const existing = this.store.byKey(key);

    this.store.save({
      key,
      status: draft.status,
      tagKeys: [...draft.tagKeys],
      prepMinutes: draft.prepMinutes,
      cookMinutes: draft.cookMinutes,
      difficulty: draft.difficulty,
      baseServings: draft.baseServings,
      youtubeVideoId: draft.youtubeVideoId,

      // Not authored, so carried forward rather than taken from the draft. A
      // new recipe starts at zero and dated now.
      publishedAt: existing?.publishedAt ?? new Date().toISOString(),
      featuredRank: existing?.featuredRank,
      ratingSum: existing?.ratingSum ?? 0,
      ratingCount: existing?.ratingCount ?? 0,
      reactionCount: existing?.reactionCount ?? 0,

      ingredients: draft.ingredients.map((ingredient) => ({
        baseQuantity: ingredient.baseQuantity,
        unit: ingredient.unit,
        scalable: ingredient.scalable,
        t: this.perLocale((locale) => ({
          name: ingredient.t[locale].name,
          note: ingredient.t[locale].note ?? undefined,
        })),
      })),

      steps: draft.steps.map((step) => ({
        durationMinutes: step.durationMinutes,
        videoOffsetSeconds: step.videoOffsetSeconds,
        t: this.perLocale((locale) => ({ body: step.t[locale].body })),
      })),

      t: this.perLocale((locale) => ({
        slug: draft.t[locale].slug,
        title: draft.t[locale].title,
        excerpt: draft.t[locale].excerpt,
        bodyMarkdown: draft.t[locale].bodyMarkdown,
        // Hero copy is not in the editor, so it must survive a save rather than
        // be blanked by omission.
        heroKicker: existing?.t[locale]?.heroKicker,
        heroExcerpt: existing?.t[locale]?.heroExcerpt,
      })),
    });
  }

  async setStatus(key: string, status: RecipeStatus): Promise<void> {
    await latency();
    this.store.setStatus(key, status);
  }

  async pending(locale: Locale): Promise<readonly ModerationItem[]> {
    await latency();

    return this.social.awaitingModeration().map(({ comment, recipeKey }) => ({
      comment,
      recipeKey,
      recipeTitle: this.titleOf(recipeKey, locale),
    }));
  }

  async moderate(id: number, approve: boolean): Promise<void> {
    await latency();

    // Rejected comments are deleted rather than kept in a REJECTED state. There
    // is no screen that would ever show one, and keeping a stranger's rejected
    // remark on file is a data-retention question nobody needs to answer.
    if (approve) this.social.setCommentStatus(id, 'PUBLISHED');
    else this.social.deleteComment(id);
  }

  async stats(locale: Locale): Promise<AdminStats> {
    await latency();

    const totals = this.social.totals();
    const byStatus: Record<RecipeStatus, number> = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
    for (const recipe of this.store.all()) byStatus[this.store.statusOf(recipe)] += 1;

    const top: AdminTopRecipe[] = this.store
      .all()
      .map((recipe) => ({
        key: recipe.key,
        title: this.titleOf(recipe.key, locale),
        ratingAverage: this.social.ratingFor(recipe.key).average,
        ratingCount: this.social.ratingCountFor(recipe.key),
        commentCount: this.social.commentCountFor(recipe.key),
      }))
      // Unrated recipes sort last rather than tying at zero with a bad one:
      // "no score yet" and "scored badly" are different facts.
      .filter((row) => row.ratingCount > 0)
      .sort((a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount)
      .slice(0, 5);

    return {
      recipes: byStatus,
      comments: { total: totals.comments, pending: totals.pending },
      ratings: { count: totals.ratingCount, average: totals.ratingAverage },
      reactions: totals.reactions,
      top,
    };
  }

  // --- internals -------------------------------------------------------------

  private perLocale<T>(make: (locale: Locale) => T): Record<Locale, T> {
    return Object.fromEntries(LOCALES.map((locale) => [locale, make(locale)])) as Record<Locale, T>;
  }

  /** Falls back across languages so an untranslated recipe still has a label. */
  private titleOf(key: string, locale: Locale): string {
    const recipe = this.store.byKey(key);
    if (!recipe) return key;

    return recipe.t[locale]?.title || LOCALES.map((l) => recipe.t[l]?.title).find(Boolean) || key;
  }

  private toRow(recipe: SeedRecipe, locale: Locale): AdminRecipeRow {
    return {
      key: recipe.key,
      title: this.titleOf(recipe.key, locale),
      status: this.store.statusOf(recipe),
      publishedAt: recipe.publishedAt,
      translated: LOCALES.filter((l) => Boolean(recipe.t[l]?.title)),
      ratingCount: this.social.ratingCountFor(recipe.key),
      commentCount: this.social.commentCountFor(recipe.key),
    };
  }

  private toDraft(recipe: SeedRecipe): RecipeDraft {
    return {
      key: recipe.key,
      status: this.store.statusOf(recipe),
      tagKeys: [...recipe.tagKeys],
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      difficulty: recipe.difficulty,
      baseServings: recipe.baseServings,
      youtubeVideoId: recipe.youtubeVideoId,
      ingredients: recipe.ingredients.map((ingredient) => ({
        baseQuantity: ingredient.baseQuantity,
        unit: ingredient.unit,
        scalable: ingredient.scalable ?? true,
        t: this.perLocale((locale) => ({
          name: ingredient.t[locale]?.name ?? '',
          note: ingredient.t[locale]?.note ?? null,
        })),
      })),
      steps: recipe.steps.map((step) => ({
        durationMinutes: step.durationMinutes,
        videoOffsetSeconds: step.videoOffsetSeconds,
        t: this.perLocale((locale) => ({ body: step.t[locale]?.body ?? '' })),
      })),
      t: this.perLocale((locale) => ({
        slug: recipe.t[locale]?.slug ?? '',
        title: recipe.t[locale]?.title ?? '',
        excerpt: recipe.t[locale]?.excerpt ?? '',
        bodyMarkdown: recipe.t[locale]?.bodyMarkdown ?? '',
      })),
    };
  }
}
