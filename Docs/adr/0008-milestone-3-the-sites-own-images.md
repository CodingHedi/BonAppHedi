# 8. Milestone 3: the site's own images

Date: 2026-08-08 · Status: accepted — **all six acceptance criteria verified
2026-08-27; see the audit at the foot of this file.** The Rich Results Test
returned *2 valid items*. The same test also reported a failed font, which
turned out to be a production defect this milestone had introduced and which
nothing in the suite could see; that is recorded in the audit too.

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

## Amendment, 2026-08-14: one derivative size, not a set

The decision above asks for "a bounded set of generated derivative sizes" as one
of the four costs of accepting an upload. `PhotoIngest` generates **one**: the
longest side capped at 1600px, JPEG quality 78, matching the six seeded
photographs exactly so an uploaded one and a seeded one are the same kind of
file rather than two conventions in one directory.

The reason is that nothing consumes a second. `shared/ui/image/image.ts` renders
a single `<img>` with no `srcset` and no `sizes`, so a 800px and a 400px
derivative would be bytes on disk that no markup ever asks for — and bytes on
disk are now bytes in a backup, since the same milestone made the upload
directory part of what `backup.sh` carries.

**The other three costs are paid in full**, and each has a test: a size cap, a
content type decided by decoding rather than by believing the request, and a
serving path that cannot be walked. A fourth was added that this ADR did not
ask for — a cap on decoded pixels, because a few hundred bytes of flat colour
can declare a bitmap of gigabytes and the byte cap does not see it coming.

**What this defers, and where it lands when it stops being deferred.**
Responsive images are a rendering decision that belongs with the one
`Docs/backlog.md` is already holding on the list page — the same grid, the same
measurement. `PhotoIngest.accept` is the single place a second size gets
generated, and it returns a record rather than a URL specifically so that
adding one does not change its callers.

It is worth being plain that this is narrower than what was written above,
rather than letting "bounded" quietly come to mean "one".

---

## Amendment, 2026-08-17: the bound is three, and they are made on request

The narrowing above is undone. "A bounded set of generated derivative sizes" is
now what ships, the bound is `MediaStorage.WIDTH_LADDER` — 400 and 800 beside
the stored original — and `image.ts` renders a real `srcset`.

**What changed was a measurement, not a principle.** The 2026-08-14 amendment
was right on its own terms: nothing consumed a second size, so a second size
would have been bytes on disk and therefore bytes in a backup. Then
`scripts/grid-perf.mjs` profiled the grid at 300 recipes and found the cost was
never frame times — a locked 60 fps throughout — but bytes: 76.6 MB and 539
megapixels for a full scroll, because every card fetched a 1600px photograph to
fill a box 190px tall. Same harness after the change: 25.8 MB and 60.5 MP.

**Derivatives are made when a browser first asks, not when a photograph is
uploaded**, and that is the decision worth recording rather than the ladder.
Generating on upload would have needed a backfill for every photograph already
on the server, and a window in which the API offered a `srcset` entry naming a
file that did not exist yet. Neither exists this way: `MediaController` writes
the file on the first request for it and serves it as an ordinary file
afterwards. The cost is one slow response per size per photograph, once.

**The API sends the available widths; it does not leave a client to derive
them.** A naming rule would be less code and would be wrong in one case that is
certain to occur — a photograph narrower than a ladder step has no smaller copy
and never will, because `PhotoIngest.derive` refuses to enlarge, so a client
following the rule would confidently request a file the server will always
refuse. `Dto.ImageSource` exists for that reason.

**The ladder is closed, and that is a security property rather than a
preference.** A width outside it is a 404 rather than a new file. An open
generator is an invitation to fill the disk one URL at a time, and nothing on
this site needs an arbitrary size.

**It now exists twice**, because the mocked build has no server to generate
anything and the e2e suite runs against that build. `image-sources.ts` mirrors
the ladder and `scripts/make-media-derivatives.mjs` writes the committed copies
for it. The drift would be silent and one-directional — a width offered there
and not here is a 404 in production that no test requests — so `MediaLadderTest`
reads the TypeScript and fails when the two disagree, exactly as `AvatarTest`
does for the avatar vocabulary.

**The backup consequence from the last amendment stands and grew.** Derivatives
are written into the same directory `backup.sh` carries, so a photograph now
costs up to three files there rather than one. They are reproducible from the
original, so losing them costs a slow first request rather than a photograph —
which is worth knowing before anyone sizes the archive.

---

## Audit, 2026-08-27: the definition of done, measured

This ADR has sat at `proposed` since 2026-08-08 while its work shipped, so the
six acceptance criteria above were checked one at a time against the live site
rather than against memory. **Five pass. The sixth has not been run.**

| # | Criterion | Result |
|---|---|---|
| 1 | Every seeded recipe has a photograph, own origin | **pass** — 6 of 6, all `/media/…`, three widths each |
| 2 | No request leaves the origin to render any page | **pass** — asserted in `recipe-detail.spec.ts` against `youtube.com`, `ytimg.com`, `gstatic.com`, `doubleclick` |
| 3 | `verify` and `verify:prod` green, favicon gate in the prod chain | **pass** — `verify:prod` opens `check:legal && check:favicon` |
| 4 | An unfurler shows title, description and photograph, in the URL's locale | **pass** — see below |
| 5 | `curl` returns JSON-LD and OG tags without executing JavaScript | **pass** — see below |
| 6 | Google's Rich Results Test accepts the `Recipe` markup | **pass** — *2 valid items*, Recipes and Review snippets |

Criteria 4 and 5 were confirmed by `curl` on the raw HTML: `og:type`,
`og:title`, `og:description`, `og:url`, `og:locale`, `og:image` pointing at the
recipe's own photograph, `og:image:alt`, `rel=canonical`, both `hreflang`
alternates, a per-locale `<title>`, and a complete `Recipe` JSON-LD carrying
`recipeIngredient`, `recipeInstructions`, `prepTime`, `cookTime`,
`recipeYield`, `datePublished`, `author` and `aggregateRating`.

**Criterion 6 was run on 2026-08-27 and passed**: *2 valid items* — Recipes
with non-critical issues, and Review snippets with none, from the
`aggregateRating` the JSON-LD already carried.

It is worth recording that this was the only acceptance criterion in any ADR
here that **the repository cannot assert or regression-test**, because it is a
third party's verdict on a submitted URL. Everything else in the list above is
checkable in CI forever. That is not an argument against having used it — see
immediately below, where it earned its place twice over — but it is a property
to weigh when writing the next milestone's criteria.

### One defect the audit found

Every recipe page was serving **two** `<meta name="description">`, the shell's
site-level one first and the recipe's second — and first is the one a crawler
takes. So each recipe described itself to search engines as *"un carnet de
recettes tenu à la main"*. Unfurlers were unaffected throughout, because they
read `og:description`, which was always correct and always singular.

`IndexHtmlController` already had the rule and stated it, for the title:

> *The title is a replacement rather than an addition: two `<title>` elements
> are not a richer page, they are one page with a title and some ignored
> markup.*

The description was appended instead. Fixed on 2026-08-27 by making it a
replacement on the same terms.

**`RecipeMetadataTest` could not have caught it**, and that is the more useful
half. Every assertion in it was `containsString`, so it proved the recipe's
description was *present* and never that the shell's was *gone* — a page
carrying both passes. It now counts the tag rather than looking for it, which
is the same correction `TESTING.md` records for the legal notice: an assertion
loose enough never to fail is not protecting anything.

### And a second, worse one, found by criterion 6 itself

The Rich Results Test's resource report showed one file it could not fetch:
`/media/work-sans-latin-wght-normal-QNUPE6XE.woff2`. Checked against
production, **all eleven of the site's font files 404** — every weight of
Bricolage Grotesque, Work Sans and Oswald. The live site has been rendering in
`system-ui` since photography shipped.

**This milestone caused it.** `MediaStorage.PREFIX` is `/media/`, and
`MediaController` maps `PREFIX + "{name:.+}"`, which takes precedence over
static resource handling for everything beneath it. Angular's build emits
hashed font files into `dist/frontend/browser/media/` — its default output
folder for that kind of asset — and the stylesheet asks for them as
`./media/…`. So from `838b3af` (2026-08-10, the commit that gave recipes a
photograph) the controller has been shadowing the entire font directory,
answering from the upload directory, and returning 404 for anything not in it.
Photographs work; everything Angular put there does not.

The milestone that gave the site a face took away its typeface, and the two are
the same commit.

**Nothing in the suite could see it, for three independent reasons**, which is
the part worth keeping:

- **The e2e suite never runs against the backend.** It serves the Angular build
  on port 4300 with no Spring in the picture, so `/media/` is a plain static
  directory there and the collision cannot occur.
- **`smoke.spec.ts` asserts the wrong thing.** Its font test reads
  `getComputedStyle(h2).fontFamily` and expects it to contain `Bricolage`. That
  returns the *declared stack*, not the face actually in use, so it passes
  identically whether the `@font-face` file loaded or 404'd. Its own comment
  says it guards against "a silent regression a screenshot would catch and an
  assertion normally would not" — and it is exactly that assertion.
- **The fixture's failed-request check never saw the request.** It fails a spec
  on a failed request, which would have caught this instantly — against a
  server that does not serve the fonts. On 4300 they all return 200.

The fix and the regression test are not in this ADR's scope and are tracked
separately; what belongs here is that criterion 6 paid for itself. A crawler
fetching the page as a stranger reported something four months of green suites
could not, and the reason is structural rather than careless: **every layer of
this project's testing runs against a build that does not have this bug.**
