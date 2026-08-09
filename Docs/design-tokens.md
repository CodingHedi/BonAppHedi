# Design tokens

Extracted from `Docs/Design/index.html` and `recipe.html`.

The implementation lives in `frontend/src/styles/_tokens.scss`; this file is the
human-readable record of *why* each value is what it is, and the place to look
when the prototypes and the app disagree.

> **The colours disagree, and this is that place.** The prototypes specify
> "Umber" — sand, rust and spruce. The site ships **"Vin et olive"**: wine and
> olive on near-neutral greys, and a surface *lighter* than the background
> rather than darker. See ADR 9 for why, and for the two ramps that were
> deliberately left pointing at Umber.
>
> Every colour table below gives both: **shipped** first, Umber second. Nothing
> else in this document diverges — the typography, radii, shadows, layout and
> the colours that sit on photography are all still as drawn, and `Docs/Design/`
> itself is never edited.

> **Note on provenance.** The prototypes referenced a design-system stylesheet
> (`_ds/organic-…/styles.css`) that was never supplied. Everything below marked
> **reconstructed** is inferred from the screenshots and from how the value is
> used in the prototype's inline styles. Everything else is verbatim.

---

## Typography

| Role | Family | Weights | Used for |
|---|---|---|---|
| `--font-heading` | Bricolage Grotesque | 600, 700 | h1–h4 |
| `--font-body` | Work Sans | 400, 500, 600 | everything else |
| `--font-logo` | Oswald | 600 | the wordmark only |

Self-hosted via `@fontsource-variable/*` rather than the Google Fonts CDN — the
CDN discloses visitor IPs to Google, which is a problem for a French site (see
ADR 5's neighbours in the privacy notes). The prototype's `@import` URL is kept
here only as the record of which faces and weights were chosen:

```
https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Work+Sans:wght@400;500;600&family=Oswald:wght@600&display=swap
```

### Logo

Two-line uppercase wordmark, set as SVG `<text>` in an inline 90×50 viewBox:

- `BONAPP'` — 18px, `fill: var(--color-text)`, baseline y=16
- `HEDI` — 34px, `fill: var(--color-accent)`, baseline y=47

Both `font-weight: 600`, `letter-spacing: .02em`, natural width (no artificial
stretching).

---

## Colour

Four tokens change between themes. **The accent ramps do not** — that's what
gives light and dark the same identity.

**Shipped — Vin et olive.** Note that surface is *lighter* than bg, so cards
lift off the page. Umber had that the other way round and cards sank into it.

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#f8f5f4` | `#1e1a1b` |
| `--color-surface` | `#ffffff` | `#2c2527` |
| `--color-text` | `#1e1a1b` | `#f2ecec` |
| `--color-divider` | `rgba(30,26,27,0.13)` | `rgba(242,236,236,0.14)` |

**Umber, as drawn:**

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#efe6d6` | `#241f1a` |
| `--color-surface` | `#e0d3ba` | `#332c24` |
| `--color-text` | `#241f1a` | `#efe6d6` |
| `--color-divider` | `rgba(36,31,26,0.16)` | `rgba(239,230,214,0.14)` |

### Accent — wine (primary)

`--color-accent: #a04a64` (= step 500), hue 342

| 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|
| `#faeaee` | `#f0c8d2` | `#dfa0b0` | `#c1738a` | `#a04a64` | `#833b51` | `#642c3d` | `#481e2b` | `#2c1119` |

Umber drew this ramp as rust/umber, `--color-accent: #a15a35`, hue 20:

| 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|
| `#f7e8de` | `#edcbb0` | `#dba377` | `#c37f4f` | `#a15a35` | `#7e4527` | `#5f331d` | `#422314` | `#2b170d` |

### Accent 2 — olive (secondary)

`--color-accent-2: #77854a` (= step 500), hue 74

| 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|
| `#eef0e2` | `#d6dcbc` | `#b8c291` | `#96a467` | `#77854a` | `#5f6c3a` | `#47522b` | `#32391d` | `#1d2110` |

Umber drew this ramp as spruce/teal, `--color-accent-2: #4f7d74`, hue 171:

| 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|
| `#e3efec` | `#c3ddd6` | `#96c1b5` | `#6ea395` | `#4f7d74` | `#3c625b` | `#2c4844` | `#1e332f` | `#14231f` |

Those two Umber hues, 20 and 171, are still the anchors of the avatar tint ramp
in `core/avatar/avatar-token.ts` and of the placeholder's warm band in
`shared/ui/image/image.ts`. Both are deliberate leftovers rather than
oversights — ADR 9 explains why re-anchoring them is a decision about existing
accounts, not a mechanical follow-on.

### `--color-accent-text` — one deliberate exception

The ramp is theme-independent, and stays that way. But accent used as *text on a
surface* cannot be a single fixed step: `accent-700` is near-black, which is
correct on the light surface and unreadable on the dark one.

So one semantic token resolves per theme — `accent-700` in light, `accent-300`
in dark — while every literal ramp step keeps its value. Used by ingredient
amounts, quick-fact values and step numbers.

Measured on the shipped palette: `accent-700` on white is **10.66:1** (it was
7.18:1 on Umber's `#e0d3ba`), and `accent-300` on the dark surface is 6.99:1.

### Where the ramp steps are actually used

Not decoration — these assignments come from the prototype and matter:

- `100` → tag chip backgrounds
- `300` → hero kicker text (on photo), step number badge ring
- `500` → the accent itself: primary buttons, links, active dot, filled stars
- `600` → link hover, primary button hover
- `700` → ingredient quantities, quick-fact values, step numbers
- `800` → tag chip text

Tag colour rule: the primary `accent` by default, `accent-2` as the alternate.
In the seed data `gluten` and `dessert` take `accent-2`; `chocolat` and `mijoté`
take `accent`. Which tag gets which came from the prototype and is unchanged —
only what those two ramps look like moved.

### Fixed colours (never themed)

Text and chrome that sit on top of photography keep a constant light value
regardless of site theme:

| Token | Value | Used for |
|---|---|---|
| `--on-photo` | `#f9f4ed` | hero headline, play icon, arrow glyphs |
| `--on-photo-muted` | `#e6dcc9` | hero paragraph |
| `--scrim-strong` | `rgba(23,19,15,0.85)` | bottom stop of the hero gradient |
| `--scrim-soft` | `rgba(23,19,15,0.4)` | 40% stop of the hero gradient |
| `--glass-bg` | `rgba(23,19,15,0.55)` | carousel arrows, play badge |
| `--glass-border` | `rgba(249,244,237,0.25)` | carousel arrow border |
| `--glass-border-strong` | `rgba(249,244,237,0.4)` | play badge border |
| `--dot-inactive` | `rgba(249,244,237,0.4)` | inactive carousel dot |

Hero scrim, in full:
`linear-gradient(0deg, rgba(23,19,15,0.85) 0%, rgba(23,19,15,0.4) 40%, transparent 72%)`

---

## Radius — **reconstructed**

The prototype used `var(--radius-lg)` without defining it. Measured from the
screenshots at ~20–24px; `22px` is the chosen value.

| Token | Value | Used for |
|---|---|---|
| `--radius-lg` | `22px` | hero frame, detail media |
| `--radius-card` | `calc(var(--radius-lg) * 1.15)` ≈ 25px | cards, and the top corners of card photos |
| `--radius-pill` | `999px` | every button, input, select and tag |

The `* 1.15` is not invented — the prototype wrote exactly
`calc(var(--radius-lg) * 1.15)` on the card image's top corners, which is how
`--radius-lg` was recovered in the first place.

The overall effect is deliberately over-rounded. Buttons, tags and inputs are
*always* fully pill-shaped; there is no small-radius variant anywhere.

---

## Shadows — **reconstructed**

Soft, low-opacity, ink-tinted rather than neutral grey.

| Token | Light | Dark |
|---|---|---|
| `--shadow-sm` (`.elev-sm`) | `0 2px 8px rgba(36,31,26,.07)` | `0 2px 8px rgba(0,0,0,.28)` |
| `--shadow-md` | `0 8px 24px rgba(36,31,26,.12)` | `0 8px 24px rgba(0,0,0,.40)` |
| `--shadow-lg` | `0 18px 48px rgba(36,31,26,.20)` | `0 18px 48px rgba(0,0,0,.55)` |

Shadows are the one thing besides the four surface tokens that **does** change
between themes: an ink-tinted shadow is invisible against the dark background.

Their tint is still Umber's `rgba(36,31,26,…)` rather than the new ink
`rgba(30,26,27,…)`. A six-unit difference at 7–20% opacity is not visible, and
ADR 9 changed colour values only.

---

## Layout & spacing

| Token | Value |
|---|---|
| `--container-max` | `1180px` |
| `--container-pad` | `32px` |

Loose and airy. Section gaps 44–70px, card padding ~24–26px, grid and flex gaps
24–48px.

Key measurements from the prototypes:

- Header: `18px 32px` padding (≈76px tall), sticky, `backdrop-filter: blur(10px)`,
  background `color-mix(in srgb, var(--color-bg) 90%, transparent)`
- Hero: 440px tall
- Card grid: `repeat(auto-fit, minmax(300px, 1fr))`, 24px gap
- Card photo: 190px tall; avatar 28px
- Filter row: `repeat(auto-fit, minmax(180px, 1fr))`, 12px gap
- Detail two-column rows: `flex`, 48px gap, `flex: 2 1 480px` / `flex: 1 1 300px`
- Sticky ingredients panel: `top: 96px`

**There are no media queries in the prototypes.** The layout reflows entirely
through `auto-fit` grids and `flex-wrap`. Reproduce that; add breakpoints
(~900px, ~640px) only where content genuinely crowds — the hero caption and the
42px detail `<h1>`.

---

## Motion

| Where | Value |
|---|---|
| Carousel slide | `transform .5s cubic-bezier(.65,0,.35,1)` |
| Carousel autoplay | 6000ms, pauses on hover **and focus**, wraps both directions |
| Card hover | `translateY(-4px)`, `transform .18s ease` |
| Theme change | `background-color .25s ease, color .25s ease` |
| Buttons | `.18s ease` on background, colour, border |

All of it must collapse under `prefers-reduced-motion: reduce`, and carousel
autoplay must not run at all in that mode.

---

## Icons

Inline SVG, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
`stroke-width="2.75"`, `stroke-linecap="round"`, rendered at 17×17 in the header.

| Icon | Path data |
|---|---|
| search | `<circle cx=11 cy=11 r=7/><path d="M21 21l-4.3-4.3"/>` |
| user | `<circle cx=12 cy=8 r=4/><path d="M4 21c1.5-4.5 5-6 8-6s6.5 1.5 8 6"/>` |
| moon | `<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/>` |
| sun | `<circle cx=12 cy=12 r=4.2/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>` |
| star | 16×16, `stroke-width 1.5`, `<polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9"/>` |
| play | 20×20, filled `--on-photo`, `<path d="M8 5v14l11-7z"/>` |

Added beyond the prototype: `chevron-left` / `chevron-right` (replacing the `‹`
`›` text glyphs), `heart` (replacing the 🙂 emoji), plus `plus`, `minus`,
`check`, `x`, `edit`, `trash`, `eye`, `image`, and the Google and Facebook brand
marks. Brand marks keep their official colours and are exempt from
`currentColor`.

---

## Photography

**None has been supplied.** Every image in both prototypes is an empty
placeholder. Target framing when real photos arrive:

| Slot | Ratio |
|---|---|
| Hero slides | ~1400:900 (wide banner) |
| Card thumbnails | 4:3 |
| Author avatars | 1:1, circular |
| Detail media | 16:9 (it's a YouTube embed) |

Every image box reserves its space with `aspect-ratio` so dropping in real
photography causes zero layout shift.
