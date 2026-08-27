# 13. Form fields are not pills

Date: 2026-08-27 · Status: accepted

## Context

`Docs/design-tokens.md` records the radius rule plainly, and it is not an
accident of implementation:

> `--radius-pill` · `999px` · every button, input, select and tag
>
> The overall effect is deliberately over-rounded. Buttons, tags and inputs are
> *always* fully pill-shaped; there is no small-radius variant anywhere.

The prototypes bear that out. `Docs/Design/index.html` draws one text input and
three selects, all `class="input"`, all pills. So `.input` took
`border-radius: var(--radius-pill)` and every field on the site has been a pill
since.

**The prototypes contain no `<textarea>`.** Neither file has one — the design
covers a list page and a recipe page, and neither asks the visitor to write
anything. Comments, the profile name field and the whole admin editor came
later, and they inherited a rule that had only ever been applied to a control
one line tall.

### What that produced

A browser clamps a corner radius to half the box, so `999px` resolves to
whatever half the height happens to be. On a single-line input at 43px that is
~21px, and the widest part of the curve sits at the vertical centre — where
there is no text, because the text is on the centre line and the curve has
already come back to `x=0` there. It looks intentional and nothing is harmed.

On the admin editor's description textarea, 120px tall, it resolves to 60px.
The first line of text sits about 12px down, where the left border edge is
still 24px inside the box — past the field's 18px of padding. The first
character is drawn under the curve and clipped.

`Babka is a braided Polish loaf` rendered as `3abka is a braided Polish loaf`.
It had been doing so in every textarea on the site, in both themes, for as long
as textareas have existed here.

## Decision

**Form fields read `--radius-input: 12px`. Buttons and tags keep
`--radius-pill`.**

The rule is *what you fill in* versus *what you press*. `.input` covers text
inputs, textareas and selects, and all three move together: a 12px search box
above three pill selects reads as a bug rather than as a distinction, and the
filter bar puts them in one row where the difference would be unmissable.

Selects are the arguable half — you do not type into one, and the prototype
draws them as pills explicitly. They move anyway, because sitting in a row with
the search box is the fact about them that governs here.

**12px was chosen against 8px and 16px, rendered side by side and picked.** All
three clear the text; the choice among them was taste, and it is the site
owner's to make. 12px keeps a visible relationship to the 22px and 25px radii
the cards use, so the fields still read as belonging to this design rather than
to a default form library.

**It is a token rather than a literal**, so the exception is one decision in one
place. Six files reference `--radius-pill` and a seventh would have meant the
next person deciding this again from scratch.

### The assertion

Two specs, and neither reads the token's value. `--radius-input: 12px` is not
the invariant — a 12px radius on a field with 4px of padding clips just as
badly. What is asserted is the geometry:

> a corner radius no larger than the horizontal padding cannot reach the text,
> at any box size

`smoke.spec.ts` applies it to every `.input` on the list page.
`admin.spec.ts` applies it to the description textarea, because only a textarea
is tall enough for the clamp to land far past the padding, and that is the
shape that actually broke. Both were confirmed to fail against `--radius-pill`
before the fix landed.

## Consequences

**This is a deviation from the prototypes and it is recorded here rather than in
ADR 6.** Same test ADR 7 and ADR 9 applied: ADR 6 collects deviations that
change *a* screen, and this changes every form on the site at once — the search
box, the two sort selects, the comment composer, the profile name field, and
all 21 fields of the admin editor.

**`Docs/design-tokens.md` is updated, not contradicted in silence.** Its radius
table and the "always fully pill-shaped" sentence both described what shipped
and now do not, and that document's stated job is to be the place to look when
the prototypes and the app disagree.

**`Docs/Design/` is unedited**, as always. It remains the record of a design
that never had a textarea in it.

**A future field type inherits the fix, not the bug.** Anything given `.input`
is now bounded by its own padding rather than by its height, so a date picker
or a search-with-chips added later cannot reintroduce this by being tall.

**The over-rounding survives everywhere it was not hurting.** Buttons, tags,
the servings stepper and the avatar discs are untouched. The character of the
design is intact; what changed is the one family where the character was eating
the content.
