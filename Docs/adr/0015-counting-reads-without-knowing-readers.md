# 15. Counting reads without knowing readers

Date: 2026-08-30 · Status: proposed

## Context

There is no audience measurement of any kind on this site, and that was a
decision rather than an omission. The privacy page says so in as many words:

> « Aucune mesure d'audience : ni Google Analytics, ni Matomo, ni équivalent.
> **Les visites ne sont pas comptées.** »

and, of reading a recipe:

> « Rien n'est enregistré et aucun cookie n'est déposé. Tant que vous vous
> contentez de lire, ce site ne sait rien de vous. »

The cost of that is real: **nothing here can answer which recipes people
actually read.** The admin analytics page shows ratings, reactions and comments,
which are the recipes people chose to *act* on. A recipe that is read three
hundred times and rated once looks, from inside this application, exactly like
a recipe nobody opened.

### What must not be given up to fix it

**No consent banner.** The absence of one is not luck — the YouTube facade in
`video/` exists precisely so that no Google request happens on page view, and
that is what keeps the site clear of a cookie-consent obligation. Any
measurement that reintroduces the obligation would spend something expensive to
buy something cheap.

**No third-party request.** `recipe-detail.spec.ts` asserts that nothing leaves
the origin, against `youtube.com`, `ytimg.com`, `gstatic.com` and `doubleclick`.
That test would have to be weakened to add a hosted analytics beacon, and it is
one of the more valuable assertions in the suite.

**No identifier attached to reading.** `visitor` exists and is deliberately
narrow: a row is created *the first time somebody writes* and never on a plain
page view, which is what makes `bah-visitor` a functional cookie rather than one
needing consent (V4's own header says this). Reading must stay outside that.

### What was considered and rejected

**Google Analytics or any hosted equivalent.** Cross-site by design, involves a
transfer out of the EU, requires consent, and is named on the privacy page as
something this site does not do. It fails every constraint above at once.

**Self-hosted Plausible or Umami.** Cookieless, and would keep the
no-third-party property if served from this domain. Rejected on proportion: it
is another service to run, back up and upgrade on a small VPS, plus a JS beacon
per page view, to answer a question that the application is already in the
right position to answer itself.

**Unique-visitor estimation by rotating daily salt.** `VisitorIdentity` already
computes a salted `HmacSHA256` of address and user agent and never stores a raw
address, so the primitive exists; rotating the salt daily would make cross-day
linkage impossible and is roughly how privacy-preserving analytics products
work. Deferred rather than rejected — it is a larger claim to defend, it likely
depends on CNIL's *mesure d'audience* exemption criteria being read carefully,
and it should not be bundled with a change that needs no such argument.

## Decision

**Count events, not people.** Two counters, both aggregate, both server-side,
both incapable of describing an individual because no row ever refers to one.

### Reads, per recipe, per day

A successful `GET /api/recipes/{slug}` is what "somebody opened this recipe"
means in this application, and it is the right hook rather than the document
request: there is no SSR, so moving between recipes inside the SPA fetches the
API and never re-fetches a document. Counting documents would miss almost every
read after the first.

Stored as a running tally keyed by recipe and date — no timestamp finer than a
day, no address, no user agent, no session, no visitor id, nothing that is
absent from that sentence.

### Arrivals, by referrer host, per day

The external referrer is only ever visible on the **document** request, which
`IndexHtmlController` already serves for every deep link. By the time the SPA
calls `/api/recipes/{slug}` the `Referer` is this site's own page, so this has
to hook a different request from the one above, and answers a different
question: not what is read, but how people arrive.

Only the **host** is stored — `google.com`, not the query that was searched —
aggregated by day, with no path and no full URL.

### Three things that would otherwise make the numbers a lie

**This site's own checks are traffic.** `deploy.ps1` finishes by requesting
`https://bonapphedi.fr/fr` and then
`https://bonapphedi.fr/fr/recettes/babka-au-chocolat`, so every deploy would
award babka a phantom read, and `/api/version` and `check.sh` add more. The most
deployed recipe would top the chart.

**Crawlers are most of the internet.** Without a user-agent filter the answer to
"what do people read" is largely "what Googlebot re-crawls".

**The list page is not a read.** `GET /api/recipes` fires on every visit to the
locale root; counting it as a read of anything would drown the per-recipe
numbers.

### Definition of done

| # | Criterion |
|---|---|
| 1 | Opening a recipe increments a per-day counter, and sets no cookie, writes no `visitor` row, and stores no address, user agent or session |
| 2 | No column of either new table can identify a person, and this is asserted by a test rather than by reading the schema |
| 3 | Known crawlers, and this repository's own deploy and health checks, are excluded — demonstrated by a test that feeds their user agents in and sees no increment |
| 4 | A read is counted once per recipe view, including views reached by in-app navigation rather than a fresh document |
| 5 | The admin analytics page shows reads per recipe over time, beside the ratings and comments already there, so the gap between "read" and "acted on" is visible |
| 6 | The privacy page, in both languages, states exactly what is counted, and no longer claims that visits are not counted |
| 7 | `recipe-detail.spec.ts`'s no-off-origin-request assertion still passes unchanged, and no consent banner exists |

## Consequences

**The privacy page changes, and that is the substance of this decision rather
than a side effect.** `privacy.nothingAnalytics` currently ends "Les visites ne
sont pas comptées", which stops being true, and `privacy.readingBody` opens
"Rien n'est enregistré", which stops being true in the letter while staying true
in the spirit. Both need rewriting in `fr.json` and `en.json` to say plainly:
the site counts how often each recipe is opened and where arrivals come from,
and knows nothing about who did either.

`check:legal` does **not** cover this. It guards the mentions légales fields —
publisher, directeur de la publication, contact, host — and nothing in it reads
the privacy page. So there is no gate that will notice the page drifting from
what the code does; criterion 6 exists because nothing else will enforce it.

**Two migrations and no new endpoint under `/api`.** The counting rides on
requests that already exist, and the reading is `GET /api/admin/stats`, which
`ApiSecurityMatrixTest` already declares as admin-only. If that changes — a
separate admin route for the time series, say — the matrix will fail until it is
declared, which is that test working as intended.

**The numbers start at zero and are not backfillable.** There is no historical
record to import; journald holds a rolling window of Caddy access logs and
nothing older. The first month is a baseline, not a measurement.

**Bot filtering is a maintenance surface.** A user-agent list is never finished
and is wrong in the quiet direction — a new crawler is counted as a person. It
should be written expecting to be edited, and the deploy and health checks
should be excluded by something more reliable than their user agent if one is
available.

**Tier 2 stays open.** Nothing here forecloses unique-visitor counting later;
this deliberately answers "what is read" and leaves "how many people" alone,
because the first needs no legal argument and the second does.
