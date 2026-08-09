# 9. "Vin et olive" replaces the Umber palette

Date: 2026-08-09 · Status: accepted

## Context

`Docs/Design/index.html` and `recipe.html` are the visual source of truth, and
the implementation matches them pixel-close. ADR 6 records the handful of places
that deliberately do not ship as drawn, so that a reader comparing the app to
the prototypes does not "fix" them back.

The palette is now one of those places, and it is by a wide margin the largest.
Umber — sand `#efe6d6`, rust `#a15a35`, spruce `#4f7d74` — is replaced by wine
`#a04a64` and olive `#77854a` on near-neutral greys. The reason is preference:
the light theme was not liked. That is a sufficient reason for the one part of a
personal cookery site that is entirely a matter of taste, and it is recorded
plainly rather than dressed up as a usability finding.

**This gets its own ADR rather than a note in ADR 6**, on the same test ADR 7
applied to the profile page: ADR 6 collects deviations that change *a* screen,
and this changes every screen at once. It also inverts one of the palette's
structural relationships, which is the kind of thing a one-line entry in a list
would lose.

### What is not being deviated from

Only colour values changed. No token was renamed, added or removed; the radii,
the shadows, the fonts, the layout, the `--on-photo` pair and the scrims are
untouched, and everything non-colour in `styles/_tokens.scss` is still verbatim
from the prototypes. `Docs/Design/` itself is not edited — it stays the Umber
record. `Docs/design-tokens.md` now carries both palettes, shipped values first
and Umber beside them, since that document already claimed to be "the place to
look when the prototypes and the app disagree" and this is the disagreement.

## Decision

### Surface is lighter than background, which reverses Umber

Umber had surface `#e0d3ba` *darker* than bg `#efe6d6`, so cards sank into the
page. Now surface is `#ffffff` on bg `#f8f5f4` and they lift off it. This is the
single change most likely to be mistaken for an error and swapped back, so it is
noted in `_tokens.scss` as well as here.

It has two consequences that were measured rather than guessed, and both are
accepted:

**`.washed` bands are subtler.** The band computes
`color-mix(in srgb, var(--color-surface) 78%, var(--color-bg))`, which now
resolves to `#fdfdfd` against a `#f8f5f4` page — a contrast ratio of 1.07, down
from Umber's 1.15. It is still visible and it is used 26 times on the list page.
Worth knowing before anyone reaches for the obvious fix: setting surface to an
off-white such as `#fdfbf7` makes this **worse**, not better (1.04), because
such a value sits closer in luminance to the new background than pure white
does. If the band ever needs strengthening the lever is the background or the
mix ratio, not the surface.

**`.btn-secondary` on a `.card` is an outline button.** Both take their
background from `--color-surface`, so they are now the same white and the button
is defined by `--color-divider` alone. This is expected. It also means no change
to `--color-surface` can separate them — they move together by construction.
Cards separate from the page by `--shadow-*`, which is why this reads correctly
in practice.

### The accent ramps stay identical in both themes

Unchanged from Umber and worth restating, because it is what makes the dark
theme almost free: both ramps are declared once on `:root` and inherited, so
`:root[data-theme='dark']` overrides only its four neutrals, `--color-accent-text`
and the shadows. Those four neutrals were warm browns belonging to Umber and are
re-neutralised here; nothing else in the dark block moved.

### Three copies of the background colour, and they are not reducible

`--color-bg` is duplicated in two places that cannot read SCSS: the blocking
theme script in `index.html`, which runs before Angular precisely so the page
does not paint light and snap to dark, and `THEME_COLOR` in `theme.service.ts`,
which keeps `<meta name="theme-color">` correct when the theme is toggled
afterwards. Miss either and the browser chrome desynchronises from the page.

This is a pre-existing hazard that this change surfaced rather than created, and
it is not worth engineering away — a build-time injection step to save two
constants would cost more than it saves. It is instead written down in
`theme.service.ts`, and `smoke.spec.ts` asserts the computed `--color-bg` in
both themes, which is what actually catches a partial edit.

## Consequences

**The avatar tint ramp no longer relates to the palette, and is left alone
deliberately.** `core/avatar/avatar-token.ts` documents `AVATAR_TINT_HUES` as
anchored at both accents — slot 0 the hue of `--color-accent`, slot 5 the hue of
`--color-accent-2`, four steps between — so that the picker introduces no colour
the design does not already use. Those hues are `[20, 42, 68, 104, 140, 171]`,
which spans rust to teal. The new accents are hue 342 and hue 74, so the stated
anchoring is now false.

It is not changed here, for a reason worth recording: the hues are presentation,
but the *slots* are stored in `app_user.avatar` against real accounts (ADR 7).
Re-anchoring the ramp silently recolours every avatar anybody has already
chosen. That is defensible — an avatar is decoration and no token becomes
invalid — but it is a design decision about existing accounts, not a mechanical
consequence of a palette swap, and bundling it into one would have hidden it.

`profile.spec.ts` still passes: it measures background × ink contrast within the
avatar ramp, which is self-consistent regardless of what the site's accents are.
So nothing fails, which is exactly why this is written down.

**The hero kicker is illegible in the light theme, and was before.** `.kicker`
is `--color-accent-300` over what the design assumes is a dark scrim. It is not:
with no photography, every hero is the light placeholder panel, and the scrim
gradient has not darkened at the kicker's position. Confirmed by rendering the
same page under both palettes — Umber's `#dba377` is washed out there in exactly
the same way as wine's `#dfa0b0`. So this is not a regression, and it should
resolve when real photographs land (ADR 8) rather than by moving the `300` stop.

**Contrast improved where it is load-bearing.** The tag pairs clear the 4.5:1 bar
with room — `accent-100` on `accent-800` is 12.08, `accent-2-100` on
`accent-2-800` is 10.47 — and `accent-700` as ingredient and step text on the
light surface goes from 7.18 to 10.66. `::selection` is 11.57.

**Comments naming the old colours were corrected in a follow-up, and there were
more of them than first reported.** The initial count was two; a full sweep for
every Umber hex and for the words *umber*, *rust*, *spruce*, *teal* and *sand*
found nine, across `_primitives.scss`, `_typography.scss`, `filter-bar.ts`,
`tag-chip.ts`, `seed-data.ts`, `icons.data.ts`, `avatar.ts` and `image.ts`.

The fix was not to substitute new hexes for old ones. Where a comment named a
colour that a token already names — "accent-800 on `#332c24`" — it now names the
token instead, so the next palette change cannot falsify it. Hexes survive in
comments only where the specific value is the point.

One comment was left saying *teal* on purpose: `avatar.ts` explains why a chosen
ink is desaturated relative to the accent, and the avatar ramp genuinely still
runs to teal — see below.

**The screenshots in `Docs/Design/screenshots/` now differ from the running app
in colour.** That is intended and follows from not editing the prototypes.
TESTING.md already warns against generating baselines from `Docs/Design/`; this
gives that warning a second, larger reason.
