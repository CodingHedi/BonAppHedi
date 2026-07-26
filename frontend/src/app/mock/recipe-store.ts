import { Injectable } from '@angular/core';
import type { Locale } from '../core/i18n/locale';
import type { RecipeStatus } from '../core/api/models';
import { SEED_RECIPES, type SeedRecipe } from './seed-data';

/**
 * The recipes, as mutable state.
 *
 * `SEED_RECIPES` is a frozen literal, which was right while the app could only
 * read. The admin area writes, so the recipes need somewhere to live that an
 * edit can change — and both mock APIs have to read from that same place, or
 * editing a title in the admin area would leave the public page showing the old
 * one and the whole editor would be a fiction.
 *
 * State is per page load, exactly like SocialStore: nothing here is persisted,
 * because nothing here has a server. Tests get a clean slate on every `goto`.
 *
 * Slug resolution lives here rather than in SocialStore because a slug is
 * recipe knowledge. It also has to survive an edit: rename a recipe's slug in
 * the editor and the comments on it must still resolve.
 */
@Injectable({ providedIn: 'root' })
export class RecipeStore {
  /** Structured-cloned so an edit cannot reach back into the frozen seed. */
  private recipes: SeedRecipe[] = SEED_RECIPES.map((recipe) => structuredClone(recipe));

  /** Everything, drafts included. Only the admin area should call this. */
  all(): readonly SeedRecipe[] {
    return this.recipes;
  }

  /**
   * What the public site may see. A recipe has to be published *and* actually
   * translated into the language being asked for — otherwise the English site
   * quietly fills up with French cards, which reads as a bug rather than as a
   * partial translation.
   */
  published(locale: Locale): readonly SeedRecipe[] {
    return this.recipes.filter(
      (recipe) => this.statusOf(recipe) === 'PUBLISHED' && Boolean(recipe.t[locale]?.title),
    );
  }

  byKey(key: string): SeedRecipe | null {
    return this.recipes.find((recipe) => recipe.key === key) ?? null;
  }

  /** Null when no recipe has that slug in that language, which is a 404. */
  keyForSlug(slug: string, locale: Locale): string | null {
    return this.recipes.find((recipe) => recipe.t[locale].slug === slug)?.key ?? null;
  }

  /** Resolves only published recipes, so a draft's URL is a 404 to the public. */
  publishedBySlug(slug: string, locale: Locale): SeedRecipe | null {
    return this.published(locale).find((recipe) => recipe.t[locale].slug === slug) ?? null;
  }

  statusOf(recipe: SeedRecipe): RecipeStatus {
    return recipe.status ?? 'PUBLISHED';
  }

  setStatus(key: string, status: RecipeStatus): void {
    this.recipes = this.recipes.map((recipe) =>
      recipe.key === key ? { ...recipe, status } : recipe,
    );
  }

  /** Replaces a recipe wholesale. Creating one is the same call with a new key. */
  save(recipe: SeedRecipe): void {
    const index = this.recipes.findIndex((candidate) => candidate.key === recipe.key);
    if (index === -1) this.recipes = [...this.recipes, recipe];
    else this.recipes = this.recipes.map((candidate, i) => (i === index ? recipe : candidate));
  }
}
