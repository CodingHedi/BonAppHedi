# Backlog

Things worth doing that are not scheduled, and not urgent enough to interrupt a
milestone. Anything with a real decision behind it belongs in `Docs/adr/`
instead; this is for work whose *shape* is already obvious and whose only open
question is when.

Delete an entry when it ships. An entry that has sat here through two milestones
is probably not wanted — say so and remove it rather than letting the list rot.

---

## Two gaps in the backend test plan

Named here because they were listed in `TESTING.md` as planned coverage and
quietly never written. A plan that is not carried out reads exactly like one
that was, which is the whole reason for moving them.

*(The third, a migration test from an empty database, was written —
`MigrationsFromEmptyTest`.)*

**Two providers configured at once.** Zero is tested (`AuthDisabledTest`) and one
is (`AuthApiTest`); two never has been, so nothing asserts the sign-in row
renders both, or that the second registration is built correctly. Blocked in
practice on Facebook needing Meta app review before it releases an email
address, but the *configuration* half could be tested today with a second
fake registration.

**A security matrix across the social endpoints.** `/api/admin/**` is covered for
anonymous, `ROLE_USER` and `ROLE_ADMIN`. The social write endpoints are covered
where it matters — comments need a session, deletion is owner-only — but not
systematically, so a new endpoint added without a rule would not fail anything.

---

## A way to point the e2e suite at the real backend again

The acceptance run in ADR 0001 — the milestone-1 specs against the real API — is
currently unreproducible, and nothing says so at the point of use except
`TESTING.md`.

It was a casualty of a good change. The suite used to reuse whatever served on
:4200, which meant a dev loop flipped to the real API silently made `verify` run
every spec against a live database. Pinning the suite to its own port and to
`environment.e2e.ts` fixed that properly, and removed the one route to the real
backend at the same time.

The shape is already there: `playwright.config.ts` has `PW_TARGET=prod`. A
`real` value alongside it would set `baseURL` to 4200 and omit `webServer`
entirely, so the suite runs against whatever `dev.ps1` started and never starts a
server of its own. Worth doing before the next milestone claims an acceptance
number, since the last measured one is now several features old.

## scripts/verify.ps1

`TESTING.md` referred to it for months; it has never existed. The two halves are
verified separately, which works and is what everyone actually types.

Worth it only if CI or a deploy step needs one command. If that day does not
come, delete this entry rather than writing the script to make an old sentence
true.
