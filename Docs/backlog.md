# Backlog

Things worth doing that are not scheduled, and not urgent enough to interrupt a
milestone. Anything with a real decision behind it belongs in `Docs/adr/`
instead; this is for work whose *shape* is already obvious and whose only open
question is when.

Delete an entry when it ships. An entry that has sat here through two milestones
is probably not wanted — say so and remove it rather than letting the list rot.

---

## A proper 404 page

The not-found route currently renders a heading reading "Page introuvable" and a
link back. It works, it is translated, and the smoke suite checks it — but it is
plainly a placeholder next to the rest of the site, which came from finished
high-fidelity prototypes.

Worth doing because a 404 is not only reached by mistake: it is what a stale
link from elsewhere lands on, what a mistyped URL gives, and — by design — what
an unpublished recipe returns, since a draft and an unknown slug deliberately
answer the same way. It is a page real visitors see.

Nothing blocks it. There is no prototype for it in `Docs/Design/`, so it needs a
design decision first, which by the rule in CLAUDE.md makes any deviation from
the prototypes an ADR — though inventing a page the prototypes never covered is
arguably not a deviation at all.

Should keep: the existing route, the translated copy, and the smoke-suite
assertion on it.
