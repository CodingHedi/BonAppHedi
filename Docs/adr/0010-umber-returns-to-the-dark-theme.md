# 10. Umber returns to the dark theme

Date: 2026-08-10 · Status: accepted

## Context

ADR 9 replaced the Umber palette with "Vin et olive" across both themes, one day
before this. The reason given there was preference — the light theme was not
liked — and that reason is unchanged and still holds for the light theme.

It did not hold for the dark one. Umber's dark theme was liked, and the
re-neutralised greys that ADR 9 gave it were not what anyone had asked for; they
followed from a structural decision rather than from a judgement about how the
dark theme looked. That decision is restated in ADR 9 as *"the accent ramps stay
identical in both themes"*: because both ramps were declared once on `:root` and
inherited, changing the light theme's accents changed the dark theme's too, and
the dark neutrals then had to move to stop warm browns sitting under wine.

So the dark theme changed as a consequence of the light theme changing. This ADR
undoes that consequence.

### What "the old dark theme" turned out to mean

Worth recording, because the request was ambiguous in a way that was not obvious
and the wrong reading was the cheaper one to build.

The dark block only ever overrode four neutrals. The rust and spruce accents
that were visibly part of the old dark theme came from `:root`, which by then
held wine and olive. Restoring only the four warm browns — the minimal, obvious
change — would have produced wine and olive *on* Umber's brown surfaces: a
combination that had never been on screen, and the exact clash ADR 9 cited as
its reason for moving the neutrals in the first place.

Both readings clear WCAG AA comfortably, so contrast did not decide it:

| Pair | Ratio |
|---|---|
| `#efe6d6` text on `#241f1a` bg | 13.19 |
| `#efe6d6` text on `#332c24` surface | 11.11 |
| rust `300` `#dba377` on `#332c24` | 6.23 |
| spruce `300` `#96c1b5` on `#332c24` | 6.94 |
| wine `300` `#dfa0b0` on `#332c24` *(the reading not taken)* | 6.42 |

It was decided as what it is — a question of taste — and the answer was the dark
theme as it actually looked: Umber's neutrals **and** Umber's accents.

## Decision

**The two themes are two palettes.** `:root` carries Vin et olive and is the
light theme; `:root[data-theme='dark']` redeclares both accent ramps as Umber's
rust and spruce alongside the four warm neutrals. `Docs/Design/` is still never
edited, and the dark theme now matches it again — the light theme is the only
remaining colour deviation from the prototypes, which narrows ADR 9's scope
rather than reversing it.

**Both ramps are redeclared in full — all ten stops each — rather than patched
at the stops components happen to use.** A partial override leaves the rest
inheriting: one wine value reaching a warm brown surface, on whichever component
nobody thought to open, rendering perfectly and looking deliberate. The cost of
the full redeclaration is twenty lines that a reader can check at a glance
against the table in `Docs/design-tokens.md`.

**This costs the "one identity" property, knowingly.** ADR 9 valued it — shared
ramps are what made the dark theme almost free, and accents now change hue when
the theme is toggled. The trade is accepted: a personal site's dark theme
looking the way its owner wants it to look outranks an internal consistency
property that no visitor can observe, since nobody sees both themes at once.

**`--color-accent-text` needed no change**, and that is a small vindication of
how it was written. It names a *stop* — `accent-700` in light, `accent-300` in
dark — rather than a colour, so it followed the ramps into their new arrangement
untouched.

## Consequences

**The dark `--color-bg` moved, so all three copies of it moved.** ADR 9 wrote
down that `--color-bg` exists in three places that cannot read each other —
`_tokens.scss`, the blocking script in `index.html`, and `THEME_COLOR` in
`theme.service.ts` — and that `smoke.spec.ts` asserting the computed value in
both themes is what catches a partial edit. That was written as a hazard; this
change was the first to walk into it, and the note did its job.

**Editing `index.html` re-stamped the CSP hash, again.** The blocking script is
allowed by SHA-256 in `deploy/Caddyfile`, in a *different repository*. Changing
one hex in it invalidates that hash, `deploy.ps1` refuses to upload, and the fix
is an ops commit plus a Caddy reload. This is the second time in two days; the
first was ADR 9's own colour change, whose stale hash was found by the deploy
gate rather than by anyone noticing.

Treat "the theme bootstrap changed" as implying "the ops repo needs a commit".
It is written in `CLAUDE.md` and in the ops commit message for exactly that
reason.

**`smoke.spec.ts` now asserts `--color-accent` in both themes**, not only
`--color-bg`. The failure this guards against is silent in the way that matters:
delete the dark ramp redeclaration and nothing breaks, nothing logs, and the
dark theme quietly serves wine on brown. The `--color-bg` assertion alone would
not have noticed.

**The avatar tint ramp is half-anchored again.** `AVATAR_TINT_HUES` is
documented as spanning `--color-accent` to `--color-accent-2`, hues 20 and 171.
ADR 9 made that claim false; the dark theme now carries exactly those hues, so
it is true in dark and false in light. Still not re-anchored, for ADR 9's
reason: the slots are stored in `app_user.avatar` against real accounts, so
moving the hues recolours avatars people have already chosen.

**Contrast in the dark theme is slightly better than before.** Body text goes
from 14.76:1 to 13.19:1 on the background and 12.84 to 11.11 on the surface —
lower, but far above the bar — while the accent text step is 6.23:1 where the
neutral-grey arrangement gave 6.99:1. No pair regresses below AA.

**`Docs/design-tokens.md` reversed a structural claim.** It said the accent
ramps do not change between themes and that this is what gives light and dark
one identity. It now says the opposite, and says which ADR each half comes
from — the document's stated job is to be the place to look when the prototypes
and the app disagree, and a stale structural claim there is worse than none.
