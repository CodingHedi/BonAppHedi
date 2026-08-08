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
git push                             # main and GitHub do not drift
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

**There is a remote as of 2026-08-07** — `CodingHedi/BonAppHedi`, public. Branches
still live and die locally and there are no pull requests to open; what changed
is that `main` gets pushed as soon as it moves. CI runs the same chain on every
push, so an unpushed merge is a change nothing has independently confirmed.

**Finish the cycle.** A branch is not somewhere to accumulate work — it exists
to carry one change into `main` and then go away. Branch, build, `verify`,
commit, merge, delete, push. An agent working here does the merge and the push
itself once the chain is green; it does not leave branches parked waiting to be
collected, and it does not leave `main` ahead of the remote.

**One branch per change, and a new one each time.** The failure mode is subtler
than committing to `main`: a branch that is never merged quietly becomes a
second trunk, and three unrelated changes end up stacked on it with `main`
frozen behind them. If the next thing is a different piece of work, it gets its
own branch off a freshly merged `main`.

### `deploy/` is a submodule, and it changes two things

Everything describing the server — the Caddyfile, the systemd units,
`provision.sh`, `backup.sh`, `check.sh`, `DEPLOY.md` and `deploy.ps1` — lives in
the private `CodingHedi/bonapphedi-ops` repository, mounted at `deploy/`. Nothing
here reads it, so the build, both suites and CI all pass without it; a clone
without access simply cannot deploy.

**An ops change is two commits in two repositories.** Edit the Caddyfile, commit
and push inside `deploy/`, then commit the moved pointer out here:

```powershell
cd deploy
git checkout main                    # see below - it is not on a branch
git checkout -b fix/some-thing ; git commit ; git checkout main
git merge --no-ff fix/some-thing ; git branch -d fix/some-thing ; git push
cd ..
git add deploy                       # the gitlink, not the files
```

Skip that second half and this repository silently keeps pointing at the old ops
commit. Nothing fails — that is exactly what makes it worth writing down.

**A submodule sits on a detached HEAD**, always: `git submodule update` checks
out the recorded commit, not a branch. So `git checkout main` comes first, and
without it a commit made in `deploy/` belongs to no branch, pushes nowhere, and
is gone the next time the submodule is updated.

**Checking out anything from before 2026-08-07 fails** until the submodule is
out of the way:

```
error: The following untracked working tree files would be overwritten
by checkout: deploy/Caddyfile ...
```

Those commits track `deploy/` as ordinary files, and they collide with the
submodule's own checkout. It is not corruption and nothing is lost:

```powershell
git submodule deinit -f deploy       # clears the directory
git checkout <old-commit>
git submodule update --init deploy   # when you come back
```

Worth knowing before a `git bisect`, which walks straight into it.

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

**Both run against the mocks, and nothing you do to the dev loop can change
that.** Three environment files, one job each:

| File | Used by | Yours to flip? |
|---|---|---|
| `environment.ts` | `ng build` — what deploys | No. `useMocks: false` since M2 |
| `environment.development.ts` | `npm start`, `dev.ps1` | **Yes**, whenever you want the dev loop on the real API |
| `environment.e2e.ts` | both test suites | No. Pinned to the mocks |

The e2e suite also serves on **port 4300**, not 4200. Between the pinned
environment and the separate port, a dev loop pointed at the real backend can be
running throughout a `verify` and change nothing about it.

That was not always true, and the failure was nasty: the suite used to reuse
whatever sat on 4200, so a flipped file quietly made `verify` run every spec
against a live database. 33 failed on real comments and ratings, and read
exactly like regressions in the change under test.

What the suites do **not** cover is backend integration. That is the scoped
acceptance run in ADR 0001, and it takes two deliberate acts, neither of which
can happen by accident:

```powershell
# useMocks: false in src/environments/environment.development.ts, then
.\scripts\dev.ps1 -Fresh
cd frontend ; $env:PW_TARGET = 'real' ; npx playwright test --workers=1
```

**88 of 132 as of 2026-07-28**, and every failure accounted for in TESTING.md —
40 need a session, 2 want a second provider, 2 trip over state the run itself
left. Without `PW_TARGET=real` the suite serves its own mocked build on 4300 and
measures nothing; without `-Fresh` the number drifts.

Flipping `environment.development.ts` is how you point the *dev loop* at the real
API, and leaving it flipped is harmless — `verify` is pinned to the mocks by port
and by configuration. It is a working file rather than something to commit.

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
`.\stop.bat` clears one: it finds the servers by asking who is listening on
:4200 and :8080, and refuses to kill anything that is not node or java.

**Maven is not installed, by design.** Use the committed wrapper — it downloads
what it needs on first run:

```powershell
cd backend
.\mvnw.cmd test          # 232 tests
.\mvnw.cmd spring-boot:run
```

JDK 25 (Amazon Corretto) is at `C:\Program\AmazonCorretto\jdk25.0.3_9` with
`JAVA_HOME` already set, and unlike Node it *is* on `PATH` non-interactively.

**`gh` has the same problem as Node** — installed, but not on `PATH` in a
non-interactive shell, where it reads as missing rather than as unconfigured:

```powershell
$env:Path = "C:\Program Files\GitHub CLI;$env:Path"
```

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

**Adding an endpoint under `/api` fails the build until you say who may call
it.** `ApiSecurityMatrixTest` reads the mapped handlers out of Spring and
compares them against four declared sets — public reads, anonymous writes,
session writes, admin-only. That is deliberate and it is the whole point of the
class: every other security test covers a rule somebody remembered to write, and
the endpoint nobody thought about was covered by nothing. Put the new line in
whichever set is true and the failure goes away.

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
- **`net::ERR_ABORTED` in DevTools on the live site is not a failed request.**
  Every list-page load shows two to four of them, and they are teardown noise
  from `resource()`: each one follows a `200` **for the same URL**, the body was
  received, and nothing refetches. Measured 2026-08-08 over twelve fresh loads —
  exactly five API requests every time, no duplicates, and 19 of 19 aborts
  preceded by their own 200. `/api/auth/session` is the control: it is a plain
  `HttpClient` call rather than a `resource()`, and it never aborts.
  This was previously in `Docs/backlog.md` as "every list-page request is made
  twice on first load". It is not, and that entry is gone.
- **The avatar vocabulary exists twice**, in `core/avatar/avatar-token.ts` and in
  `auth/Avatar.java`, and that is not an oversight to consolidate. The frontend
  owns the drawings and the backend owns the guard on what may be written to the
  column. `AvatarTest` reads the TypeScript and fails if the two lists disagree,
  because the drift is silent and one-directional: an icon the picker offers and
  the server does not know is a 400 on the one avatar nobody clicked. The names
  are also in the database against real accounts, so one may be added but never
  renamed (ADR 7).

Deviations from the prototypes get an ADR in `Docs/adr/`.

---

## A caution about the test suite

The e2e specs stub the YouTube API, so they assert **calls, not geometry**. A
green suite has already coexisted with a visibly broken player — the iframe
rendered as a 150px strip inside a 378px box while every test passed.

When a change is visual, measure it in a real browser rather than trusting the
suite, and add the assertion that would have caught it.
