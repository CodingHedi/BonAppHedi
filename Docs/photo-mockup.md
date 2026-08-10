# The photography mockup

Every recipe carries a photograph and a video in the **mocks only**, so the
design can be looked at with both in it before ADR 8 builds the real thing.

## One video, six recipes

`PLACEHOLDER_VIDEO` in `seed-data.ts` is Big Buck Bunny, and every recipe points
at it. Six recipes want six videos; exactly one video clears the licensing bar
`CLAUDE.md` sets — openly licensed, unmistakably not a cookery video — so the
mockup repeats that one rather than reaching for six real cookery videos nobody
holds the rights to. It is a named constant so that reads as a decision rather
than as six copies of a coincidence.

Only the babka's step timestamps are timed against its runtime. The other five
show the play facade and no step jumps, which is the correct behaviour for a
recipe whose steps carry no offsets.

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

All six are **CC0 or public domain** — no attribution required. They are
credited anyway, because "where did this file come from" is a question the
repository should be able to answer.

| File | Source | Licence |
|---|---|---|
| `chakchouka.jpg` | [Shakshuka (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Shakshuka_(Unsplash).jpg) | CC0 |
| `pain-au-levain.jpg` | [Loaf of sourdough bread cooling.jpg](https://commons.wikimedia.org/wiki/File:Loaf_of_sourdough_bread_cooling.jpg) | CC0 |
| `babka-au-chocolat.jpg` | [Kranz (cake).jpg](https://commons.wikimedia.org/wiki/File:Kranz_(cake).jpg) | Public domain |
| `cheesecake-basque.jpg` | [Chestnut Basque Cheesecake - MOGUMOGU 2024-11-02.jpg](https://commons.wikimedia.org/wiki/File:Chestnut_Basque_Cheesecake_-_MOGUMOGU_2024-11-02.jpg) | CC0 |
| `tajine-de-boeuf.jpg` | [Couscous with Chicken and Vegetable Stew.JPG](https://commons.wikimedia.org/wiki/File:Couscous_with_Chicken_and_Vegetable_Stew.JPG) | CC0 |
| `jus-grenade-orange.jpg` | [Pomegranate Juice Fresh.JPG](https://commons.wikimedia.org/wiki/File:Pomegranate_Juice_Fresh.JPG) | Public domain |

All from Wikimedia Commons, scaled so the longest side is 1600px and re-encoded
at JPEG quality 78. Together they are about 1.5 MB.

**Two of them are compromises, and should not be read as chosen:**

- `tajine-de-boeuf.jpg` **is not a beef tagine.** It is couscous with a chicken
  and vegetable stew. No CC0 or public-domain photograph of a tagine exists on
  Commons that is the dish rather than an empty pot or a 17th-century painting,
  and the licence bar is not negotiable. It is North African and it is
  appetising; it is also wrong, and anyone replacing these should start here.
- `babka-au-chocolat.jpg` is a *Kranz*, the braided yeast cake a babka is a form
  of, in a foil tin in someone's kitchen. It reads as the right thing where the
  actual CC0 babka photographs did not — one is a bun in a Tupperware, another a
  hand holding a pastry in a café.

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

**ADR 9's prediction about the hero kicker was only half right, and is now
fixed.** It says the kicker is illegible because there is no photography — every
hero is the light placeholder panel — and that it "should resolve when real
photographs land". It did not. With a photograph behind it the kicker was
legible where the image is dark and still washed out where it is bright:
`--color-accent-300` over the lit crust of a loaf.

The lever was never the arrival of photographs, so waiting would not have fixed
it. A `.defocus` layer now throws the photograph out of focus behind the caption
and only there, masked so it fades rather than ending on a hard edge. Darkening
the scrim harder was the other option and it would have cost the photograph
everywhere the text is not.

**Its stops are per-breakpoint, because the caption's height is.** The caption
reaches 50.7% of the slide on a desktop and 76.6% on a phone, where the excerpt
wraps to four lines. One pair of stops for all three left the phone's kicker
outside the blur entirely — measurably zero blur behind it, which is exactly
where it read worst — so each breakpoint sets `--defocus-solid` to the measured
caption top plus a few points. On a phone that defocuses most of the
photograph, which is the right trade at 340px: the text is what the hero is for.
The caption also sits 10px lower than the prototype's `bottom: 36px`, which
keeps the kicker away from the edge where the mask is still fading.

**Both hero arrows overlapped the caption, and now clear it by 16px.** Measured
at 1280px: `.arrow--prev` ends at x=144 and `.caption` began at x=138. Pure
arithmetic rather than bad luck — the caption's `left: 56px` against an arrow at
`left: 18px` that is `44px` wide — and it was worse at the 640px breakpoint,
where a `20px` caption sat under an arrow ending at `46px`, a 26px overlap. The
right-hand side had the mirror of it against `.arrow--next`.

A pre-existing layout bug, not one photography caused. It stayed invisible for
as long as the hero was a pale placeholder panel, because a translucent disc
over a flat panel reads as a disc rather than as something eating a letter. The
first photograph put a bright crust behind the arrow and the missing "P" of
"Petit-déjeuner copieux" became obvious.

The caption is now offset to the arrow's outer edge plus 16px at each of the
three breakpoints. **That coupling is the thing to remember**: change an arrow's
size or offset and the caption has to move with it, which is why the numbers are
written next to each other in the component rather than left to be re-derived.
