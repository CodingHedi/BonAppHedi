import { Injectable, inject } from '@angular/core';
import type { BookmarkApi } from '../core/api/bookmark-api';
import type { Locale } from '../core/i18n/locale';
import { MockAuthApi } from './mock-auth-api';
import { RecipeStore } from './recipe-store';

/** Simulated network latency, as every other mock in this directory defines it. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => sleep(120 + Math.random() * 200);

/**
 * Saved recipes, in memory, per mock account (ADR 16).
 *
 * <p>Keyed by the signed-in user rather than held as one list, because the
 * behaviour worth exercising in the suite is precisely the one that involves two
 * of them: a reader's bookmarks must not appear in somebody else's, and signing
 * out must not hand the next account the previous one's list.
 *
 * <p>The merge is a union here for the same reason it is one on the server, and
 * the mock has to agree — a suite that passed against a replacement would be
 * testing a contract the backend does not implement, which is worse than not
 * testing it.
 */
@Injectable({ providedIn: 'root' })
export class MockBookmarkApi implements BookmarkApi {
  private readonly auth = inject(MockAuthApi);
  private readonly recipes = inject(RecipeStore);

  private readonly byUser = new Map<string, string[]>();

  async list(): Promise<readonly string[]> {
    await latency();
    return [...(await this.mine())];
  }

  async merge(keys: readonly string[]): Promise<readonly string[]> {
    await latency();

    const mine = await this.mine();
    for (const key of keys) {
      // Unknown keys are dropped rather than refused: a stored list can outlive
      // a recipe, and the rest of it should still come back.
      if (this.recipes.all().some((recipe) => recipe.key === key) && !mine.includes(key)) {
        mine.push(key);
      }
    }

    return [...mine];
  }

  async set(slug: string, bookmarked: boolean, locale: Locale): Promise<void> {
    await latency();

    const key = this.recipes.keyForSlug(slug, locale);
    if (!key) throw new Error(`no recipe with slug "${slug}" in ${locale}`);

    const mine = await this.mine();
    const at = mine.indexOf(key);

    if (bookmarked && at < 0) mine.unshift(key);
    if (!bookmarked && at >= 0) mine.splice(at, 1);
  }

  /**
   * The signed-in reader's list, created on first use.
   *
   * Throws to nobody, mirroring the server's 401 — the service is what keeps an
   * anonymous reader away from here, and a mock that quietly returned an empty
   * list instead would hide a bug in that.
   */
  private async mine(): Promise<string[]> {
    const user = await this.auth.session();
    if (!user) throw new Error('bookmarks require a signed-in visitor');

    const existing = this.byUser.get(user.id);
    if (existing) return existing;

    const fresh: string[] = [];
    this.byUser.set(user.id, fresh);
    return fresh;
  }
}
