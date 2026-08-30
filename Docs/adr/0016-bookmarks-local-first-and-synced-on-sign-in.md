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
