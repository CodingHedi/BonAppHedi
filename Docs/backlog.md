# Backlog

Things worth doing that are not scheduled, and not urgent enough to interrupt a
milestone. Anything with a real decision behind it belongs in `Docs/adr/`
instead; this is for work whose *shape* is already obvious and whose only open
question is when.

Delete an entry when it ships. An entry that has sat here through two milestones
is probably not wanted — say so and remove it rather than letting the list rot.

---

## ~~`the focus request does not linger` fails about half the time~~ — gone

**Resolved 2026-08-11, by deletion rather than by either fix below.** The
header's magnifier stopped navigating to the recipe list: it now opens a quick
search in place. `SearchFocusService` existed only to carry "focus the box"
from the header to the filter bar, so it went, and the three specs covering the
hand-off went with it — this one among them.

Worth keeping the analysis below rather than deleting the entry outright. The
mechanism is not specific to that spec: **any** spec that navigates back inside
a frame of arriving can abort a view transition, and the fixture will fail it on
the console error. Nothing else does that today. If something starts to, the
diagnosis is already written down.

---

### The analysis, as it stood

**Measured 2026-08-10: 4 failures in 8 runs**, `--repeat-each=8 --workers=1`,
against a clean `main` with everything else stashed. Then 1 in 5 with an
unrelated change applied — the same coin, not an improvement. It is no longer
rare and it gates every merge, because green `verify` is the bar.

**It does not fail on the focus assertion.** It fails on the fixture, which
refuses a test that logged a browser error:

```
console.error: AbortError: Transition was skipped
```

The spec presses the magnifier, clicks a card, then `goBack()` immediately. The
back navigation supersedes the view transition the forward one started, the
browser aborts it, and Angular surfaces that as an unhandled rejection. Nothing
about focus is wrong when this happens.

### Two things this entry used to say that the measurement contradicts

- *"It did not fail in isolation, which points at the parallel run rather than
  the assertion."* It fails in isolation, on one worker, half the time. The
  parallel run is not the cause and eight workers on one dev server is not the
  mechanism.
- *"About one run in ten."* Not any more, whatever it was on 2026-07-28. Either
  it worsened or the earlier sample was lucky; five green full runs on
  2026-08-08 do not distinguish those and neither does anything here.

The earlier note about `expect.poll` still stands and is still not the issue:
`toBeFocused()` is web-first and retries. **Nothing about the assertions needs
changing** — a spec asserting the right thing is being failed by an error the
page logged, which is the fixture working as designed on a genuine console
error.

### The fix is a decision, not a diagnosis

Two ways, and they are not equivalent:

- **Wait for the transition to settle before `goBack()`.** Confined to the
  spec, changes no production code, and is arguably honest — no real visitor
  navigates back within a frame of arriving. It also makes this one spec quiet
  while leaving every other back-navigation free to log the same error.
- **Stop a superseded transition surfacing as an unhandled error.** Fixes the
  cause for every spec and for the console of anyone using the site, which is
  where it actually belongs — a transition that was skipped because a newer
  navigation replaced it is normal, not a fault.

The second is almost certainly right, and it is the one that needs care: it
touches what the e2e fixture guarantees, and `CLAUDE.md` calls failing on
console errors the highest-value behaviour in the suite. Narrow it to this
rejection rather than relaxing the fixture.

## Infinite scroll, virtualisation, and what would force search server-side

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

**The constraint is rendering, and it is not really about search.** What breaks
first is a thousand cards in the DOM with no virtualisation, which is a scrolling
problem long before it is a filtering one. Search only moves server-side as a
*consequence* of how that gets solved — not because search got slow.

### Two things are called "infinite scroll", and only one is free

The preference here is infinite scroll over pagination. Worth separating, because
the difference decides whether the search rewrite happens at all:

- **Render-only** — fetch the whole catalogue exactly as now, reveal it
  progressively. Purely a rendering strategy. Search stays instant and local, no
  new endpoint, no second shape to keep in step.
- **Fetch-on-scroll** — pages arrive as you scroll. Identical to pagination for
  this purpose: you cannot filter over what you have not fetched, so search goes
  server-side and gains a round trip per keystroke.

An earlier version of this entry said client-side filtering stops working *by
definition* once the list is paged. That is true of the second and false of the
first, which is the whole point: the cheap option sidesteps the problem the rest
of this entry is about.

### Three costs that are specific to this site

**Crawling, and it cuts the opposite way from usual.** There is no SSR (ADR 4),
so Googlebot renders the JS — and today every recipe therefore ends up in the
DOM and is indexable. **Googlebot does not scroll.** Infinite scroll would leave
it only the first batch. So would virtualisation. Rendering everything is
accidentally the most crawlable arrangement available, which matters more than
usual for a site that wants to be found by recipe name. The thing that bounds the
DOM is the same thing that hides content from crawlers.

**Scroll restoration is on and is relied upon.** `app.config.ts` sets
`scrollPositionRestoration: 'enabled'`, so leaving a recipe returns you to your
place in the grid. Content that has not been revealed yet cannot be restored to,
and `recipe-list.spec.ts` already asserts on what survives a `goBack()`.

**The footer is not only a footer.** Mentions légales are legally required of a
French site, `check:legal` is a deploy gate because that page once shipped
incomplete while the site was live, and infinite scroll is the pattern that puts
a footer permanently out of reach.

### So — measured 2026-08-17, and the answer is leave it alone

`scripts/grid-perf.mjs` profiles the production build against a synthesised
catalogue. 1440×900, images served locally, three sizes in one run:

| Recipes | DOM nodes | Load | Frame p50 / p95 / worst | Frames > 32ms | Long tasks |
|---|---|---|---|---|---|
| 6 | 278 | 661 ms | 16.7 / 16.8 / 16.8 ms | 0 | none |
| 100 | 2 346 | 692 ms | 16.7 / 16.7 / 16.8 ms | 0 | none |
| 300 | 6 746 | 777 ms | 16.7 / 16.7 / 16.8 ms | 0 | one, 55 ms |

**The grid is not slow at 300, and it is not close.** A locked 60 fps through a
full scroll of the catalogue, not one dropped frame, and 116 ms of extra load
time for fifty times the recipes. The rendering constraint this entry was
waiting to find is not there at the sizes this site will plausibly reach, so
nothing below it triggers: no virtualisation, no infinite scroll, no
server-side search. Client-side filtering over a whole fetched catalogue is
comfortably the right design and stays.

**Lazy loading bounds the decode, and does it independently of catalogue
size.** 24 of 300 images decoded before a scroll — the same 24 as at 100 — for
43 MP and 6.8 MB. That is what `loading="lazy"` is worth here, and it means the
first view costs the same whether the site has a hundred recipes or a thousand.

**Zero layout shift from the cards is real. The reason given for it was not.**
The page's shift is 0.067 at 6 cards and 0.083 at 300 — essentially flat, and
no shift is ever attributed to an image, a card or `bah-image`. But three
places said this worked because `image.ts` reserved the box from the stored
`width`/`height`, and `image.ts` reads neither. The box is the *caller's*: a
flat `height: 190px` on the card, `aspect-ratio: 16/9` on the detail page. All
three comments now say so, and `recipe-list.spec.ts` asserts the box rather
than the consequence — confirmed to fail by removing the height, which turns
five identical 190px boxes into five image-shaped ones.

### What the measurement did find

**Bytes, not frames.** A full scroll of 300 recipes transfers 76.6 MB and
decodes 539 MP, because every card downloads a full-size photograph — 1600px
wide, 150–425 KB — to fill a box 190px tall. Even the first view is 6.8 MB
before the visitor touches the wheel. Nothing here is slow on a desktop with a
local server, and all of it would be felt on a phone.

That is the `srcset` that ADR 8 asked for and did not get: it wants "a bounded
set of generated derivative sizes", the bound is currently one, and
`PhotoIngest` records the narrowing. **This is the entry that should be picked
up next**, and it is a different piece of work from anything above — it belongs
to the images, not to the list.

**The footer is most of the page's CLS**, at every catalogue size: 0.066 of the
0.083, attributed to `bah-site-footer` at ~100 ms, when the loading skeleton is
replaced by content taller than it and the footer stops sitting at the bottom
of the viewport. Under the 0.1 "good" threshold and therefore not urgent, but
it is the largest single shift on the page and it has nothing to do with the
grid.

If a rendering constraint ever does appear: virtualise rather than
infinite-scroll, and keep crawlable paginated URLs alongside for Googlebot.
That bounds the DOM, keeps search instant, and leaves the footer reachable.

If search ever does have to move, the middle path is worth remembering: fetch a
**slim index** for searching — `slug`, `title`, `searchText`, about a third the
size, 16 KB gzipped at three hundred recipes — and page the full records for
display. The cost is a second endpoint and a second shape to keep in step.

Until then, leave it. Moving it early makes the search *slower*: a round trip per
keystroke where there is now none. `RecipeQueryDao` already understands `query`,
`tag`, `author` and `sort` and will still be there.
