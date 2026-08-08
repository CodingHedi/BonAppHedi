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
  this wrong. There is an explicit test. *(The messages are still ICU; the plugin
  is not. See the amendment below.)*
- Missing-key drift between the two files is caught by a unit test rather than
  by a user finding a raw key on the page.
- Runtime cost: the translation JSON is an extra request on first load. It is
  small, cacheable, and worth it.

## Amendment, 2026-08-08: ICU stays, the messageformat plugin goes

`@jsverse/transloco-messageformat` compiles each message into JavaScript with
`new Function`, and that single fact put `'unsafe-eval'` in the site's
Content-Security-Policy — the one term a CSP exists to forbid, carried for six
strings. It is now a ~130-line transpiler in
`core/i18n/plural-transpiler.ts`, and the policy no longer has the term.

**Nothing above changes.** The messages in `public/i18n/*.json` are still ICU,
still `{count, plural, …}`, and the asymmetry the original bullet warns about is
still real. What changed is only who resolves them.

The warning in that bullet is also still correct, and is the reason this was
safe to do at all: **the categories come from `Intl.PluralRules`, not from a
hand-written rule.** That is CLDR, in the browser, and it knows things a rule
written here would not — French counts zero as singular, and French has a `many`
category that English lacks and that none of these messages declares, so an
absent category has to fall back to `other` or the string renders empty. Both
cases are in the spec's table, and both were confirmed by breaking them.

That table is the output messageformat itself produced for these exact strings,
captured before the dependency was removed, so the test compares against what
the site used to render rather than against a fresh reading of the ICU spec.

What is deliberately unimplemented, because no message uses it: `select`,
`selectordinal`, offsets, date and number skeletons, and quoting a literal `#`.
Wanting any of them is a reason to reconsider the dependency, not to grow the
file — at which point this decision is worth revisiting rather than working
around.

Measured: the initial bundle went from 442 kB to 368 kB, and `new Function(`
now appears nowhere in the build output.
