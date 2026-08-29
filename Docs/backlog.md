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
back navigation supersedes the view transition the forward one started and the
browser aborts it. Nothing about focus is wrong when this happens.

*(This paragraph used to end "and Angular surfaces that as an unhandled
rejection". It does not — see the correction below, which is the reason the
queued fix was never built.)*

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

### The fix that was queued here should not be built — checked 2026-08-17

This entry used to offer two fixes and recommend the second: *stop a superseded
transition surfacing as an unhandled error*, on the grounds that it would fix
"the console of anyone using the site". Both halves of that turn out to be
wrong, and the recommendation with them.

**It is not an unhandled rejection.** `createViewTransition` in
`@angular/router` already attaches a `.catch()` to all three of
`updateCallbackDone`, `ready` and `finished`. What it does inside those
handlers is `console.error(error)` — deliberately, and **only when `ngDevMode`
is true**:

```js
transition.finished.catch(error => {
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    console.error(error);
  }
});
```

So there is nothing to catch that Angular has not caught. A `.catch()` of our
own, in `onViewTransitionCreated` or anywhere else, attaches to a different
promise chain and would not stop Angular logging on its own.

**And it cannot reach a visitor.** `ngDevMode` is false in a production build,
so the message exists in the e2e configuration and in `npm start`, and nowhere
that anyone visits. The argument for putting production code in the way of it
was the one thing that made this worth doing, and it was not true.

**It also no longer reproduces.** Eight runs on 2026-08-17, `--workers=1`,
clicking a card and calling `history.back()` inside the same frame — a harder
provocation than the deleted spec ever applied — logged nothing at all.

So: build nothing. If it does come back, the answer is a narrowly worded entry
in `IGNORED` in `frontend/e2e/fixtures.ts`, which is what that list is for and
is now a justified use of it rather than the fixture-weakening this entry once
called it: a framework logging a normal navigation outcome, in dev builds only,
is browser noise by the definition already written there. What must not happen
is production code added to suppress a message production never emits.

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

**Bytes, not frames — and this one has since been fixed.** A full scroll of 300
recipes transferred 76.6 MB and decoded 539 MP, because every card downloaded a
full-size photograph — 1600px wide, 150–425 KB — to fill a box 190px tall. Even
the first view was 6.8 MB before the visitor touched the wheel.

That was the `srcset` ADR 8 asked for and had not got. It shipped on
2026-08-17; the same harness, same catalogue, same viewport:

| | Before | After |
|---|---|---|
| Transferred, full scroll | 76.6 MB | **25.8 MB** |
| Decoded, full scroll | 539 MP | **60.5 MP** |
| Transferred before scrolling | 6.8 MB | **2.7 MB** |
| Frame p50 / p95 | 16.7 / 16.7 ms | 16.7 / 16.7 ms |

Nine times fewer pixels decoded and three times fewer bytes, for no change in
frame times — which is the shape you would expect, since frames were never the
problem. See ADR 8's amendment for how, and `MediaDerivativeTest` for what
holds it in place.

**~~The footer is most of the page's CLS~~ — fixed 2026-08-29.** 0.066 of the
0.083 at every catalogue size, attributed to `bah-site-footer` at ~100 ms. Now
0.0174 total and the footer is not in the list at all.

**The mechanism recorded here was wrong**, and it is worth saying how, because
the wrong one suggests a fix that would have done nothing. This entry said the
shift came when "the loading skeleton is replaced by content taller than it".
Instrumented on 2026-08-29, the shift lands with `.hero-skeleton` and
`.card-skeleton` already in the DOM and no `bah-recipe-card` yet: it is the
frame *before* that, when the shell has painted with an empty `<main>` and the
lazy route chunk has not arrived. `min-height: 100vh` on the host then does what
it is for and pins the footer to the bottom of the viewport; the skeleton
appearing pushes it back out of sight. The skeleton is tall. It ends the shift
rather than causing it, so making it taller or more accurate would have changed
nothing.

The fix is `main.unrouted` in `app.ts`, which reserves a viewport for exactly
that one frame, plus `loading the list › the footer never moves` in
`recipe-list.spec.ts` — confirmed to fail by removing the binding, at 0.1124,
which is over the "good" threshold on its own in an unoptimised build.

A blanket `min-height` on `main` would also have worked and would have been
wrong: it puts the footer below the fold on every short page for ever, and the
mentions légales being reachable is the one thing this footer exists for.

**~~The hero skeleton was the wrong size~~ — fixed 2026-08-29.** `.hero-skeleton`
used a `margin` where `bah-hero-carousel` uses `padding`, so its 8px bottom
collapsed into `.filters`' 56px top: 440px against the carousel's 488px, and
everything below the hero dropped 8px on every load. It also mirrored only the
first of the carousel's two breakpoints, standing 40px too tall below 640px —
which costs nothing today because on a phone the filters are already below the
fold while the hero loads, and a shift is only counted for what is on screen.

### Measuring one viewport was the reason both of these lasted

`grid-perf.mjs` ran at 1440×900 only and now takes `WxH` arguments, defaulting
to desktop **and** tablet. After both fixes:

| Viewport | Before | After |
|---|---|---|
| 1440×900 | 0.0174 | **0** |
| 820×1180 | 0.0131 | **0** |
| 390×844 | 0 | 0.0121 |

**The phone number went up, and that is the honest result rather than a
regression to undo.** Two shifts were cancelling by accident: the old skeleton
shrank 40px at the same moment the filter bar grew, and the net was under the
reporting threshold. Fixing the hero left the other one visible and correctly
attributed. Total across the three viewports went from 0.0305 to 0.0121.

## The filter bar grows when its own data arrives

What is left, and the only shift on the page. Measured at 390×844: `.filters`
goes from 167px to 226px at ~128ms, pushing the section heading down 59px.

The cause is `@if (tags().length)` in `filter-bar.ts`. The tag control is not
rendered until tags load, and on a narrow viewport its arrival adds a row to
`.selects`. The condition is right — a site with no tags should not show a tag
filter — but it cannot tell "none yet" from "none at all", because the bar
receives `[tags]="tags.value() ?? []"` and the resource's loading state stays
behind in the page.

So the fix is not a CSS one: it means passing that state in and rendering a
disabled control while it is pending, which is **a visible decision about what
the filter bar looks like before it is ready** rather than a defect to correct
quietly. 0.0121 against a "good" threshold of 0.1, so there is no hurry.

Do not reach for a `min-height` on `.selects`. It would have to be right at
every breakpoint and would be wrong the first time a control is added.

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
