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

## Commenter avatars are fetched from the identity provider

Found while writing the privacy policy, which is the point of writing one:
`comment.avatar_url` holds whatever URL Google returned, and the page renders it
directly. So opening a recipe with signed comments makes the visitor's browser
request `lh3.googleusercontent.com`, disclosing their address to Google.

That is precisely the request the YouTube facade, the self-hosted fonts and the
plain-link share bar all exist to prevent. It is the one place the site does the
thing it is otherwise built not to do, and the privacy page now has to admit it.

Two ways out, neither large: fetch the picture once at sign-in and store it
locally, or drop remote avatars and use the initial-in-a-tint placeholder the
component already falls back to. The first keeps the design, the second is a
handful of lines. Worth deciding before the site is public.

## scripts/verify.ps1

`TESTING.md` referred to it for months; it has never existed. The two halves are
verified separately, which works and is what everyone actually types.

Worth it only if CI or a deploy step needs one command. If that day does not
come, delete this entry rather than writing the script to make an old sentence
true.
