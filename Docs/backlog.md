# Backlog

Things worth doing that are not scheduled, and not urgent enough to interrupt a
milestone. Anything with a real decision behind it belongs in `Docs/adr/`
instead; this is for work whose *shape* is already obvious and whose only open
question is when.

Delete an entry when it ships. An entry that has sat here through two milestones
is probably not wanted — say so and remove it rather than letting the list rot.

---

## `the focus request does not linger` fails about one run in ten

Seen once on 2026-07-28 during a full `verify`, in `recipe-list.spec.ts`. Then it
passed 6/6 on its own and twice more in full runs, so it is intermittent and rare
rather than broken.

Not chased, because nothing in the change that surfaced it touches the recipe
list — but written down because an intermittent e2e failure otherwise costs
somebody an afternoon working out whether their own change caused it. It did not
fail in isolation, which points at the parallel run rather than the assertion:
eight workers on one dev server, and this spec asserts on focus and on a query
parameter being cleared, both of which are timing-sensitive.

**Did not recur in five full-suite runs on 2026-08-08**, all 154 green. That is
not proof against a one-in-ten flake, but it is the only evidence there is.

An earlier version of this entry proposed `expect.poll`, on the grounds that
`getAttribute` and `document.activeElement` do not retry. **That does not apply
here** — the spec uses `toBeFocused()` and `not.toBeFocused()`, which are
web-first and retry until the timeout. Whatever this is, it is not that, and
rewriting a passing spec against a wrong diagnosis would only hide it.

If it recurs, the negative assertion is the place to look. `not.toBeFocused()`
passes the moment focus is absent, so it cannot see focus that arrives *after*
it has passed — a real lingering-focus bug and a green run are compatible. The
honest check is whether focus is still absent a beat after `goBack()` settles,
not whether it is absent at the first opportunity.

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
