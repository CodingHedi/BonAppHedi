import { Injectable, inject } from '@angular/core';
import type { Locale } from '../core/i18n/locale';
import type { SocialApi } from '../core/api/social-api';
import type { Comment, RatingSummary, ReactionState } from '../core/api/models';
import { MockAuthApi } from './mock-auth-api';
import { SocialStore } from './social-store';
import { RecipeStore } from './recipe-store';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => sleep(120 + Math.random() * 200);

/**
 * Writes, against the in-memory store.
 *
 * Unlike the read mocks this one enforces the rules the server will enforce,
 * rather than accepting anything and letting the UI look correct. A component
 * that forgets to hide the comment box from a signed-out visitor should fail
 * here in milestone 1, not survive until the real API rejects it in milestone 2.
 */
@Injectable()
export class MockSocialApi implements SocialApi {
  private readonly store = inject(SocialStore);
  private readonly recipes = inject(RecipeStore);
  private readonly auth = inject(MockAuthApi);

  async rate(slug: string, stars: number, locale: Locale): Promise<RatingSummary> {
    await latency();

    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new Error(`rating must be an integer from 1 to 5, got ${stars}`);
    }

    const key = this.require(slug, locale);
    this.store.rate(key, stars);
    return this.store.ratingFor(key);
  }

  async react(slug: string, reacted: boolean, locale: Locale): Promise<ReactionState> {
    await latency();
    return this.store.react(this.require(slug, locale), reacted);
  }

  async comments(slug: string, locale: Locale): Promise<readonly Comment[]> {
    await latency();
    return this.store.commentsFor(this.require(slug, locale));
  }

  async addComment(slug: string, bodyMarkdown: string, locale: Locale): Promise<Comment> {
    await latency();

    const user = await this.auth.session();
    if (!user) throw new Error('a comment requires a signed-in visitor');

    const body = bodyMarkdown.trim();
    if (!body) throw new Error('a comment cannot be empty');

    return this.store.addComment(
      this.require(slug, locale),
      { displayName: user.displayName, avatarUrl: user.avatarUrl },
      body,
    );
  }

  async deleteComment(id: number): Promise<void> {
    await latency();

    const user = await this.auth.session();
    if (!user) throw new Error('deleting a comment requires a signed-in visitor');

    this.store.deleteComment(id);
  }

  private require(slug: string, locale: Locale): string {
    const key = this.recipes.keyForSlug(slug, locale);
    if (!key) throw new Error(`no recipe with slug "${slug}" in ${locale}`);
    return key;
  }
}
