# 5. Transloco for i18n, not @angular/localize

Date: 2026-07-25 · Status: accepted

## Context

The site is fully bilingual: French and English, UI chrome *and* recipe content,
on path-prefixed URLs with localized route segments and localized slugs
(`/fr/recettes/babka-au-chocolat` ↔ `/en/recipes/chocolate-babka`).

Angular's built-in i18n (`@angular/localize`) is the default choice.

## Decision

Use **Transloco** (runtime translation) for UI chrome. Recipe content is
translated in the database and resolved by the API.

`@angular/localize` requires a separate production build *per locale*, producing
`dist/fr/` and `dist/en/` that must both be deployed and served. That doubles
build time, builds the admin area twice for no reason, and complicates the
single-fat-jar packaging. Its main advantage — fully localized HTML in the
served document — doesn't apply here, because the SEO-relevant metadata is
injected by Spring (see ADR 4) and the recipe content comes from the API in
either design.

Neither option localizes route segments; that's a hand-built segment map either
way.

## Consequences

- One build artifact, one bundle, one deploy.
- `LOCALE_ID` is provided dynamically from the URL prefix, and locale data for
  both `fr` and `en` is registered at bootstrap.
- Two translation problems stay strictly separate: UI strings in
  `public/i18n/{fr,en}.json`, content in per-locale database rows. Neither
  mechanism should ever be used for the other's job.
- **Pluralization is not symmetric between the languages.** French treats zero
  as singular ("0 réaction"); English does not ("0 reactions"). Use Transloco's
  messageformat plugin with ICU plural rules — a hand-rolled pluralizer will get
  this wrong. There is an explicit test.
- Missing-key drift between the two files is caught by a unit test rather than
  by a user finding a raw key on the page.
- Runtime cost: the translation JSON is an extra request on first load. It is
  small, cacheable, and worth it.
