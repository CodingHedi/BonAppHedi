# 14. Muting is a colour, not an opacity

Date: 2026-08-29 · Status: accepted

## Context

The site had never been measured for contrast. The first axe run — 2026-08-29,
eleven pages, both themes, signed out and signed in — found **134 failing
elements** under WCAG 2.1 AA, the worst at **1.82:1** where the standard asks
for 4.5.

That number is smaller than it looks. The 134 collapse into two mechanisms,
each of which is one decision made once and then inherited everywhere.

### One: `opacity` mutes the children too

Secondary text — captions, counts, hints, table headers, the footer — was
dimmed by putting `opacity` on its container. It is the obvious thing to write
and it is almost right: `opacity: 0.6` on near-black text over the page
background gives **4.39:1**, which fails 4.5 by a margin nobody would notice by
eye and no reviewer would catch by reading.

The real damage is that `opacity` is not a text property. It composites the
whole element, links included, and every one of those muted blocks was quietly
multiplying down a colour that had been chosen without it:

| Where | The rule | The link inside it |
|---|---|---|
| Legal page paragraphs | `opacity: 0.85` | 5.29:1 → **3.96:1** |
| Recipe breadcrumb | `opacity: 0.55` | 5.29:1 → **2.29:1** light, **1.82:1** dark |
| 404 hint | `opacity: 0.6` | the suggested recipe, dimmed |
| Comment sign-in prompt | `opacity: 0.55` | the sign-in link, dimmed |
| Reaction bar | `opacity: 0.6` | the heart button, at disabled strength |

Not one of those rules was about links. The breadcrumb's author was dimming a
trail of grey text; the consequence was the least readable element on the site.
That is the signature of the mechanism: the failure lands somewhere other than
where the decision was made, so reading the rule tells you nothing.

### Two: the fill colour was being used as text

`_typography.scss` carried `a { color: var(--color-accent) }`, verbatim from
the prototype's `<helmet>` block. `--color-accent` is the fill — buttons,
chips, the active dot — and as text it is:

| | On `--color-bg` | On `--color-surface` |
|---|---|---|
| Light, wine `#a04a64` | 5.29:1 ✅ | 5.74:1 ✅ |
| Dark, rust `#a15a35` | **3.13:1** ❌ | **2.64:1** ❌ |

So **every plain link on the site failed AA in the dark theme and passed in the
light one**, from a single rule that could not be wrong in both. The same
mistake was repeated by hand in five more places — the step list's video
timestamps, the admin tab strip, the comment composer's tabs, the published
badge in the recipe table.

The codebase already knew this was a trap. `--color-accent-text` exists, and
its comment says why: *"a single fixed step cannot serve as text in both
themes."* It was applied to ingredient amounts and quick-fact values and not to
links.

## Decision

**Two tokens, and a rule about which mechanism to reach for.**

```scss
--color-text-muted: color-mix(in srgb, var(--color-text) 65%, var(--color-bg));
--color-link: var(--color-accent-500);        /* light */
--color-link: var(--color-accent-300);        /* dark  */
```

**Mute text with `--color-text-muted`, never with `opacity` on a container that
holds a link.** A colour applies to the element's own text and leaves a child's
colour alone, which is the entire difference.

65% is a measured floor rather than a chosen shade. 60% is 4.39:1 against the
background; 65% is 5.16:1 and holds on both surfaces in both themes. The mix is
against `--color-bg` so the value follows the theme instead of being two hexes
to keep in step.

**`--color-link` is a third role, not a rename of either existing token.** The
light value is deliberately identical to what shipped — accent-500, the same
wine — so nothing about the light theme changes. Only the dark theme moves, to
accent-300 at 7.40:1. `--color-accent-text` was the obvious candidate and is
wrong for links: it resolves to accent-700 in the light theme, a near-black
wine that is right on a bold 16px quick-fact value and wrong on a link, because
these links carry no underline and colour is the only thing saying they are
links.

accent-400 is the trap in the middle. It clears the dark background at 5.03:1
and fails the dark surface at 4.24:1 — so it would have passed on most of the
site and broken on cards, which is the worst available outcome.

`opacity` keeps every other job it had: fading a control in and out, the
disabled state, `.lang.missing`. What it stops being is a way to make text
quieter.

## Consequences

**134 → 0.** `frontend/e2e/accessibility.spec.ts` now audits eleven pages in
both themes with `color-contrast` enabled, and it is green. The rule is
enforced from here rather than deferred.

**The audit covers what it says it covers, which it did not at first.** The
first signed-in list guessed `/fr/admin/recettes`; the admin sub-paths are not
translated, so three "admin" audits were auditing the 404 page. A wrong path in
an audit does not fail — it passes, against the wrong page — so the helper now
asserts that the numeral is absent unless the 404 is the page under test.

**One exclusion, and it is a WCAG exemption rather than a debt.** The 404's
numeral is 76px of ornament at `opacity: 0.22`, already `aria-hidden`, saying
nothing the heading does not say in words. WCAG 1.4.3 exempts text that is pure
decoration. Excluded by selector rather than by disabling the rule, so the rest
of that page is still audited.

**A second test guards the mechanism directly.** `muted text does not dim the
links inside it` walks every link's ancestors and fails on any computed
`opacity` below 1. Confirmed to fail by putting `opacity: 0.85` back on the
legal page, which reddens both it and the axe sweep.

**Two things visibly change.** Secondary text across the site is slightly
darker — 0.55/0.6 to an effective 0.65, the difference between 3.76:1 and
5.16:1. And the reaction bar's heart button is now at full strength instead of
60%, because the muting belonged to the count beside it and had been applied to
the whole row; a control drawn at the opacity a disabled control uses was
saying the wrong thing.

**Dark-theme links are visibly lighter**, from rust to sand. That is the one
change a reader of the dark theme will notice, and it is the change that takes
them from 3.13:1 to 7.40:1.

Neither theme's palette moved. `Docs/Design/` is untouched, no ramp stop
changed value, and this is not a deviation from the prototypes in the sense
ADR 6 means — it is two new roles assembled from stops that were already there.
