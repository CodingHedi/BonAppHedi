import { Injectable } from '@angular/core';
import type { Comment, CommentStatus } from '../core/api/models';
import { SEED_COMMENTS, SEED_NOW, SEED_RECIPES } from './seed-data';

/**
 * The mutable half of the mock backend.
 *
 * Ratings, reactions and comments all change while the app is open, and two
 * different mock services read them: `MockSocialApi` writes them, and
 * `MockRecipeApi` reports the resulting counts on the recipe itself. Without a
 * shared store those two drift — you rate a recipe, the stars move, and then the
 * "3 reviews" line beside them still says 2 because it came from the frozen
 * seed.
 *
 * State is per page load, which is the honest simulation: a real visitor's
 * rating survives a reload because the server stored it, and nothing here has a
 * server. Tests get a clean slate on every `goto` as a result.
 *
 * Everything is keyed by the language-neutral recipe key rather than by slug,
 * because rating `/fr/recettes/babka-au-chocolat` and rating
 * `/en/recipes/chocolate-babka` are the same act on the same recipe. Turning a
 * slug into that key is RecipeStore's job, not this one's — a slug belongs to
 * the recipe, and it can be changed by the editor while these counts stay put.
 */

interface RatingState {
  sum: number;
  count: number;
  yours: number | null;
}

interface ReactionRecord {
  count: number;
  reacted: boolean;
}

interface CommentRecord {
  id: number;
  recipeKey: string;
  displayName: string;
  avatarUrl: string | null;
  bodyMarkdown: string;
  createdAt: string;
  status: CommentStatus;
  mine: boolean;
}

@Injectable({ providedIn: 'root' })
export class SocialStore {
  private readonly ratings = new Map<string, RatingState>();
  private readonly reactions = new Map<string, ReactionRecord>();
  private comments: CommentRecord[] = [];
  private nextId = 1;

  constructor() {
    for (const recipe of SEED_RECIPES) {
      this.ratings.set(recipe.key, {
        sum: recipe.ratingSum,
        count: recipe.ratingCount,
        yours: null,
      });
      this.reactions.set(recipe.key, { count: recipe.reactionCount, reacted: false });
    }

    this.comments = SEED_COMMENTS.map((seed) => ({
      id: this.nextId++,
      recipeKey: seed.recipeKey,
      displayName: seed.displayName,
      avatarUrl: null,
      bodyMarkdown: seed.bodyMarkdown,
      createdAt: new Date(SEED_NOW.getTime() - seed.daysAgo * 86_400_000).toISOString(),
      status: seed.status ?? 'PUBLISHED',
      mine: false,
    }));
  }

  ratingFor(key: string): { average: number; count: number; yourRating: number | null } {
    const state = this.ratings.get(key) ?? { sum: 0, count: 0, yours: null };
    return {
      average: state.count === 0 ? 0 : state.sum / state.count,
      count: state.count,
      yourRating: state.yours,
    };
  }

  /**
   * Replaces this visitor's previous score rather than stacking a second one, so
   * clicking 3 then 5 leaves one vote of 5 and not an average of 4.
   */
  rate(key: string, stars: number): void {
    const state = this.ratings.get(key) ?? { sum: 0, count: 0, yours: null };

    if (state.yours === null) {
      state.sum += stars;
      state.count += 1;
    } else {
      state.sum += stars - state.yours;
    }

    state.yours = stars;
    this.ratings.set(key, state);
  }

  reactionFor(key: string): ReactionRecord {
    return this.reactions.get(key) ?? { count: 0, reacted: false };
  }

  react(key: string, reacted: boolean): ReactionRecord {
    const state = this.reactions.get(key) ?? { count: 0, reacted: false };

    // Guarded so a double-click, or a second tab, cannot drive the count past
    // one-per-visitor in either direction.
    if (reacted !== state.reacted) {
      state.count += reacted ? 1 : -1;
      state.reacted = reacted;
    }

    this.reactions.set(key, state);
    return state;
  }

  /**
   * Rejected comments are dropped entirely; pending ones are kept only for the
   * person who wrote them. A moderation queue is not public reading.
   */
  commentsFor(key: string): readonly Comment[] {
    return this.comments
      .filter((row) => row.recipeKey === key)
      .filter((row) => row.status === 'PUBLISHED' || (row.status === 'PENDING' && row.mine))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((row) => this.toComment(row));
  }

  /** The count beside the heading counts what a visitor can actually see. */
  commentCountFor(key: string): number {
    return this.commentsFor(key).length;
  }

  addComment(
    key: string,
    author: { displayName: string; avatarUrl: string | null },
    bodyMarkdown: string,
  ): Comment {
    const row: CommentRecord = {
      id: this.nextId++,
      recipeKey: key,
      displayName: author.displayName,
      avatarUrl: author.avatarUrl,
      bodyMarkdown,
      createdAt: new Date().toISOString(),
      status: 'PUBLISHED',
      mine: true,
    };

    this.comments.push(row);
    return this.toComment(row);
  }

  deleteComment(id: number): void {
    this.comments = this.comments.filter((row) => row.id !== id);
  }

  // --- admin ------------------------------------------------------------------

  /**
   * Everything awaiting a decision, across every recipe, oldest first.
   *
   * Oldest first on purpose, unlike the public thread: a queue is worked
   * through, and the comment that has been waiting longest is the one whose
   * author is still wondering whether it posted.
   */
  awaitingModeration(): readonly { comment: Comment; recipeKey: string }[] {
    return this.comments
      .filter((row) => row.status === 'PENDING')
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((row) => ({ comment: this.toComment(row), recipeKey: row.recipeKey }));
  }

  setCommentStatus(id: number, status: CommentStatus): void {
    this.comments = this.comments.map((row) => (row.id === id ? { ...row, status } : row));
  }

  /** Site-wide totals for the admin dashboard. */
  totals(): {
    comments: number;
    pending: number;
    ratingCount: number;
    ratingAverage: number;
    reactions: number;
  } {
    const published = this.comments.filter((row) => row.status === 'PUBLISHED').length;
    const pending = this.comments.filter((row) => row.status === 'PENDING').length;

    let sum = 0;
    let count = 0;
    for (const rating of this.ratings.values()) {
      sum += rating.sum;
      count += rating.count;
    }

    let reactions = 0;
    for (const reaction of this.reactions.values()) reactions += reaction.count;

    return {
      comments: published,
      pending,
      ratingCount: count,
      ratingAverage: count === 0 ? 0 : sum / count,
      reactions,
    };
  }

  ratingCountFor(key: string): number {
    return this.ratings.get(key)?.count ?? 0;
  }

  private toComment(row: CommentRecord): Comment {
    return {
      id: row.id,
      author: { displayName: row.displayName, avatarUrl: row.avatarUrl },
      bodyMarkdown: row.bodyMarkdown,
      // Empty by design in M1, matching bodyHtml on recipes: with no server
      // there is nothing that could have rendered and sanitized it, so the
      // client renders the markdown instead.
      bodyHtml: '',
      createdAt: row.createdAt,
      status: row.status,
      mine: row.mine,
    };
  }
}
