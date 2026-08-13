package fr.bonapphedi.api;

/**
 * A recipe was written: created, edited, published or withdrawn.
 *
 * <p>Carries no key on purpose. Everything listening holds a cache keyed by
 * something else — {@code IndexHtmlController} by (slug, locale) — and a save
 * can change the very thing that key is made of, so a targeted eviction would
 * miss the entry it was aimed at whenever a slug or a status moved. Dropping
 * everything is correct, and the caches this invalidates are cheap enough to
 * rebuild that being clever would buy nothing.
 */
public record RecipeChanged() {}
