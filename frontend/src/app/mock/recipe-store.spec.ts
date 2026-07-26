import { describe, expect, it } from 'vitest';
import { RecipeStore } from './recipe-store';

/**
 * The rules that decide what the public site is allowed to see, plus the ones
 * that keep an edit from corrupting the seed it came from.
 *
 * `new RecipeStore()` directly: it takes no dependencies and seeds itself in the
 * constructor, so TestBed would add ceremony and prove nothing extra.
 */

const BABKA = 'babka';
/** Seeded DRAFT so the unpublished path is observable rather than theoretical. */
const DRAFT = 'pomegranate-juice';

describe('RecipeStore visibility', () => {
  it('hides a draft from the public list', () => {
    const store = new RecipeStore();
    const keys = store.published('fr').map((recipe) => recipe.key);

    expect(keys).not.toContain(DRAFT);
    expect(keys).toContain(BABKA);
  });

  it('still lists the draft for the admin area', () => {
    const store = new RecipeStore();
    expect(store.all().map((recipe) => recipe.key)).toContain(DRAFT);
  });

  it('refuses to resolve a draft by its slug', () => {
    // Otherwise "unpublished" would only mean "unlisted", and anyone holding
    // the URL could still read it.
    const store = new RecipeStore();
    const draft = store.byKey(DRAFT)!;

    expect(store.publishedBySlug(draft.t.fr.slug, 'fr')).toBeNull();
  });

  it('publishes a draft once its status changes', () => {
    const store = new RecipeStore();
    store.setStatus(DRAFT, 'PUBLISHED');

    expect(store.published('fr').map((r) => r.key)).toContain(DRAFT);
  });

  it('hides a recipe that has no translation in the language asked for', () => {
    const store = new RecipeStore();
    const recipe = store.byKey(BABKA)!;
    store.save({ ...recipe, t: { ...recipe.t, en: { ...recipe.t.en, title: '' } } });

    expect(store.published('en').map((r) => r.key)).not.toContain(BABKA);
    // French is untouched: a missing translation hides one language, not both.
    expect(store.published('fr').map((r) => r.key)).toContain(BABKA);
  });
});

describe('RecipeStore slug resolution', () => {
  it('maps both locales’ slugs onto the same recipe', () => {
    const store = new RecipeStore();

    expect(store.keyForSlug('babka-au-chocolat', 'fr')).toBe(BABKA);
    expect(store.keyForSlug('chocolate-babka', 'en')).toBe(BABKA);
  });

  it('does not resolve a slug from the wrong locale', () => {
    // Otherwise /en/recipes/babka-au-chocolat would quietly work and the two
    // language trees would stop being distinct.
    const store = new RecipeStore();
    expect(store.keyForSlug('babka-au-chocolat', 'en')).toBeNull();
  });

  it('follows a slug renamed by the editor', () => {
    const store = new RecipeStore();
    const recipe = store.byKey(BABKA)!;
    store.save({ ...recipe, t: { ...recipe.t, fr: { ...recipe.t.fr, slug: 'babka-revisitee' } } });

    expect(store.keyForSlug('babka-revisitee', 'fr')).toBe(BABKA);
    expect(store.keyForSlug('babka-au-chocolat', 'fr')).toBeNull();
  });
});

describe('RecipeStore writes', () => {
  it('does not mutate the frozen seed', () => {
    // The seed is a module-level literal shared by every store instance. An edit
    // that reached back into it would leak across page loads and across tests.
    const first = new RecipeStore();
    first.save({ ...first.byKey(BABKA)!, baseServings: 99 });

    expect(new RecipeStore().byKey(BABKA)!.baseServings).toBe(2);
  });

  it('adds a recipe it has never seen instead of dropping it', () => {
    const store = new RecipeStore();
    const created = { ...store.byKey(BABKA)!, key: 'new-thing' };
    store.save(created);

    expect(store.byKey('new-thing')).not.toBeNull();
    expect(store.all()).toHaveLength(7);
  });

  it('treats a recipe with no explicit status as published', () => {
    const store = new RecipeStore();
    expect(store.statusOf(store.byKey(BABKA)!)).toBe('PUBLISHED');
  });
});
