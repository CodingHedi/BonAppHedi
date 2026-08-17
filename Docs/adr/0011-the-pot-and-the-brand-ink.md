# 11. The pot, the brand ink, and a favicon that is not the mark

Date: 2026-08-17 · Status: accepted

## Context

Milestone 3 (ADR 8) asked for two things the site did not have: photography, and
a favicon. `favicon.ico` had been the 15086-byte Angular template since the
project was generated on 2026-07-25 — not a placeholder anybody chose, just the
one nobody had replaced. It was on the M3 list from the beginning and stayed
there because it was blocked on a decision rather than on work.

The prototypes do not settle it. `Docs/Design/` draws a **wordmark only**: two
lines of Oswald in a 90×50 viewBox, `BONAPP'` in the text colour over `HEDI` in
the accent, recorded in `Docs/design-tokens.md` under *Logo*. A wordmark does
not reduce to 16 pixels. Whatever went in the tab strip had to be a symbol, and
no symbol existed.

### The proof sheet

Two symbols were drawn — a letter B, and a cooking pot — and rather than argue
about them in the abstract, a standalone page was built to look at them: both
symbols, in both palettes, at the sizes a browser actually asks for, with a
favicon bench against real tab-strip greys and a contrast readout on every
pairing.

It is served from the VPS at an unguessable path rather than from the app,
because it was for showing to family and none of it belongs in a public
repository. **It lives on the server and in neither repository** — the path is
in `deploy/Caddyfile`, which is private. Its own block says to delete it once
the logo is settled, and this ADR is what settles it.

The sheet gave the decision a vocabulary, and the decision was recorded in it:
each ink has a one-letter code, and a lockup is written as
*mark·upper·lower **on** ground*.

| Code | Colour | Role |
|---|---|---|
| `A` | Orange `#e87e13` | brand ink, outside both ramps |
| `I` | Ink `#1e1a1b` | light `--color-text` |
| `C` | Cream `#efe6d6` | dark `--color-text` |
| `P` | Paper `#f8f5f4` | light `--color-bg` |
| `U` | Umber `#241f1a` | dark `--color-bg` |

The choice was **`A·C·A on U`** and **`A·I·A on P`**.

## Decision

**The pot, with the wordmark beside it.** One SVG, three groups — `mark`,
`upper`, `lower` — in a 877.14×361.17 viewBox. The wordmark is now drawn
artwork rather than live `<text>`, so `--font-logo` (Oswald) no longer sets it;
the font token stays because the letterforms in the artwork are Oswald and a
future edit should match them.

**Those two references are one rule, not two palettes.** Decoding them:

| Block | Light (`on P`) | Dark (`on U`) | Therefore |
|---|---|---|---|
| pot | `A` | `A` | Orange, always |
| `BONAPP'` | `I` | `C` | `--color-text` |
| `HEDI` | `A` | `A` | Orange, always |

So `brand-logo.ts` contains no theme logic at all. Only the upper word follows
the page, and it follows it by *being* the token rather than by reading it. The
mark keeps its colour when the theme flips, which is the entire reason Orange is
worth having.

**`--color-brand` is declared once and never redeclared by the dark theme.**
That makes it the only colour token in `_tokens.scss` that does not participate
in the two-palettes structure ADR 10 established. It is deliberate and it is the
point: ADR 10 split the ramps so that light and dark are two palettes, and the
brand ink is the one thing that is *not* palette — it is the same orange in
both, so the mark is recognisably the same mark either way round.

**It has no ramp, also deliberately.** Every other colour here comes with ten
stops. Orange has one value and no `--color-brand-600`, so reaching for a stop
fails loudly at build time rather than quietly inventing a ninth wine. It has
not been through the contrast work the accent ramps have and it is not for text
or controls.

**The favicon does not use the mark's colour, and that is the one place the
brand ink is set aside.** It is Ink on light chrome and Cream on dark, carried
in one `favicon.svg` and switched by `prefers-color-scheme`.

The reasoning is that a favicon is judged against different ground from
everything else on the site. It sits on browser chrome — a tab strip, a
bookmarks bar — not on Paper or Umber, and the site's own palette has no
authority there. The proof sheet had a separate bench for exactly this, against
real Chrome greys, and Ink/Cream is what it settled on. Orange clears the
contrast floor on both chromes and would have been defensible; it was not
chosen, because "legible" and "right" are different questions at 16px.

**`favicon.ico` is generated from that SVG and committed.**
`scripts/make-favicon.mjs` renders 16/32/48 through Chromium and packs them into
an ICO. It is committed for the reason `csp-lab.mjs` is: the alternative is an
asset nobody can reproduce. The `.ico` is Ink only — it is the fallback for
browsers without SVG icon support, which are the same browsers that cannot adapt
to a dark tab strip, so a single static image has to pick the common case.

**The site is written `BonApp' Hedi`.** No space, no accent — matching the
wordmark as drawn. This is less of a decision than it looks: the prototypes'
own logo `aria-label` already read `BonApp' Hedi`, so the app was the thing out
of step.

> **Superseded on 2026-08-18.** This paragraph continued: *"Hédi the person
> keeps the accent — the recipe author, the publisher in the legal notice, the
> seeded display name. Renaming a person to match a logo would be a different
> and worse change."*
>
> It was overruled by the person in question, which is the right way for that
> argument to end. **The byline is `Hedi` too**, everywhere the site writes it:
> the author row, the legal notice, the mocks. What the paragraph was actually
> defending was not making the decision *for* him, and that still holds.
>
> Two things stay accented and neither is the site's name.
> `V2__seed.sql` still writes `Hédi`, because it has run in production and
> Flyway records its checksum — `V9__author_name_without_accent.sql` corrects
> the row immediately after. And the accent survives in the tests that exist to
> prove an accented name works at all: `fold('Hédi') == 'hedi'`,
> `DisplayName.normalise`, and the OAuth fixtures that carry a
> provider-supplied name through session serialization into JSON.

**The Konami code re-colours the logo**, from the proof sheet's palette, on
every load and every click of it. Scoped to the logo and nothing else: the same
shuffle over the accent tokens would move colours that every contrast decision
on this site depends on, and turn a joke into an accessibility regression
visible only to some visitors.

It draws from the **whole** palette rather than the current theme's three inks,
filtered to ≥1.6:1 against the ground. That threshold is the proof sheet's own,
for pairings that vanish at small sizes, and it is deliberately not a
text-contrast rule — holding a logo to 4.5:1 would reject the orange-on-paper
the brand actually leads with. Drawing from the whole palette is what makes the
floor do work: Cream on Paper is 1.05:1 and has to be excluded by measurement,
where a single theme's three inks are chosen to sit together and nothing would
ever be excluded.

## Consequences

**This is a deviation from the prototypes, and the largest one so far.**
`Docs/Design/` draws a wordmark and the site now shows a symbol beside it.
ADR 6 exists so a reader comparing the two does not "fix" it back; this is that
record for the logo. `Docs/design-tokens.md` §Logo describes the old two-line
`<text>` construction and now says which parts still hold.

**The M3 favicon gate is finally possible.** The plan was a `verify:prod`
byte-comparison so `favicon.ico` cannot regress to the Angular default. It could
not be added while the default *was* the shipped file, since it would have
failed immediately. There is now a real icon to compare against.

**The proof sheet should be torn down.** Its `Caddyfile` block, the redirect,
and `/var/www/bonapphedi-private` were always temporary, and the block says so.
The path is obscurity rather than access control, so it costs nothing to leave
and nothing to remove — except that a CSP exception written for one page
outliving that page is how exceptions become permanent.

**Nothing here changed `index.html`'s blocking script**, so the CSP hash in
`deploy/Caddyfile` did not go stale — the trap ADR 10 walked into twice. The
favicon `<link>` lines sit outside the hashed script.

**`--font-logo` is now used by nothing that renders text.** It is kept rather
than deleted, because the artwork's letterforms are Oswald and the token is the
only record of that. A future redraw needs to know.
