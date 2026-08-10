# The photography mockup

Two recipes carry a real photograph in the **mocks only**, so the design can be
looked at with photography in it before ADR 8 builds the real thing.

## It cannot reach production, by construction

`RecipeQueryDao` hardcodes `new Dto.ImageRef(null, title)` and there is no image
column in the schema. The production build sets `useMocks: false`, so the live
site takes its data from that API and every `image.url` is null there — exactly
as it was before this file existed.

The photographs are therefore visible in `npm start`, in both test suites and in
any `useMocks: true` build, and nowhere else. Deploying this changes nothing on
`bonapphedi.fr`. That is the point: it is a way to answer "does the design work
with photographs in it" without first building the column, the migration, the
DAO mapping, the upload path and the resizing that ADR 8 actually needs.

The seam is one field, `SeedRecipe.mockImageUrl`, read in one place,
`MockRecipeApi.image()`. Deleting both and the two files under
`frontend/public/images/` removes the mockup completely.

## The images

Both are **CC0** — public domain dedication, no attribution required. They are
credited here anyway, because "where did this file come from" is a question the
repository should be able to answer.

| File | Source | Author | Licence |
|---|---|---|---|
| `public/images/chakchouka.jpg` | [Shakshuka (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Shakshuka_(Unsplash).jpg) | via Unsplash | CC0 |
| `public/images/pain-au-levain.jpg` | [Loaf of sourdough bread cooling.jpg](https://commons.wikimedia.org/wiki/File:Loaf_of_sourdough_bread_cooling.jpg) | Nutrition, Food Safety & Health | CC0 |

Both were downloaded from Wikimedia Commons at 1920px, resized to 1600px wide
and re-encoded at JPEG quality 78 — 304 KB and 416 KB respectively.

**CC0 was a requirement, not a preference**, and it is the same bar the
placeholder video clears: `CLAUDE.md` records that Big Buck Bunny was chosen
because it is openly licensed, and that any replacement must clear the same bar.
Several better-composed photographs were rejected for licence or content:
CC BY-SA shakshuka images that would carry an attribution obligation into every
page, and a CC0 Basque cheesecake that turned out to be a cafeteria tray with a
Segafredo logo on the cup. **Look at the image before using it** — the first
babka candidate was a bun in a Tupperware.

## What it showed

**The cards are transformed and the hero is not the problem.** Three
placeholder cards beside two photographed ones is the clearest argument for
ADR 8 that exists; the photographed cards look like the prototype and the
placeholders look like what they are.

**ADR 9's prediction about the hero kicker is only half right.** It says the
kicker is illegible because there is no photography — every hero is the light
placeholder panel — and that it "should resolve when real photographs land".
With a photograph behind it, the kicker is legible where the image is dark and
still washed out where it is bright: `--color-accent-300` (`#dfa0b0`) over the
lit crust of a loaf. So the lever is the scrim, not the arrival of photographs,
and it will need deciding per-image or by strengthening the gradient at the
kicker's position rather than by waiting.

**The previous-slide arrow overlaps the kicker by 6px.** Measured at 1280px:
the arrow's box ends at x=144 and the kicker's begins at x=138, on every slide,
which makes it a pre-existing layout bug rather than anything photography
caused. It was invisible while the hero was a pale placeholder panel and the
first glyph sat under a translucent disc; against a photograph the arrow reads
as solid and eats the "P" of "Petit-déjeuner copieux". Worth fixing with ADR 8
rather than before it, since the hero's whole treatment is in scope there.
