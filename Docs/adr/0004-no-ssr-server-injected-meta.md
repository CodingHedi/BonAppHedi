# 4. No Angular SSR; Spring injects per-route metadata instead

Date: 2026-07-25 · Status: accepted

## Context

A recipe site lives or dies by search: Google's recipe rich-results need
`schema.org/Recipe` JSON-LD in the served HTML, and shared links need Open Graph
tags. A client-rendered SPA serves an empty shell to anything that doesn't run
JavaScript.

The obvious answer is Angular SSR. The cost is a Node process running beside the
JVM: a second runtime to deploy, monitor, restart and keep patched on a small
VPS, for a site with a few dozen pages that change a few times a month.

## Decision

Ship a client-rendered SPA. `IndexHtmlController` reads `index.html` once at
startup and, for each recipe URL, splices in the locale-correct `<title>`,
`<meta name="description">`, Open Graph and Twitter tags, `<link rel="canonical">`,
`hreflang` alternates, and a `schema.org/Recipe` JSON-LD block. Cached per
(slug, locale) and invalidated on save.

## Consequences

- Crawlers and link unfurlers get everything they need without executing
  JavaScript. Human visitors get the SPA.
- One runtime, one process, one systemd unit.
- The page *body* is still empty until JS runs. Google renders JS fine; some
  smaller crawlers don't. Acceptable for this site.
- `sitemap.xml` (with `xhtml:link` alternates) and `rss.xml` are served from the
  same layer.
- Escape hatch if this proves insufficient: `ng add @angular/ssr` plus a Node
  sidecar. Nothing in the app design blocks it — the decision is reversible.
