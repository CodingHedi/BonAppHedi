# 8. Milestone 3: the site's own images

Date: 2026-08-08 · Status: proposed

## Context

Milestone 1 built the app against mocks and milestone 2 replaced them with a
real API (ADR 1). Both were about what the site *does*. What is left is
unusually coherent for a leftover: three gaps that all concern how the site
looks to somebody who is not already inside it.

**There is no photography, anywhere.** Not "not much" — none. `RecipeQueryDao`
constructs `new Dto.ImageRef(null, …)` at all three of its call sites, and there
is no image column on `recipe` or `recipe_translation` for it to read even if it
wanted to. Every image on the live site is the generated placeholder panel from
`shared/ui/image/image.ts`, whose own class doc has been saying so since it was
written: *"No photography exists for this site yet, so the placeholder is not a
temporary inconvenience — it is what every visitor currently sees."*

**The favicon is Angular's.** `frontend/public/favicon.ico` is byte-identical to
`@schematics/angular/application/files/common-files/public/favicon.ico.template`
— the same 15086 bytes — and has been in place since `777baf3`, the app-shell
commit. A French recipe notebook shows the Angular shield in the browser tab, in
the bookmarks bar, and in the history. It is also the only icon declared:
`index.html` has one `<link rel="icon">`, no `apple-touch-icon`, and no web
manifest.

**ADR 4 was accepted and then never built.** That ADR decided against Angular
SSR on the grounds that `IndexHtmlController` would splice per-route `<title>`,
`<meta name="description">`, Open Graph and Twitter tags, `<link rel="canonical">`,
`hreflang` alternates and `schema.org/Recipe` JSON-LD into the served HTML, with
`sitemap.xml` and `rss.xml` from the same layer. None of it exists. There is no
such controller; `grep -rn "og:" backend/src frontend/src` returns nothing, and
so does the search for JSON-LD, sitemap and rss. The five controllers in
`backend/src/main/java` are recipes, social, auth, admin and the acceptance
reset.

So the site currently serves every crawler and every link unfurler an empty
shell with one generic title. ADR 4 opens by saying a recipe site lives or dies
by search. That reasoning was accepted and the work was never done, which is a
worse position than having decided the other way: the SSR cost was declined *in
exchange for* this layer.

### Why these are one milestone and not three tickets

`og:image` is the join. Photography that no unfurler can see is invisible to
precisely the audience that would arrive from outside, and a metadata layer
shipped first would mean `og:image` pointing at nothing. The favicon belongs
with them because it is the same decision at a different size — it is what the
site looks like when it is reduced to one small square, which is also what a
share card falls back to.

Framed together, the milestone has a single subject: **the site stops being
invisible and starts having a face.**

### One thing this does not reopen

ADR 7 chose token avatars over provider pictures, and part of its supporting
argument was that the site has no photography anywhere, so a real photograph
beside a placeholder would have been the only photographic content on the page.
This milestone ends that premise, and it does not matter. ADR 7's actual
reasoning is privacy — not reading the provider's picture means there is nothing
to leak — and that is untouched by the site gaining photographs of food. The
aesthetic argument expires; the decision stands. Recorded here so nobody
rediscovers the expiry and mistakes it for a reason to revisit.

## Decision

Milestone 3 delivers photography, a real icon set, and the ADR 4 metadata layer.

### Photographs are uploaded through the admin

An authenticated upload under `/api/admin`, storing derivatives on disk beside
the SQLite file. The admin already owns recipe CRUD — `PUT /api/admin/recipes`
and friends — so the photograph joins the form that already edits the recipe
rather than arriving through a second mechanism.

The rejected alternative was committing assets to `frontend/public/` and storing
a filename. It is genuinely cheaper — no multipart handling, no storage to back
up, no limits to enforce — but it makes adding a photograph a commit and a
deploy, which is the wrong shape for the one kind of content this site exists to
accumulate.

That cheapness was real, though, and taking the upload means paying for it
explicitly: a size cap, a content-type allowlist that sniffs rather than trusts
the header, a bounded set of generated derivative sizes, and a serving path that
cannot be walked. None of these are optional and each one is the sort of thing
that gets skipped in a first pass on a personal site.

**`ImageRef` already anticipated this and is nearly ready.** `core/api/models.ts`
declares `url`, `alt`, and optional `width`, `height` and `dominant`; the
backend record carries only `url` and `alt`. Because the extra three are
optional the two do not currently disagree, so this is a gap to fill rather than
drift to repair — and `dominant` is what lets a photograph load into a tinted
box instead of a flash of empty panel.

**Layout shift is already handled and must stay that way.** `image.ts` reserves
its box with `aspect-ratio` specifically so that dropping in real photographs
costs zero shift. Whatever the upload produces has to fit that contract rather
than the contract bending to it.

### The favicon is drawn from what the site already is

The site has a settled visual language — the Umber palette, the heading
typeface, and the icon set in `core/icons`. The icon is derived from those
rather than commissioned separately, and it ships as a full set: the `.ico` for
the tab, an `apple-touch-icon`, and a web manifest, replacing the single
declaration `index.html` carries today.

**A gate follows it, on the `check:legal` precedent.** That script exists
because the mentions légales shipped incomplete while the site was live and
nothing noticed. The Angular default favicon is the identical failure — a
placeholder that ships because no test can tell it from a real one. A check that
fails when `favicon.ico` matches the schematic template byte-for-byte closes it
permanently, costs almost nothing, and belongs in `verify:prod` beside
`check:legal` rather than in the everyday `verify`.

### ADR 4 gets built, as specified

`IndexHtmlController` as that ADR describes it: read `index.html` once at
startup, splice per-route title, description, Open Graph and Twitter tags,
canonical, `hreflang` alternates and `schema.org/Recipe` JSON-LD, cached per
(slug, locale) and invalidated on save. Plus `sitemap.xml` with `xhtml:link`
alternates, and `rss.xml`.

ADR 4 is not superseded or amended — its decision was right and is unchanged.
This milestone is where it gets implemented, and ADR 4 should be read as the
specification for this part.

`og:image` points at the recipe's photograph, which is why this half comes
second. A recipe with no photograph falls back to a site-level card image rather
than emitting a tag pointing at nothing; the placeholder panel is generated in
the browser and cannot be linked to.

### Definition of done

Following ADR 1's habit of giving a milestone an acceptance criterion rather
than a feeling:

- Every seeded recipe has a photograph, served from our own origin.
- No request leaves the origin to render any page, still. The whole site is
  built on this (ADR 6, ADR 7) and an image CDN would end it quietly.
- `verify` and `verify:prod` are green, and the favicon gate is in the prod
  chain.
- A recipe URL pasted into a link unfurler shows the title, the description and
  the photograph, in the locale of the URL.
- `curl` on a recipe URL returns the JSON-LD and the OG tags **without
  executing JavaScript** — that is the entire claim ADR 4 made in place of SSR,
  and it is the one worth testing directly.
- Google's Rich Results Test accepts the `Recipe` markup.

## Consequences

**The backups stop covering everything.** `deploy/BACKUP.md` states that the
three copies hold "the database and nothing else", which is true and sufficient
today because the database *is* the whole of the mutable state. An upload
directory ends that, and the failure is silent: backups keep succeeding and keep
being restorable, while the photographs are not in them. `backup.sh`, its
documentation and the restore drill all have to move, and that is an ops-repo
change — two commits in two repositories, per the submodule rule.

**Uploads are the first untrusted bytes the site accepts.** Comments are text
and are sanitized on write; an avatar is a token from a closed set. A file
upload is a different category, and it arrives on the endpoint with the highest
privilege in the application. The admin-only scope limits the blast radius to an
account that can already edit every recipe, which is a reason to be calm rather
than a reason to skip the limits.

**`ApiSecurityMatrixTest` will fail until the new endpoints are declared.** That
is the class working exactly as intended, and the upload endpoint is precisely
the kind it exists to catch.

**The e2e fixture becomes a real image test for free.** It fails a spec on any
failed request, so a photograph that 404s fails the suite rather than rendering
as a broken box nobody notices. That is worth knowing before anyone proposes
loosening it.

**The image-heavy list page is the rendering measurement the backlog wants.**
`Docs/backlog.md` defers infinite scroll and virtualisation pending a real
profile of the grid, explicitly on rendering rather than recipe count. A grid of
photographs is a different measurement from a grid of CSS panels, so that entry
should be re-read after this milestone rather than before it.

**Photography is the one part of this that is not engineering.** Every other
gap here closes by writing code. This one closes by cooking, shooting and
editing, and no amount of upload machinery substitutes for it — the milestone is
not done when the pipeline works, it is done when there are photographs in it.
