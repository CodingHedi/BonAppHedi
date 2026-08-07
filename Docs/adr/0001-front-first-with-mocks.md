# 1. Build the frontend first, against mock services

Date: 2026-07-25 · Status: accepted

## Context

The design is finished and high-fidelity; the backend is not designed at all.
Building the backend first would mean weeks with nothing to look at, and an API
shaped by guesses about what the UI needs.

## Decision

Milestone 1 delivers the complete Angular app running on typed mock services
holding the seed data. Milestone 2 implements the Spring Boot API and swaps it
in behind the same interfaces.

The seam is a set of injection tokens bound by an environment flag:

```ts
{ provide: RECIPE_API, useClass: environment.useMocks ? MockRecipeApi : HttpRecipeApi }
```

No component ever knows which implementation it got.

## Consequences

- The mock implementations **are** the API contract. `core/api/models.ts` is
  written once and the backend must satisfy it, not the reverse.
- Mocks stay in the repo after the swap — they're what the unit and e2e tests
  run against, and they let the UI be developed without a running JVM.
- Mocks deliberately inject 120–320ms of latency so loading states and skeletons
  are exercised for real rather than only in theory.
- The M1 e2e suite must pass **unmodified** against the real backend. That's the
  acceptance test for milestone 2 — see the amendment below for what "the suite"
  turned out to mean.

## Amendment, 2026-07-27: what the acceptance test actually covers

The suite was run against the real API for the first time once the four `Http*`
implementations landed. **64 of 96 specs pass unmodified, and none of the 32
failures is a contract mismatch** — no field-shape, ordering or count
disagreement anywhere. The backend satisfies `core/api/models.ts`, which is the
thing this ADR set out to guarantee, and the read-only specs pass 36 of 37.

The remaining 32 fail for three reasons, none of which the original wording
anticipated:

**Signing in — 26 specs.** `social.spec.ts` signs in by clicking a provider
button and expecting to be signed in at once, because that is what the mock
does. Against the real API that click navigates to Google and never comes back.
Playwright cannot fake it either: the token exchange and the userinfo call are
server-to-server and never touch the browser, so intercepting the redirect gets
you a flow that dies one step later.

**Provider configuration — 3 specs.** They expect two sign-in buttons. A server
holding no credentials offers none, which is correct behaviour (ADR 0003) and
not something the specs can know.

**Shared mutable state — 3 specs.** The mock store resets on every page load, so
each spec started from the seeded `4.0 / 5 · 1 avis`. A real database does not
reset, and several specs rate the same recipe, so whichever runs second sees the
first one's vote. This is inherent to a persistent backend, not a defect in
either side.

### Decision

**The guarantee is scoped to the specs that do not require a session.** Those
must pass unmodified, and do. The 26 auth-dependent specs are covered instead by
the backend suite — which asserts the same rules directly, including the
anonymous/`ROLE_USER`/`ROLE_ADMIN` matrix — plus one manual sign-in pass before
a deploy.

Stating the boundary beats leaving it implied. An acceptance test that everyone
knows does not quite hold stops being consulted, and the anonymous path is where
its value was always highest: that is the whole public site, and it is where a
contract mismatch would be silent.

### What was rejected

**A login bypass behind a dev profile.** ADR 0003's design is that configuration
decides what is enabled and a blank configuration is *safe* — no credentials
means no sign-in buttons and nothing fails. A profile-gated bypass inverts
exactly that: a misconfiguration stops meaning "sign-in is off" and starts
meaning "anyone is an admin". The failure mode is unbounded, and the thing it
buys is already covered.

### Amendment, 2026-07-28: re-measured, and reproducible again

**88 of 132 pass, and none of the 44 failures is a contract mismatch.** The
proportion is almost exactly what it was in July — the suite grew by 36 specs
across the avatar, comment-toolbar and search work, and the failures grew with
it in the same three categories rather than in a new one. The scoping decision
above still holds, unchanged.

Between the two measurements the run was, for a while, impossible. Pinning the
suite to port 4300 and to `environment.e2e.ts` — the fix that stopped a flipped
dev loop turning `verify` red — removed the only route to the real backend at the
same time, and for several features the instructions in `TESTING.md` described
something that could not happen. `PW_TARGET=real` restores it as a deliberate,
named act rather than a side effect of what happens to be running.

Two things learned in the re-measurement that the first one did not record:

- **The number is a floor, not a figure.** The specs share one database and are
  not independent of each other however they are scheduled. Two of the 44 fail
  on state the run itself created — an earlier spec reacts to the babka, and a
  later one counts reactions. Even `--workers=1` does not fix that; only a reset
  between specs would, and that is a bigger change than the number is worth.
- **`-Fresh` is load-bearing.** Measured twice against a database carrying the
  previous run's writes, the count moved from 44 failures to 47.

### If the auth specs are wanted later

Run a real mock OIDC issuer in the test environment and point `bah.oauth.*` at
it. The endpoint URIs would need to become configurable — they currently come
from `CommonOAuth2Provider` — which is a legitimate feature rather than a test
hook, since a self-hosted deployment needs it anyway. The application would be
genuinely unmodified, and it would exercise token exchange, session creation and
principal serialization for real.

### Amendment, 2026-08-08: the session category is closed

The paragraph above was carried out. `bah.oauth.<provider>.*` now takes an
issuer and four endpoint URIs, `frontend/e2e/mock-issuer.mjs` serves an OIDC
issuer on loopback that approves without asking, and `application-acceptance.yml`
points Google at it. A sign-in completes for real: authorization code, token
exchange, userinfo, session, admin allowlist.

**120 of 154 pass, and the 40 specs blocked on a session are now 0.** No failure
is a contract mismatch, and none is about signing in.

**The scoping in the first amendment is withdrawn.** The guarantee no longer has
to exclude the specs that need a session, because they run.

**In its place, a narrower exemption: the three sign-in helpers may differ
between the two backends.** `signIn` in `social.spec.ts`, `signedIn` in
`profile.spec.ts` and `signedInAs` in `admin.spec.ts` branch on `PW_TARGET`, and
the whole of the difference lives in `e2e/sign-in.ts`. Nothing else moves — every
assertion, route, describe block and test name is byte-identical. The reasoning
is that how a test *arrives* signed in is setup, not the thing under test: against
the mocks a session is a value in `localStorage`, and against a real server it is
a cookie the server issued. Requiring those to be written the same way would not
be testing the application, it would be testing that two different systems can be
lied to identically.

Note what this does **not** do, because the distinction matters: it does not give
the server a test-only way in. The bypass rejected above is still rejected. The
server still only accepts a session it minted itself at the end of a real OAuth
flow; the helpers changed how the *browser* obtains one. And the overrides that
make it possible cannot reach production — the application refuses to start if
they are set under the `prod` profile, which was confirmed by removing that check
and watching the test fail.

**What is left is test isolation, and it is the same problem the first amendment
called a floor.** All 34 remaining failures are state the run itself created. It
was 2 specs before and is 34 now, because the specs that could not run are
precisely the ones that *write*: three admin specs pass and, in passing, publish
a draft, rename the babka and create a recipe. Every later spec asserting the
seeded catalogue then fails — `Received: 6` where 5 cards were expected,
`Received: "Babka relue"` where the seeded title was.

That is not a regression and nothing is wrong with the application. It is a
property the mocks concealed by resetting on every page load, and it only became
visible once a third of the suite stopped being skipped. Fixing it means real
isolation — a fresh database per spec file, or a reset between specs — and that
is a separate piece of work with its own trade-offs.

Three things cost real time and are worth not rediscovering:

- **`localhost` is not `127.0.0.1` here.** The JVM resolves `localhost` to `::1`
  first and does not fall back, and the issuer listens on IPv4. The browser
  reaches `/authorize`, comes back with a code, and the server-side token
  exchange then dies on "Connection refused" — a sign-in that fails at the last
  step with nothing visibly misconfigured. curl does not reproduce it.
- **The `iss` claim is not an endpoint.** Overriding all four URIs and leaving
  the issuer alone still fails, because the registration keeps Google's and the
  id_token is validated against it.
- **A reused test server can make a whole run lie.** Playwright's
  `reuseExistingServer` adopted a stale issuer from an earlier session after the
  new one crashed on startup; 154 specs ran against the wrong thing and reported
  failures that read like application bugs. It is now `false` for the issuer, so
  a leftover process is a loud port conflict instead.
