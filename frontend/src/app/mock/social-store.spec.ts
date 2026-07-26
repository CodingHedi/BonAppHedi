import { describe, expect, it } from 'vitest';
import { SocialStore } from './social-store';

/**
 * The rules the M2 backend has to reproduce.
 *
 * These are asserted here rather than through the UI because they are the parts
 * a screen cannot show: that a second rating replaces the first instead of
 * stacking, that a reaction cannot be counted twice, and that a pending comment
 * is visible to its author and to nobody else. Getting any of them wrong looks
 * completely normal in the browser and is wrong in the database.
 *
 * `new SocialStore()` directly: it takes no dependencies, and seeding happens in
 * its constructor, so TestBed would add ceremony and prove nothing extra.
 */

/** As seeded: ratingSum 4 over ratingCount 1, so an average of 4.0. */
const BABKA = 'babka';

describe('SocialStore ratings', () => {
  it('starts from the seeded average', () => {
    const store = new SocialStore();
    expect(store.ratingFor(BABKA)).toEqual({ average: 4, count: 1, yourRating: null });
  });

  it('counts a first rating as a new vote', () => {
    const store = new SocialStore();
    store.rate(BABKA, 5);

    // 4 + 5 over two votes.
    expect(store.ratingFor(BABKA)).toEqual({ average: 4.5, count: 2, yourRating: 5 });
  });

  it('replaces a previous rating rather than adding a second one', () => {
    const store = new SocialStore();
    store.rate(BABKA, 2);
    store.rate(BABKA, 5);

    // The count must still be 2 — the seeded vote plus this visitor's, whose
    // score changed. A naive implementation reports 3 votes here and an average
    // dragged down by a score the visitor already withdrew.
    expect(store.ratingFor(BABKA)).toEqual({ average: 4.5, count: 2, yourRating: 5 });
  });

  it('survives being set to the same score twice', () => {
    const store = new SocialStore();
    store.rate(BABKA, 3);
    store.rate(BABKA, 3);

    expect(store.ratingFor(BABKA)).toEqual({ average: 3.5, count: 2, yourRating: 3 });
  });
});

describe('SocialStore reactions', () => {
  it('toggles on and back off without drifting', () => {
    const store = new SocialStore();
    const before = store.reactionFor(BABKA).count;

    expect(store.react(BABKA, true)).toEqual({ count: before + 1, reacted: true });
    expect(store.react(BABKA, false)).toEqual({ count: before, reacted: false });
  });

  it('ignores a repeated reaction in the same direction', () => {
    // A double click, or a second tab, must not buy two reactions.
    const store = new SocialStore();
    store.react(BABKA, true);
    store.react(BABKA, true);

    expect(store.reactionFor(BABKA).count).toBe(1);
  });

  it('never drops below zero when un-reacting from nothing', () => {
    const store = new SocialStore();
    expect(store.react(BABKA, false)).toEqual({ count: 0, reacted: false });
  });
});

describe('SocialStore comments', () => {
  it('returns the seeded published comments, newest first', () => {
    const store = new SocialStore();
    const comments = store.commentsFor(BABKA);

    expect(comments.map((c) => c.author.displayName)).toEqual(['Tom', 'Camille']);
  });

  it('hides another visitor’s pending comment', () => {
    // Shakshuka seeds one published and one PENDING comment. A moderation queue
    // is not public reading, so only the published one is visible.
    const store = new SocialStore();
    const comments = store.commentsFor('shakshuka');

    expect(comments).toHaveLength(1);
    expect(comments[0].author.displayName).toBe('Yasmine');
  });

  it('counts only what a visitor can actually see', () => {
    const store = new SocialStore();
    expect(store.commentCountFor('shakshuka')).toBe(1);
  });

  it('adds a comment attributed to the signed-in visitor and marked as theirs', () => {
    const store = new SocialStore();
    const created = store.addComment(BABKA, { displayName: 'Hédi', avatarUrl: null }, 'Testé.');

    expect(created.mine).toBe(true);
    expect(created.author.displayName).toBe('Hédi');
    expect(store.commentCountFor(BABKA)).toBe(3);
  });

  it('deletes only the comment asked for', () => {
    const store = new SocialStore();
    const created = store.addComment(BABKA, { displayName: 'Hédi', avatarUrl: null }, 'Testé.');
    store.deleteComment(created.id);

    expect(store.commentCountFor(BABKA)).toBe(2);
  });

  it('leaves bodyHtml empty so the client renders and sanitizes the markdown', () => {
    // M1 has no server to have pre-rendered it. If this ever arrives populated
    // from a mock, the sanitizing path in MarkdownComponent stops being exercised.
    const store = new SocialStore();
    expect(store.commentsFor(BABKA).every((c) => c.bodyHtml === '')).toBe(true);
  });
});

describe('SocialStore slug resolution', () => {
  it('maps both locales’ slugs onto the same recipe', () => {
    const store = new SocialStore();

    expect(store.keyForSlug('babka-au-chocolat', 'fr')).toBe(BABKA);
    expect(store.keyForSlug('chocolate-babka', 'en')).toBe(BABKA);
  });

  it('does not resolve a slug from the wrong locale', () => {
    // Otherwise /en/recipes/babka-au-chocolat would quietly work and the two
    // language trees would stop being distinct.
    const store = new SocialStore();
    expect(store.keyForSlug('babka-au-chocolat', 'en')).toBeNull();
  });
});
