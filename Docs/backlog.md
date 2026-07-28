# Backlog

Things worth doing that are not scheduled, and not urgent enough to interrupt a
milestone. Anything with a real decision behind it belongs in `Docs/adr/`
instead; this is for work whose *shape* is already obvious and whose only open
question is when.

Delete an entry when it ships. An entry that has sat here through two milestones
is probably not wanted — say so and remove it rather than letting the list rot.

---

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

## scripts/verify.ps1

`TESTING.md` referred to it for months; it has never existed. The two halves are
verified separately, which works and is what everyone actually types.

Worth it only if CI or a deploy step needs one command. If that day does not
come, delete this entry rather than writing the script to make an old sentence
true.
