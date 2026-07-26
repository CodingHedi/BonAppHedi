import { Injectable, inject } from '@angular/core';
import type { Locale } from '../core/i18n/locale';
import { LOCALES } from '../core/i18n/locale';
import type { RecipeApi } from '../core/api/recipe-api';
import type {
  Author,
  HeroSlide,
  ImageRef,
  LocaleAlternate,
  Page,
  RecipeDetail,
  RecipeQuery,
  RecipeSummary,
  Step,
  Tag,
  Ingredient,
} from '../core/api/models';
import { SEED_AUTHOR, SEED_RECIPES, SEED_TAGS, type SeedRecipe } from './seed-data';
import { matchesQuery } from '../shared/text';
import { SocialStore } from './social-store';

/**
 * Simulated network latency.
 *
 * Deliberately not zero: without it every loading state and skeleton in the app
 * is dead code that has never once been seen, and the first time anyone
 * observes them is in production against the real API.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => sleep(120 + Math.random() * 200);

@Injectable()
export class MockRecipeApi implements RecipeApi {
  /**
   * Shared with MockSocialApi so a rating or a reaction is reflected the next
   * time the recipe is read, instead of the page reporting the frozen seed
   * numbers back at someone who just changed them.
   */
  private readonly social = inject(SocialStore);

  async list(query: RecipeQuery): Promise<Page<RecipeSummary>> {
    await latency();

    const { locale, sort = 'recent' } = query;

    let items = SEED_RECIPES.filter((recipe) => this.publishedIn(recipe, locale)).map((recipe) =>
      this.toSummary(recipe, locale),
    );

    if (query.tag) {
      items = items.filter((item) => item.tags.some((tag) => tag.slug === query.tag));
    }
    if (query.author) {
      items = items.filter((item) => item.author.slug === query.author);
    }
    if (query.query?.trim()) {
      items = items.filter((item) => matchesQuery([item.searchText], query.query!));
    }

    items.sort((a, b) => {
      const delta = Date.parse(a.publishedAt) - Date.parse(b.publishedAt);
      return sort === 'oldest' ? delta : -delta;
    });

    return { items, page: 0, size: items.length, total: items.length };
  }

  async featured(locale: Locale): Promise<readonly HeroSlide[]> {
    await latency();

    return SEED_RECIPES.filter(
      (recipe) => recipe.featuredRank !== undefined && this.publishedIn(recipe, locale),
    )
      .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
      .map((recipe) => {
        const t = recipe.t[locale];
        return {
          slug: t.slug,
          kicker: t.heroKicker ?? '',
          title: t.title,
          excerpt: t.heroExcerpt ?? t.excerpt,
          image: this.image(recipe, locale),
        };
      });
  }

  async bySlug(slug: string, locale: Locale): Promise<RecipeDetail | null> {
    await latency();

    const recipe = SEED_RECIPES.find((candidate) => candidate.t[locale].slug === slug);
    if (!recipe) return null;

    const t = recipe.t[locale];

    const ingredients: Ingredient[] = recipe.ingredients.map((ingredient, index) => ({
      id: index + 1,
      position: index,
      name: ingredient.t[locale].name,
      baseQuantity: ingredient.baseQuantity,
      unit: ingredient.unit,
      note: ingredient.t[locale].note ?? null,
      scalable: ingredient.scalable ?? true,
    }));

    const steps: Step[] = recipe.steps.map((step, index) => ({
      id: index + 1,
      position: index,
      body: step.t[locale].body,
      durationMinutes: step.durationMinutes,
      videoOffsetSeconds: step.videoOffsetSeconds,
    }));

    const alternates: LocaleAlternate[] = LOCALES.map((other) => ({
      locale: other,
      slug: recipe.t[other].slug,
    }));

    return {
      ...this.toSummary(recipe, locale),
      bodyMarkdown: t.bodyMarkdown ?? '',
      // Empty by design in M1: with no server there is nothing to have rendered
      // and sanitized, so the client renders bodyMarkdown instead. M2 fills this.
      bodyHtml: '',
      baseServings: recipe.baseServings,
      youtubeVideoId: recipe.youtubeVideoId,
      ingredients,
      steps,
      rating: this.social.ratingFor(recipe.key),
      reactions: this.social.reactionFor(recipe.key),
      commentCount: this.social.commentCountFor(recipe.key),
      alternates,
    };
  }

  async tags(locale: Locale): Promise<readonly Tag[]> {
    await latency();

    const counts = new Map<string, number>();
    for (const recipe of SEED_RECIPES) {
      if (!this.publishedIn(recipe, locale)) continue;
      for (const key of recipe.tagKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return SEED_TAGS.filter((tag) => counts.has(tag.key)).map((tag) => ({
      slug: tag.t[locale].slug,
      label: tag.t[locale].label,
      colorVariant: tag.colorVariant,
      count: counts.get(tag.key) ?? 0,
    }));
  }

  async authors(): Promise<readonly Author[]> {
    await latency();
    return [this.author('fr')];
  }

  // --- internals -------------------------------------------------------------

  /**
   * A recipe is only listed in a language it has actually been translated into.
   * Otherwise the English site quietly fills up with French cards, which reads
   * as a bug rather than as a partial translation.
   */
  private publishedIn(recipe: SeedRecipe, locale: Locale): boolean {
    return Boolean(recipe.t[locale]?.title);
  }

  private toSummary(recipe: SeedRecipe, locale: Locale): RecipeSummary {
    const t = recipe.t[locale];
    const { average, count } = this.social.ratingFor(recipe.key);

    return {
      slug: t.slug,
      title: t.title,
      excerpt: t.excerpt,
      image: this.image(recipe, locale),
      tags: recipe.tagKeys.flatMap((key) => {
        const tag = SEED_TAGS.find((candidate) => candidate.key === key);
        return tag
          ? [{ slug: tag.t[locale].slug, label: tag.t[locale].label, colorVariant: tag.colorVariant }]
          : [];
      }),
      author: this.author(locale),
      publishedAt: recipe.publishedAt,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      difficulty: recipe.difficulty,
      rating: { average, count },
      searchText: [
        t.title,
        t.excerpt,
        ...recipe.tagKeys.map(
          (key) => SEED_TAGS.find((tag) => tag.key === key)?.t[locale].label ?? '',
        ),
        ...recipe.ingredients.map((ingredient) => ingredient.t[locale].name),
      ].join(' '),
    };
  }

  private author(locale: Locale): Author {
    return {
      slug: SEED_AUTHOR.slug,
      displayName: SEED_AUTHOR.displayName,
      avatarUrl: SEED_AUTHOR.avatarUrl,
      bio: SEED_AUTHOR.t[locale].bio,
    };
  }

  /** No photography exists yet, so every image is an alt text and a null URL. */
  private image(recipe: SeedRecipe, locale: Locale): ImageRef {
    return { url: null, alt: recipe.t[locale].title };
  }
}
