# Backlog

Things worth doing that are not scheduled, and not urgent enough to interrupt a
milestone. Anything with a real decision behind it belongs in `Docs/adr/`
instead; this is for work whose *shape* is already obvious and whose only open
question is when.

Delete an entry when it ships. An entry that has sat here through two milestones
is probably not wanted — say so and remove it rather than letting the list rot.

---

## Precompile the ICU plurals, and drop `'unsafe-eval'`

The CSP that shipped has one term in it that a CSP exists to forbid.
`@jsverse/transloco-messageformat` compiles `{count, plural, …}` into JavaScript
with `new Function` at runtime, and exactly two messages need it — `list.count`
and `comments.heading`. Without `'unsafe-eval'` both render empty.

Two ways out, and neither is urgent for two strings: precompile the plural rules
at build time, or hand-write the two cases and drop the dependency. The second
is smaller than it sounds — French pluralisation here is "1 recette" against "N
recettes".

Worth doing when the translation setup is next opened up. Until then the term is
documented where it is used, in `deploy/Caddyfile`.

## Every list-page request is made twice on first load

Measured against the live site on 2026-07-28, six loads in fresh contexts. Each
one fetches `recipes`, `recipes/featured`, `tags` and `authors`, cancels most of
them, and immediately issues them again. The page is correct every time — hero,
cards and both filters rendered in 6 of 6 — so this costs bandwidth and log
noise rather than behaviour.

The cause is the locale signal settling after the resources have already fired.
`routesFor` applies the locale in a `canActivate`, that writes to
`LocaleService.locale`, and every `resource()` on the page has `locale` in its
`params` — so Angular aborts the in-flight request and starts a new one. The
browser reports the first as `net::ERR_ABORTED`.

Invisible in every suite, and will stay invisible: the mocks do not use
`HttpClient`, so there is no request for the e2e fixture to see fail. It only
appears against the real API.

Not urgent — nobody sees a wrong page. Worth doing when the list page is next
opened up: resolve the locale before the resources are created rather than
alongside them, so the first attempt is the only attempt.

## What would actually force search server-side

`RecipeListPage` fetches the catalogue once per locale and every filter — the
query, the tags, the author, the sort — runs in a computed over the result. Load
once, search what was loaded. That is the design, it is right, and it scales much
further than an earlier version of this entry claimed.

**Measured, rather than assumed.** The list endpoint returns ~715 bytes per
recipe. Synthesised up to realistic catalogues, with varied text so gzip cannot
cheat on repetition:

| Recipes | Raw | Gzipped |
|---|---|---|
| 100 | 75 KB | 10 KB |
| 300 | 225 KB | 27 KB |
| 1000 | 752 KB | 89 KB |

27 KB at three hundred recipes is not a page-load problem — the initial JS bundle
is 156 KB. Payload is not the constraint, and the note in `recipe-list-page.ts`
about "a few hundred recipes" was pessimistic by roughly an order of magnitude.

**The constraint is pagination, and it is not really about search.** What breaks
first is rendering: a thousand cards in the DOM with no virtualisation, which is
a scrolling problem long before it is a filtering one. The moment the list is
paged, though, client-side filtering stops working *by definition* — you cannot
filter over pages you have not fetched. So search moves server-side because
pagination arrived, not because search got slow.

When that day comes there is a middle path worth remembering, because it keeps
what is good about today's behaviour: fetch a **slim index** for searching —
`slug`, `title`, `searchText`, about a third the size, 16 KB gzipped at three
hundred recipes — and page the full records for display. Search stays instant and
local, the grid pages properly. The cost is a second endpoint and a second shape
to keep in step with the first.

Until then, leave it. Moving it early makes the search *slower*: a round trip per
keystroke where there is now none. `RecipeQueryDao` already understands `query`,
`tag`, `author` and `sort` and will still be there.
