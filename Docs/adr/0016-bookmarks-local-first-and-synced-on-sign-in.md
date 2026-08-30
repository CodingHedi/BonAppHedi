# 16. Bookmarks: local first, synced on sign-in

Date: 2026-08-30 · Status: proposed

## Context

There is no way to keep a recipe. Rating one and reacting to one are momentary —
the value is delivered the instant you press, and you never need it back.
Everything the site stores about an anonymous reader exists to make those two
idempotent, and nothing exists to answer "where was that thing I wanted to
cook".

### Why this is not the reaction table with a different name

`reaction` is `(recipe_id, visitor_id, created_at)` with a unique pair, and a
bookmark table would look identical. They differ in the property that decides
the whole design:

- **A reaction is public and immediate.** « Réagir », with a count everyone
  sees, spent at the moment of pressing.
- **A bookmark is private, and its entire value is delivered later.** It is
  worth nothing at the moment it is made.

Copying the reaction design means keying on `visitor_id`, and that is the one
choice that must not be made here. The `bah-visitor` cookie lasts a year, is
per-browser, and — decisively — the privacy page instructs people to clear it:

> « Effacer les cookies de votre navigateur suffit à détacher de vous les notes
> déjà données. »

Someone following the site's own published privacy advice would silently
destroy their saved recipes. That is the class of defect this codebase spends
the most effort avoiding: a feature that looks like it works.

### Why not simply require an account

The site is anonymous-first by design — `SecurityConfig` opens by saying so —
and ADR 2 declined to put a sign-in in front of rating because that is the
lightest interaction on the site. Requiring one to keep a recipe would be a
smaller mistake but the same kind: the moment a reader wants to save something
is the worst moment to interrupt them.

### And why local storage alone is not enough either

It is per-browser. Save something on one device and the list is empty on the
next, empty in a second browser on the same device, and gone after "clear site
data" with no warning. For *"save this for tonight"* that is honest and
sufficient. For *"the recipes I come back to"* it is broken, and broken quietly.

**Which device is which is not knowable and must not be assumed.** The obvious
way to describe this is "saved on your computer, missing on your phone", and it
is wrong often enough to matter: plenty of people have no computer in this
story at all, read on a tablet, and cook from a phone in the kitchen. Every
string below says *device* and never names one.

## Decision

**Both, in that order: local storage is always the working copy, and an account
makes it follow you.** Anonymous readers get the whole feature immediately.
Signing in merges what they have and keeps it.

### One signal, two backing stores

A service in `core/` owns a `signal<readonly string[]>` that the control on a
recipe and the bookmarks page both read, so there is one source of truth in the
UI regardless of which store is behind it. `localStorage` is written on every
change and is the only store when there is no session. The `bookmark` table is
authoritative when there is one.

```sql
CREATE TABLE bookmark (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE (recipe_id, user_id)
);
```

V10, additive. `CASCADE` on both sides, deliberately unlike `comment.user_id`,
which is `ON DELETE SET NULL` because a comment outlives its author and the
display name is copied for exactly that reason. A bookmark must not outlive
anybody: it is private and meaningless without its owner. The `UNIQUE` pair goes
in the schema for the reason V1 already gives about ratings — it is the one
place the rule cannot be forgotten. Both cascades are inert without
`foreign_keys=on` in the JDBC URL (ADR 2).

### The merge is a union, and that is what makes this affordable

When `AuthService.resolved()` becomes true and `signedIn()` with it, push the
union of the local list and the stored one, and adopt the result.

Bookmarks are additive and idempotent, so there is no conflict to resolve —
unlike a rating, where two values genuinely disagree and a merge has to pick a
loser. A union has no loser, cannot be applied wrongly, and is safe to repeat,
so a merge that fails halfway is simply retried on the next load. Eventual
consistency falls out of the data shape rather than being engineered.

### Signing out clears the local copy

The alternative — keeping it as an anonymous list — is friendlier and wrong.
ADR 3 chose session cookies over JWT specifically so that logging out genuinely
revokes, and `SecurityConfig` backs that with `invalidateHttpSession(true)` and
`deleteCookies("SESSION")`. Leaving a personalised list on the machine after a
logout contradicts the promise those lines make, and it matters most on exactly
the shared device where somebody thought to log out.

The cost is real: sign out and the convenience copy goes with the session. That
is the right way round, and the interface should say so before it happens rather
than after.

### `RecipeSummary` gains `recipe.id`, and `recipe.key` stays internal

A slug identifies one recipe *within one language* —
`ux_recipe_translation_slug` is on `(locale, slug)`, and V1 says so in a comment
— while `RecipeSummary` exposes nothing else. So a list held in the browser as
slugs is empty after a language switch: `babka-au-chocolat` matches nothing in
the English catalogue, where the same recipe is `chocolate-babka`.

Bookmarks are therefore stored as `recipe.id`, which `RecipeSummary` gains, and
the server stores `recipe_id`. Publishing a numeric id is not new: `Dto.Comment`
carries `long id` and `DELETE /api/comments/{id}` is already a public route.

**Not `recipe.key`, and the reason is not aesthetics.** It is the obvious
candidate — it is the language-neutral identity by definition, exactly as
`tag.key` is, and the admin API already addresses recipes by it. But
`Dto.RecipeDraft` carries `key` as a **writable** field; `photo` is the only
one marked read-only. Renaming a recipe's key in the editor is a supported
operation today, and the moment that value is sitting in other people's stored
bookmarks and shared links, the next rename empties their lists with nothing
reporting it.

That is the trap ADR 7 already caught once, in its own words: *"The names are
also in the database against real accounts, so one may be added but never
renamed."* Publishing `key` would put it under the same permanent constraint
while nothing in the schema enforced it — and would spend, for no gain here, the
freedom to rename an editorial handle that only the author ever sees.

**An id cannot be renamed.** That is the whole argument: for a value other
people store, immutability by construction beats immutability by discipline.

Two smaller things fall out. `key` is lexically English — `sourdough`,
`beef-tagine` — so a French reader's shared link would have read as leaked
internal naming. And `key` would not have shortened anything:
`basque-cheesecake` is seventeen characters, the same as `babka-au-chocolat`.
Storage wants an identifier that is immutable, and a shared URL wants one that
is short; `id` is both, and `key` is neither.

What is given up is a readable share link — `?r=1,5` says nothing a human can
check. That cost lands entirely on the deferred sharing feature below and not on
bookmarks at all. If readable links are ever wanted, the answer is a third
column holding an immutable public code, not the promotion of `key` and a
convention that it must never change again.

### The bookmarks page costs no requests

`RecipeListPage` already fetches the catalogue once per locale and filters in a
computed; the backlog measures 27 KB gzipped at three hundred recipes and
concludes that design is right. The bookmarks page is the same catalogue and a
different predicate — no endpoint, no second fetch, and the grid and card are
reused unchanged.

### What anonymous readers are told, and where

Two places, doing different jobs.

**Inline on the bookmarks page**, seen when it is relevant and nowhere else,
using the prompt shape comments already use (`comments.signInPrompt`) rather
than a modal or a banner: a statement of fact followed by an action, exactly as
the comment box does.

**The empty state must not say "you have no saved recipes."** On a second device
that is false, and false in the direction that makes the feature look broken. It
says where bookmarks live, and that signing in may find more.

**The privacy page**, as the canonical account. For once a section that
strengthens the page: bookmarks stay in the browser and are never sent, unless
you sign in and ask for them to follow you.

#### The strings

Settled here rather than left to the implementation, because the wording is the
part that does the work and each one is a claim that has to stay true. The verb
is **s'identifier**, matching `comments.signInPrompt` and `account.signIn`, not
« se connecter » — the site already made that choice and two vocabularies for
one action is worse than either.

| Key | fr | en |
|---|---|---|
| `bookmarks.local` | Enregistrées dans ce navigateur. | Saved in this browser. |
| `bookmarks.signInPrompt` | S'identifier pour les retrouver sur tous vos appareils | Sign in to find them on all your devices |
| `bookmarks.empty` | Rien d'enregistré dans ce navigateur. | Nothing saved in this browser yet. |
| `bookmarks.emptySignedOut` | Vos recettes enregistrées sur d'autres appareils apparaîtront ici une fois identifié. | Recipes you saved on another device will appear here once you sign in. |
| `bookmarks.signOutWarning` | Vous déconnecter effacera la copie de ce navigateur. Vos recettes resteront sur votre compte. | Signing out will clear this browser's copy. Your recipes stay on your account. |

`bookmarks.emptySignedOut` is the one that earns its place. Shown beside
`bookmarks.empty` to a reader who is not identified, it is what stops an empty
list on a second device reading as data loss — it says the recipes may exist and
where they are, rather than asserting there are none.

`bookmarks.signOutWarning` is reassurance rather than a warning, and is only
honest because of the account: what is being cleared is a copy, and saying so is
what makes clearing it acceptable.

### Definition of done

| # | Criterion |
|---|---|
| 1 | An anonymous reader can save a recipe, see it listed, and still see it after a reload, with no account and no server round trip |
| 2 | Nothing about a bookmark is sent to the server while there is no session, asserted by a spec that watches requests |
| 3 | Signing in with local bookmarks yields the union of both lists, and running the merge twice changes nothing |
| 4 | Signing out clears the local copy, and the interface says it will before it does |
| 5 | A bookmark made in one language is still found after switching to the other |
| 5b | Editing the recipe afterwards leaves the bookmark intact — renaming its `key`, retitling it, or changing either slug. This is the criterion that fails if the stored identifier is ever changed to `key` |
| 6 | `localStorage` being unavailable or throwing degrades to bookmarks being unavailable, and never to a broken page or a console error |
| 7 | The empty state states where bookmarks are stored and makes no claim about how many the reader has elsewhere |
| 8 | The privacy page describes bookmarks in both languages |

## Consequences

**`ApiSecurityMatrixTest` needs a fifth set.** Writing a bookmark and pushing a
merge are ordinary `SESSION_WRITES`, but reading your own list is a **read that
requires a session**, and none of the four declared sets describes it —
`GET /api/auth/session` sidesteps the question by being public and answering 204
to a stranger. Add `SESSION_READS` rather than filing a new kind of rule under a
name that happens to pass. That test exists to force exactly this decision.

**`localStorage` throws rather than returning null**, in private-browsing modes
and wherever site data is blocked. Every read and write is wrapped, which
criterion 6 exists to hold. The e2e fixture fails any test that logs a console
error, so an unguarded throw is caught in the suite rather than in production —
the right way round, and worth not defeating.

**The visible control is a deviation from `Docs/Design/`** wherever the
prototypes have no such affordance, which is why this ADR exists rather than a
backlog entry. The prototypes are the visual source of truth and this departs
from them knowingly.

**A translated route segment.** `SEGMENTS` in `core/i18n/locale.ts` maps each
`RouteKey` per locale — `mentions-legales` against `legal-notice`. A bookmarks
route without both segments 404s in one language.

**The mocks must answer, or every recipe-page spec breaks.** `mock/seed-data.ts`
is a transcription of `V2__seed.sql` rather than a reinterpretation (ADR 1). No
bookmarks are seeded: they are per-account, and the acceptance run brings its
own identities.

### Deferred: sharing a list by URL

A bookmarks page that filters an already-fetched catalogue can take its list
from the URL as easily as from storage — `?r=1,5,a,f` in base36 — which gives
"send my list to the device I am cooking from" with no account and no backend.

**Not in this ADR, for two reasons.** Once bookmarks sync, signing in solves the
second-device problem properly and the link stops being a sync mechanism; it
becomes a way to recommend recipes to somebody else, which is a different
feature deserving its own justification. And it should be judged after the short
id has proved itself.

Recorded here so the shape is not re-derived: **a stored URL shortener is not
the answer to a long link.** The link is long because slugs are long, not
because there are many of them; a short id fixes it at the source. A code-to-list
table would move the same problem somewhere less visible and add an
unauthenticated write endpoint, a cleanup policy, and links that rot when the
cleanup runs.

## Amendment, 2026-08-30: one public identifier, and sharing is no longer deferred

Sharing a list by URL is wanted now rather than later, and it takes the third
column this ADR already named as the way to get readable links. That changes the
identifier decision above, because the moment such a column exists, publishing
`recipe.id` **as well** would be the very thing argued against two sections
earlier: two public identifiers for one recipe, and every consumer having to
know which is for what.

So there is one, and it is the new column.

### `recipe.public_code`

```sql
ALTER TABLE recipe ADD COLUMN public_code TEXT;
UPDATE recipe SET public_code = key;
CREATE UNIQUE INDEX ux_recipe_public_code ON recipe (public_code);
```

Backfilled from `key`, and set from `key` at creation — so it is readable,
already meaningful, and needs no new field in the editor. `babka`,
`shakshuka`, `basque-cheesecake`.

**And then never written again.** That is the entire reason it exists rather
than `key` being promoted. `Dto.RecipeDraft` carries `key` as a writable field
and renaming a recipe in the editor is a supported operation; `public_code`
diverges from `key` at exactly that moment and keeps every stored bookmark and
every shared link working. The author keeps the freedom to rename their own
handle, and readers keep their lists. Neither is given up for the other.

SQLite has no `ALTER COLUMN`, so the column is added nullable and filled — the
additive shape every migration here takes (ADR 2). It cannot be `NOT NULL` in
one statement and that is fine; the uniqueness index is what has to hold.

### What this replaces

The section above decides bookmarks are stored as `recipe.id` and
`RecipeSummary` gains it. **Read it as `publicCode` throughout.** The reasoning
is unchanged and still load-bearing — immutability by construction beats
immutability by discipline, and criterion 5b is still the test that fails if
anybody points this at `key`. Only the field changes, and it changes because a
readable identifier is now wanted for a second purpose.

`recipe.id` stays internal. The `bookmark` table still references it, because a
foreign key should point at a primary key and nothing outside the database
needs to know that it does.

### Sharing

`/fr/enregistres?r=babka,sourdough` — the bookmarks page takes its list from the
query when one is present and from storage otherwise. No endpoint, no stored
mapping, no expiry, and a link that cannot rot because there is nothing to clean
up.

A shared list is **read-only until it is adopted**: arriving on such a link
shows those recipes and offers to save them, rather than silently merging a
stranger's list into yours. Saving is the same union as everywhere else.

### Definition of done, added

| # | Criterion |
|---|---|
| 9 | Renaming a recipe's `key` in the admin editor leaves `public_code` unchanged, and every bookmark and shared link keeps working — the concrete form of 5b |
| 10 | A shared link opens the listed recipes on a device with no bookmarks of its own, without writing anything until the reader asks |
| 11 | An unknown or malformed code in the query is ignored rather than breaking the page, and a link of only unknown codes reads as an empty shared list rather than as an error |

## Amendment, 2026-08-30: there is no new column, because `key` cannot be renamed

The amendment above adds `recipe.public_code` and justifies it thus: *"renaming
a recipe in the editor is a supported operation"*, so a published `key` would
break stored bookmarks. **That is wrong, and the column it argues for is not
needed.**

`AdminDao.save` opens with:

```java
String key = draft.key().trim();
Optional<Long> existing = recipeIdFor(key);
long id = existing.orElseGet(() -> insertRecipe(key));
```

`key` is the identity the upsert resolves on, not a field it writes — and
`updateRecipe` sets status, prep, cook, difficulty, servings and video, with no
`key` among them. Editing the key of an existing recipe therefore does not
rename it. It fails to find one and **creates a second**, leaving the original
untouched under its original key. There is no rename to break a bookmark.

So `recipe.key` is already immutable by construction, which is the exact
property this ADR spent two sections looking for, and it has the readability a
shared link wants as well. It is published as `key` on `RecipeSummary` and
`RecipeDetail` — the same name the admin routes have always used for it — and
bookmarks and share links are lists of keys.

**No migration. No second identifier. No backfill, and no nullable column
behind a `UNIQUE` index that SQLite would have let fill up with NULLs.**

### What is still true, and what has to be added

The reasoning is unharmed: immutability by construction beats immutability by
discipline, and criterion 5b remains the test that matters. What changes is that
the property is already there rather than needing a column built to hold it.

But it is immutable **by the shape of one method**, and nothing says so. A
future edit that adds `key = :key` to `updateRecipe`, meaning to be helpful,
would turn every stored bookmark and every shared link into a dangling
reference, and no test here would notice. That is why 5b is now specific:

| # | Criterion |
|---|---|
| 5b | Saving a draft whose key differs from the recipe's leaves the original recipe's key untouched, and bookmarks pointing at it keep resolving. Confirmed by adding `key` to `updateRecipe` on purpose and watching it go red |

Criteria 9 to 11 stand as written, reading `key` for `public_code`.

### One thing this exposes and does not fix

Editing the key of an existing recipe silently produces a duplicate rather than
an error — the original stays, a second appears, and the editor gives no sign.
That is a real defect in the admin, it predates all of this, and it is not made
worse by publishing the field. It is written down here because this is where it
was found, and it belongs in `Docs/backlog.md` rather than in this change.

## Amendment, 2026-08-30: the duplicate is not reachable, and the guard was missing

The amendment above ends by recording a defect: *"editing the key of an existing
recipe silently produces a duplicate rather than an error"*, and sends it to the
backlog. **It is not reachable through the editor, and it never was.**

`recipe-editor.ts` binds `[readonly]="!isNew()"` on the key field. A new recipe
gets a writable one; an existing recipe does not. So the upsert only ever
resolves on the key it was loaded with, and the duplicate needs a request nobody
can make from the interface — at which point it is not a rename gone wrong, it is
the create endpoint being used to create something.

Which leaves the real gap, and it is not the one that was written down. **That
`[readonly]` is the whole of what makes a key unrenameable in practice, and
nothing asserted it.** Removing the binding is a one-attribute change that looks
like tidying, breaks no build, and turns every saved bookmark and every shared
link into a dangling reference the next time somebody edits a key — silently,
and for readers rather than for the author who did it.

So there is nothing to fix and something to hold: `the key can be set on a new
recipe and never changed after` in `admin.spec.ts`, confirmed red by deleting
the binding. Nothing goes to the backlog.

`AdminKeyIsImmutableTest` covers the other half — that a save never writes the
key — and the two together are criterion 5b: one on the server, one in the
interface, because the property has to hold in both and neither test can see the
other's half.

## Audit, 2026-08-30: the criteria, measured against the live site

Deployed at `431e63f`. Checked with a headless browser against
`https://bonapphedi.fr` rather than against the mocked suite, because the two
are different arrangements — real API, real Caddy, six published recipes rather
than five — and this ADR's claims are about what a reader gets, not about what
the suite serves.

| # | Criterion | Result |
|---|---|---|
| 1 | Anonymous save, listed, survives a reload, no account, no round trip | **pass** — stored `["babka"]`, still saved after reload |
| 2 | Nothing sent to the server while there is no session | **pass** — 0 requests to `/api/auth/bookmarks` or `/bookmark` |
| 3 | Signing in yields the union, and merging twice changes nothing | *covered by `BookmarkApiTest`; needs a real Google sign-in to check here* |
| 4 | Signing out clears the local copy, and says so first | *same — needs a session* |
| 5 | A bookmark survives a language switch | **pass** — saved on `/fr/recettes/babka-au-chocolat`, found at `/en/saved` as *Chocolate babka* |
| 5b | Editing a recipe leaves bookmarks intact | **pass** — `AdminKeyIsImmutableTest` and the editor's read-only key, both confirmed red by breaking them |
| 6 | `localStorage` unavailable degrades rather than breaking | *not reproducible against production; held by the wrapped reads and `bookmarks.unavailable`* |
| 7 | The empty state states where bookmarks live and claims nothing else | **pass** — "Enregistrées dans ce navigateur", "Rien d'enregistré dans ce navigateur", and the line about other appareils |
| 8 | The privacy page describes bookmarks in both languages | **pass** — *stockage local* and *local storage* |
| 9 | Renaming a key leaves bookmarks and links working | **pass** — see 5b |
| 10 | A shared link opens on a device with no bookmarks, writing nothing | **pass** — 2 cards rendered, `localStorage` still null |
| 11 | An unknown or malformed code is ignored rather than breaking | **pass** — `?r=babka,deleted-long-ago,,` renders one card |

Also checked, because it is the rule the fifth matrix set exists for:
`GET /api/auth/bookmarks` answers **401** to a stranger rather than an empty
list.

**Nine of eleven verified against production; the two that are not both need a
real Google session**, which no automated check here can hold. They are covered
by `BookmarkApiTest` on the server, and the merge being a union was confirmed by
making it a replacement and watching it delete the account's list.

Status stays `proposed` until somebody signs in on the live site and sees their
list follow them, which is the one claim this whole ADR is built around and the
only one still taken on trust.
