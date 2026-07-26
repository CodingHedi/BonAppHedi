# Working in this repo

Conventions for anyone changing this codebase. [README.md](README.md) has the
stack and the dev loop; [TESTING.md](TESTING.md) has the test suite.

---

## Git workflow

**Never commit directly to `main`.** Every change gets a branch, and `main` only
ever moves through a merge.

```powershell
git checkout -b fix/player-fill      # branch off main
# ... work ...
cd frontend ; npm run verify         # must be green before the merge
git commit
git checkout main
git merge --no-ff fix/player-fill
git branch -d fix/player-fill
```

`--no-ff` is the whole point. It keeps each change one identifiable unit in the
history, so a feature can be read or reverted as a whole later instead of being
reconstructed from loose commits. A fast-forward merge would leave exactly the
flat history this convention exists to avoid.

| Prefix | For |
|---|---|
| `feat/` | New behaviour |
| `fix/` | Corrected behaviour |
| `test/` | Tests only |
| `docs/` | Documentation only |
| `chore/` | Tooling, dependencies, configuration |

There is no remote, so there are no pull requests to open. If one is added
later the branch step is already in place and only the final merge changes.

**Finish the cycle.** A branch is not somewhere to accumulate work — it exists
to carry one change into `main` and then go away. Branch, build, `verify`,
commit, merge, delete. An agent working here does the merge itself once the
chain is green; it does not leave branches parked waiting to be collected.

**One branch per change, and a new one each time.** The failure mode is subtler
than committing to `main`: a branch that is never merged quietly becomes a
second trunk, and three unrelated changes end up stacked on it with `main`
frozen behind them. If the next thing is a different piece of work, it gets its
own branch off a freshly merged `main`.

### Commit messages

Conventional Commits — `type(scope): subject` — and the body explains **why**,
since the diff already shows what. Where a fix turned on some non-obvious
mechanism, name the mechanism: the next person to touch that code is the
audience.

---

## Before you commit

```powershell
cd frontend
npm run verify          # lint → typecheck → unit → build → e2e
```

Green `verify` is the bar for merging into `main`. `npm run verify:prod` runs
the same chain against a production build and is the bar before a deploy.

**Both run against the mocks, and that is deliberate.** Since M2,
`environment.ts` has `useMocks: false` — what deploys talks to the real API —
while `environment.development.ts` keeps the mocks, and `verify:prod` builds
`production,e2e` so it gets production optimisation with the mock environment.
Neither suite then needs a JVM or a Google to sign in to, which is exactly why
ADR 0001 keeps the mocks in the repo after the swap.

What that does **not** cover is backend integration. That is the scoped
acceptance run in ADR 0001: flip `environment.development.ts` to
`useMocks: false`, start both halves with `.\scripts\dev.ps1 -Fresh`, then
`npx playwright test`. 64 of 96 pass; the rest need a session or a configured
provider. Flip it back afterwards — committing that file with `useMocks: false`
turns `verify` red.

---

## Environment

**Node is installed through NVM for Windows and is not on `PATH` in a
non-interactive shell.** `node`, `npm` and `npx` all appear missing. Prepend the
symlink directory first:

```powershell
$env:Path = "C:\nvm4w\nodejs;$env:Path"
```

A dev server may already be running on `:4200` from another session. Playwright
reuses it (`reuseExistingServer`), so specs need no server started by hand;
`npm start` will simply fail with "port already in use", which is harmless.
`scripts/dev.ps1` refuses to start at all when either port is taken, which is
usually a leftover server rather than anything wrong with the code.

**Maven is not installed, by design.** Use the committed wrapper — it downloads
what it needs on first run:

```powershell
cd backend
.\mvnw.cmd test          # 123 tests
.\mvnw.cmd spring-boot:run
```

JDK 25 (Amazon Corretto) is at `C:\Program\AmazonCorretto\jdk25.0.3_9` with
`JAVA_HOME` already set, and unlike Node it *is* on `PATH` non-interactively.

Run both halves together with `.\scripts\dev.ps1` from the repo root. The SQLite
file lives in **`backend/data/`** and is gitignored; `-Fresh` deletes it so
migrations re-run from empty.

`backend/`, not the repo root, because `application.yml` resolves
`./data/bonapphedi.db` against the working directory and both `dev.ps1` and
`cd backend ; .\mvnw.cmd spring-boot:run` start the backend from there. Set
`BAH_DB` to put it anywhere else.

---

## Backend

**Write the test first, watch it fail, then make it pass.** Not a style
preference — it has caught two real defects here that a green-only run would
have shipped:

- an ingredient mapper read `base_quantity`, then `name`, then asked
  `wasNull()`. JDBC reports on the column read *last*, so "salt and pepper, to
  taste" came back quantified and would have multiplied on the servings stepper.
- the markdown renderer escaped raw HTML instead of sanitizing it. Safe, but it
  made `<b>bold</b>` render bold in the comment preview and appear as literal
  text once stored. Only reading the actual failure output showed it.

Beware also that a test asserting `isNotFound()` passes against an application
with no controller at all. Red has to fail for the reason you think it does.

The same trap has a second form worth knowing, because two tests here fell into
it: a test can exercise real logic and still assert nothing about the wiring
that logic depends on. `AppUserRegistryTest` passed its own allowlist to the
constructor in every case, so it proved the matching and would have passed
through any rename of `bah.admin.emails`. And every MockMvc suite stands a
principal up with `oauth2Login()`, so the principal is built fresh per request
and never serialized — a non-serializable field on `AppUser` would fail no test
and then throw on the first real login, after the OAuth round trip succeeded.
Both now have a test that fails when the wiring breaks, and both were confirmed
to fail by breaking it on purpose once.

Three things exist because SQLite and Spring Data JDBC do not get on, and all
three fail loudly if removed — see `config/`:

- `SqliteDialect` — Spring Data JDBC ships no SQLite dialect, so the context
  dies at `jdbcDialect` without it.
- `Instant` ↔ TEXT converters — SQLite has no date type and the driver maps
  neither direction.
- `foreign_keys=on` in the JDBC URL — off by default *per connection*, and
  without it every `ON DELETE CASCADE` in the schema is silently inert.

A fourth joined them with auth: Spring Session ships schema scripts for nine
databases and SQLite is not among them, so `V3__session.sql` creates
`SPRING_SESSION` by hand and `initialize-schema: never` stops the built-in
initializer looking for a file that does not exist. It fails in a way worth
recognising — the context starts perfectly and *every* request then dies on "no
such table: SPRING_SESSION", including anonymous ones, because saving a request
before a redirect creates a session too.

Two more pieces of auth are load-bearing and look optional:

- `CsrfCookieFilter` calls `getToken()` and nothing else. Spring Security 6
  defers generating the token until something reads it, and on an API nothing
  ever does, so without the filter `XSRF-TOKEN` is never written and the SPA can
  never make its first POST.
- `SpaCsrfTokenRequestHandler` reads a token from a *header* raw but from a form
  parameter XOR-decoded. Pairing `CookieCsrfTokenRepository` with the default
  handler instead gives a masked cookie compared against an unmasked header, and
  every write 403s.

The seed in `V2__seed.sql` is a transcription of `mock/seed-data.ts`, not a
reinterpretation of it (ADR 0001). The e2e suite asserts exact content, so a row
out of place fails the suite somewhere unrelated and blames the wrong thing.

---

## Things that are deliberate

Several oddities here look like mistakes and are not. Before "fixing" one, check
whether it is load-bearing:

- **The odd design values** (`13.8px`, `line-height: 1.55`) come from the
  prototypes in `Docs/Design/`, which are the source of truth and final.
- **The YouTube facade** exists so no Google request happens on page view. That
  is what keeps the site free of a cookie-consent obligation, so
  `disablePlaceholder` and `disableCookies` are not stylistic choices.
- **The placeholder video** is Big Buck Bunny, chosen because it is openly
  licensed and unmistakably not a cookery video. Any replacement must clear the
  same bar — never substitute copyrighted content.
- **The e2e fixture** in `frontend/e2e/fixtures.ts` fails tests on console
  errors and failed requests even when assertions pass. That is the highest-value
  behaviour in the suite; do not bypass it.

Deviations from the prototypes get an ADR in `Docs/adr/`.

---

## A caution about the test suite

The e2e specs stub the YouTube API, so they assert **calls, not geometry**. A
green suite has already coexisted with a visibly broken player — the iframe
rendered as a 150px strip inside a 378px box while every test passed.

When a change is visual, measure it in a real browser rather than trusting the
suite, and add the assertion that would have caught it.
