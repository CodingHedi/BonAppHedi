# 6. Deliberate deviations from the design prototypes

Date: 2026-07-25 · Status: accepted

## Context

`Docs/Design/index.html` and `recipe.html` are treated as the visual source of
truth, and the implementation matches them pixel-close. A few things in them are
nonetheless not going to ship as drawn. Recording them here so that a future
reader comparing the app to the prototypes doesn't "fix" them back.

## Decisions

### Cut: "Ajouter à ma liste de courses"

The ingredients card ends after the leader-dotted list. The button, the
`/liste-de-courses` route and the shopping-list service are all dropped.

A localStorage-only list would have been a feature that quietly loses your data
across devices, and syncing to a real list app (Todoist, Bring!) means a third
OAuth integration serving the fraction of visitors who use that specific app.
Neither earns its place. The card's `padding: 26px 24px 22px` is retained so the
bottom spacing still reads as intentional rather than clipped.

### Changed: single GitHub button → config-driven provider row

The prototype's comment card footer has one hardcoded "S'identifier avec GitHub"
button. It becomes a row rendered from `GET /api/auth/providers`. See ADR 3.

### Changed: video is an embedded YouTube player with a click-to-load facade

The prototype draws a photo with a centred glass play badge. That is kept
exactly — and it turns out to be the ideal facade. The `<iframe>` is injected
only on click, against `youtube-nocookie.com`, so no request reaches Google
until a visitor presses play. The poster is our own image, not
`img.youtube.com`, which would leak the visitor's IP on page load and defeat the
point.

Consequence: no YouTube cookies on page view, therefore no consent banner. Step
timestamps drive `seekTo()`; a click on "(02:14)" from a cold page loads the
player with `startSeconds` set.

### Fixed: accessibility bugs in the prototype

These are copied nowhere:

1. Three `<h1>` elements in the carousel. Slide titles become `<h2>` styled at
   40px, plus one visually-hidden page `<h1>`.
2. Arrow buttons contained the bare text glyphs `‹` and `›`, which screen
   readers announce as nothing useful. Replaced with chevron SVGs and real
   labels.
3. The play badge had `pointer-events: none` — decorative markup where a control
   belongs. It's a `<button>` with a label.
4. The reaction button was the emoji 🙂. Replaced with a heart SVG.
5. Carousel autoplay paused on hover only. It must also pause on `focusin`, and
   must not run at all under `prefers-reduced-motion: reduce`.

### Changed: difficulty dots follow the data, not the drawing

The prototype draws two of three dots filled and labels it "facile". Once the
strip is data-driven that stops being a fixed picture: difficulty is stored 1–3,
and the dot count is the value. So "facile" (1) fills one dot, not two.

The prototype was showing one example, not defining the scale — and a scale
where "easy" means two thirds is not one anybody can read.

### Added: a fourth header control

The header gains a language switcher alongside search, account and theme. It
shows `FR`/`EN` as text rather than a flag — flags denote countries, not
languages, and French is not exclusively French.
