# 12. A date reads two ways, and the card stopped being one link

Date: 2026-08-17 · Status: accepted

## Context

Every date on the site was relative: "il y a 4 jours", "4 days ago", everywhere
a date appeared. The prototypes draw it that way and it was never wrong, but it
answers only one of the two questions a date gets asked.

The two are genuinely different. A card in a list is being **scanned** — what is
new, what have I not read — and there "il y a 4 jours" is the useful fact and an
exact date is noise. A recipe you have **opened** is being read, and there the
date it was published is the fact; "il y a 27 jours" makes you do arithmetic to
find out whether it predates something else.

Neither can simply replace the other, so both have to be reachable.

## Decision

**The recipe page leads with the date; everywhere else leads with the relative
form.** Cards, comments, the admin moderation queue and the admin recipe table
all keep relative time as the default, because all four are lists being scanned.

**Pressing a date swaps it in place**, and pressing again swaps back. One
component, `bah-timestamp`, takes the ISO timestamp and which form to show
first.

**Swapped in place rather than shown in a bubble.** A popover has to be
positioned, dismissed, kept out of the sticky header's stacking context, and
kept out of the card's `overflow: hidden`; a button whose label changes has none
of those failure modes and behaves identically under touch, mouse and keyboard.
The affordance is a dotted underline — dotted rather than solid so it does not
read as a link on a card whose title already is one — and the other form is also
offered as the native `title` on hover.

**The month is spelled out, in both languages.** This is the substantive
decision in the change, and it is not typographic taste.

| Locale tag | `dateStyle: 'long'` | `dateStyle: 'short'` |
|---|---|---|
| `fr-FR` | 8 juillet 2026 | 08/07/2026 |
| `en-GB` | 8 July 2026 | 08/07/2026 |
| `en-US` | July 8, 2026 | 7/8/26 |

`08/07/2026` and `7/8/26` are the same instant. The failure is not that one
looks foreign to the other's reader — it is that **each reads cleanly as a
different day**, with nothing on the page to signal which convention is in
force. A bilingual site cannot use a numeric date. A spelled-out month cannot be
misread in either language, and it costs four characters.

**`absoluteDate` formats through `LOCALE_IDS[locale]`, never the bare tag.**
`Intl.DateTimeFormat('en', …)` resolves to American conventions; this app is
`en-GB`, and the mapping already existed for `LOCALE_ID`. Nothing else in
`format.ts` had this problem, which is why it was easy to miss: a decimal mark
and a relative time are the same in both Englishes, and a date is not.

**No `timeZone`, so the date is the reader's own.** That agrees with
`relativeTime`, which works in elapsed milliseconds and is therefore already in
the reader's frame. Pinning one to UTC and not the other would let a page say
"yesterday" beside tomorrow's date.

**The recipe card is an `<article>` with a link stretched across it**, rather
than one enormous `<a>`. This is forced rather than chosen: the card now holds a
button, a control inside a link is invalid HTML, and browsers resolve the
ambiguity by navigating — so the swap could never have fired there. The title
carries the link and `.title-link::after` covers the card; the timestamp sits
above that layer.

**`RelativeTimePipe` is deleted rather than left unused.** Two ways to draw a
date, one of which silently produces the version that cannot be swapped, is a
coin flip for whoever adds the next one. `relativeTime()` in `shared/format.ts`
is still the single implementation — only the second entrance to it is gone.

## Consequences

**The card's accessible name improved as a side effect.** The wrapping `<a>`
took its name from everything inside it, so the link announced the title, the
excerpt, the author and the date as one string. It is now the recipe title.

**Two tests guard the stretched link, and both are necessary.** Pressing the
date must not navigate; pressing anywhere else must. The second is the one that
would fail silently — a stretched link that stopped covering the card would
leave only the title clickable, and every existing spec clicks the title area.

**The date assertions derive from the `datetime` attribute rather than from
literals.** The mock seeds are pinned to `SEED_NOW` (2026-07-25) while real time
moves, so the babka is "4 days ago" in the seed's frame and 27 days in the
present. A literal would have passed the day it was written and failed on a
Tuesday, which is the flake that looks like a regression.

**The American-order guard was confirmed by breaking it.** Making `absoluteDate`
pass the bare tag turned three unit tests and the e2e red; restoring it turned
them green. A locale test that has never been shown to fail is indistinguishable
from one that reads the machine's own locale and agrees with itself.

**Relative time was already computed from the stored timestamp** and still is —
`publishedAt` is ISO-8601 UTC and nothing has ever shipped a pre-rendered "ago"
string. There is now a test proving the *absolute* form comes from the same
timestamp, so neither can drift into a server-formatted field without something
saying so.

**This deviates from the prototypes**, which show relative time on the recipe
page. ADR 6 is the standing record for that class of change; this is the entry
for dates.
