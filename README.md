# BonApp' Hedi

Un carnet de recettes tenu à la main. / A hand-kept recipe notebook.

Bilingual (FR/EN) personal recipe site: browse and rate recipes without an account,
comment after signing in with Google or Facebook, and author everything from a
private admin area.

| | |
|---|---|
| Frontend | Angular (standalone, zoneless, signals) + Transloco |
| Backend | Spring Boot, Java 25, Maven |
| Database | SQLite (Flyway migrations, Spring Data JDBC) |
| Deploy | Single fat jar behind Caddy on an OVH VPS (Ubuntu) |

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| JDK | Amazon Corretto **25** | Already installed at `C:\Program\AmazonCorretto\jdk25.0.3_9` |
| Node.js | **22 LTS** (or 24 LTS) | Required — see below. Angular rejects odd releases (21/23). |
| Maven | — | **Do not install.** Use the wrapper: `backend/mvnw` / `mvnw.cmd` |

### Installing Node

```powershell
winget install CoreyButler.NVMforWindows
# then, in a NEW shell:
nvm install 22.20.0
nvm use 22.20.0
node -v ; npm -v
```

The pinned version lives in `frontend/.nvmrc`.

---

## Dev loop

One command, from the repo root:

```powershell
.\scripts\dev.ps1            # backend on :8080, then frontend on :4200
.\scripts\dev.ps1 -Mocks     # frontend only, against its mock services
.\scripts\dev.ps1 -Fresh     # delete the SQLite file first, re-run every migration
```

It waits for the backend to answer before starting the frontend, so the first
page load never races a JVM that is still coming up, and Ctrl+C stops both. If
either port is already taken it says so up front rather than half-starting.

Or double-click **`start.bat`** in the repo root, which runs the same script and
opens the browser once the frontend has finished compiling. It takes the same
arguments (`start.bat -Fresh`). **`stop.bat`** is the way out when Ctrl+C could
not run — a window closed with the X button, or a leftover from a session you no
longer have a terminal for; it finds the servers by asking who holds :4200 and
:8080, and leaves anything that is not node or java alone.

The frontend proxies `/api`, `/oauth2`, `/login`, `/logout` and `/media` to
`:8080` (`frontend/proxy.conf.json`).

<details>
<summary>Two terminals, if you prefer</summary>

```powershell
cd backend  ; .\mvnw.cmd spring-boot:run
cd frontend ; npm start
```

</details>

### Running these from anywhere

Everything above wants the repo root, which means a `cd` before each one.
Double-click **`install-shortcuts.bat`**, or:

```powershell
.\scripts\install-shortcuts.ps1          # write them
.\scripts\install-shortcuts.ps1 -WhatIf  # print the block, change nothing
.\scripts\install-shortcuts.ps1 -Remove  # take them back out
```

That writes a fenced block of small functions into your PowerShell profile, and
`bah-dev`, `bah-verify`, `bah-deploy` and the rest then work from any directory.

| Command | Runs |
|---|---|
| `bah-dev` | `scripts\dev.ps1` — the dev loop |
| `bah-stop` | `stop.bat` |
| `bah-api` | `scripts\api.ps1` |
| `bah-verify` | `npm run verify`, from `frontend/` |
| `bah-test-backend` | `mvnw test`, from `backend/` |
| `bah-repo` | `cd` to the repository |
| `bah-deploy`, `bah-backup` | the private submodule's scripts, when you have it |

The shell scripts in `deploy/` run on the server rather than here, so theirs are
ssh wrappers — `bah-check` (read-only: what state is the server in),
`bah-digest`, `bah-notify`, `bah-backup-now`, `bah-bans`, `bah-serverlog`,
`bah-ssh` and `bah-provision`. The address is read out of the private submodule
when the block is generated and appears only in your own profile, never in this
repository.

Arguments pass straight through, so `bah-dev -Fresh` and `bah-deploy -Provision`
work as they do from the root.

**It writes to your profile and to nothing in this repository**, which is why
the shortcuts are generated rather than committed: the paths are worked out from
where the script sits, so they are right for your clone and would be wrong in
anybody else's. Re-run it after moving the clone. A command whose script is not
in your checkout is skipped rather than written — `deploy/` is a private
submodule, and a clone without it should not get a `bah-deploy` that fails with
a path nobody recognises.

### Other commands

```powershell
cd frontend
npm run lint
npm run format
npm run build -- --configuration production

cd backend
.\mvnw.cmd clean verify               # compile + all tests
.\mvnw.cmd -Pweb clean package        # fat jar including the Angular build
```

`-Pweb` copies `frontend/dist` into the jar rather than building it, so run
`npm run build` first. It fails with a message saying so if you have not — a jar
without `static/index.html` answers every page with a 404 and nothing reveals
that until it is on the server. In practice use `.\deploy\deploy.ps1`, which
does both in the right order and checks the artefact before it ships — it lives
in the private submodule described under [Layout](#layout).

---

## Testing

**Before any release, dependency bump or framework upgrade:**

```powershell
cd frontend
npm run verify          # lint → typecheck → unit → build → e2e
npm run verify:prod     # same, but e2e against a production build
```

Full reference, and what to add as the app grows: **[TESTING.md](TESTING.md)**.

### How it works

`verify` chains five stages, ordered cheapest-first so it fails fast:

| Stage | Time | Catches |
|---|---|---|
| `lint` | ~10s | Convention drift, and Angular template accessibility problems |
| `typecheck` | ~10s | Type errors under **both** tsconfigs — `ng build` only covers the app one |
| `test` | ~1s | Pure logic: relative time in both languages, accent folding, translation-key parity |
| `build` | ~2s | Production compilation and the bundle budgets |
| `test:e2e` | ~6s | Real browser behaviour: every route, both locales, both themes |

`verify:prod` swaps the dev server for an optimised, hash-named, budget-enforced
build. Use it before an actual deploy — failures that only show up there are
precisely the ones that would otherwise show up in production.

### The part worth knowing about

Every end-to-end spec imports its `test` from `frontend/e2e/fixtures.ts` rather
than from Playwright directly. That fixture fails a test if the browser logged
an error, threw, or failed a request — **even when every assertion passed**.

That is deliberate, and it is the highest-value thing in the suite, because it
catches the breakages nobody thinks to write an assertion for:

- a translation file 404s, so the page renders raw `nav.search` keys
- a lazy chunk path breaks, so a route silently renders nothing
- an Angular injection error fires inside a component that still paints
- a font or asset path rots after a build-config change

Each of those produces a fully green suite and a visibly broken site without it.

Alongside that, `e2e/smoke.spec.ts` sweeps every route and asserts three things
whose failure is otherwise invisible: no raw translation keys reach the page,
the self-hosted fonts actually applied (a broken import still renders, just in a
system fallback), and the design tokens are live (an unimported `_tokens.scss`
still looks like a page, only the wrong one).

Run just that sweep when you only want to know the app is alive:

```powershell
npm run test:smoke
```

### While developing

```powershell
npm run test:watch      # unit tests, re-running on change
npm run test:e2e:ui     # Playwright's interactive runner
```

CI runs the identical chain on every push and pull request, so a green local
`verify` means a green CI run.

---

## Git workflow

`main` is never committed to directly. Branch, verify, then merge with
`--no-ff` so each change stays one readable unit in the history:

```powershell
git checkout -b fix/some-thing
cd frontend ; npm run verify
git commit
git checkout main ; git merge --no-ff fix/some-thing
```

That, the commit-message convention and the local gotchas worth knowing are in
**[CLAUDE.md](CLAUDE.md)**.

---

## Configuration

Secrets never live in the repo. Copy the example and fill it in:

```powershell
cp backend/src/main/resources/application-local.yml.example `
   backend/src/main/resources/application-local.yml
```

`application-local.yml` is gitignored. It holds:

- `bah.oauth.google.client-id` / `client-secret`
- `bah.oauth.facebook.client-id` / `client-secret` (optional)
- `bah.security.fingerprint-salt`
- `bah.admin.emails`

**OAuth providers are discovered from configuration.** Whatever you leave blank
simply doesn't appear as a sign-in button — `GET /api/auth/providers` only
returns providers that have credentials. Adding Facebook later is a config
change and a restart, not a code change.

For local Google OAuth, **add** this redirect URI in the Google Cloud console:

```
http://localhost:4200/login/oauth2/code/google
```

**Add, not replace.** The OAuth client holds a list, and the deployed site needs
its own entry — `https://bonapphedi.fr/login/oauth2/code/google`, registered in
DEPLOY.md's first-time steps. Both belong there at once and neither affects the
other. Swapping one for the other breaks the environment you are not looking at,
and the error Google returns says only `redirect_uri_mismatch`, which describes
every possible cause of it equally well.

Two details, both of which produce that same unhelpful error:

- **Port 4200, not 8080.** The dev proxy preserves the browser's origin on
  purpose, so Google sees the Angular port rather than the API's.
- **`http`, not `https`.** Google allows plain HTTP for `localhost` specifically,
  and for nothing else.

---

## Layout

```
Docs/Design/     The design source of truth. HTML prototypes + screenshots.
                 Reference only — never edited.
Docs/adr/        Architecture decision records.
Docs/backlog.md  Wanted, shape already obvious, not yet scheduled.
frontend/        Angular app (npm root).
backend/         Spring Boot app (Maven root, owns the wrapper).
scripts/         dev.ps1, stop.ps1, api.ps1, install-shortcuts.ps1,
                 csp-lab.mjs, check-legal.mjs.
deploy/          Private submodule. What runs on the server, plus DEPLOY.md
                 and deploy.ps1.
```

### The `deploy/` submodule

Everything describing the **machine** rather than the application lives in a
separate private repository, mounted here at `deploy/`: the Caddyfile, the
systemd units, `provision.sh`, `backup.sh`, `check.sh`, `DEPLOY.md` and
`deploy.ps1`.

The split is about topology, not secrets — no credential has ever been committed
to either repository, and the VPS address is simply the public A record for
`bonapphedi.fr`. What is worth not publishing is a ready-made map of a live
server: the login user, the paths, the unit names, the firewall, the
provisioning order.

Nothing in this repository reads `deploy/`. It is absent from the build, the
test suites and CI, so **the application clones, builds, tests and runs
perfectly well without it** — you simply cannot deploy. If you do have access:

```powershell
git clone --recurse-submodules <url>
# or, in an existing clone
git submodule update --init
```

### Design source of truth

`Docs/Design/index.html` and `recipe.html` are high-fidelity prototypes: colours,
typography, spacing and copy in them are **final**. Their stylesheet was not
supplied, so the `.btn` / `.card` / `.tag` / `.input` layer is reconstructed in
`frontend/src/styles/_primitives.scss`. Everything else in the prototypes is
inline styles, which are authoritative — the odd-looking values (`13.8px`,
`11.5px`, `line-height: 1.55`) are deliberate, not noise.

Two intentional deviations from the prototypes are documented in
`Docs/adr/`: the shopping-list button is cut, and the single "sign in with
GitHub" button becomes a config-driven provider row.

---

## Internationalization

Two separate problems, kept separate:

- **UI chrome** → `frontend/public/i18n/{fr,en}.json`, handled by Transloco.
- **Recipe content** → per-locale rows in the database, resolved by the API.

URLs are path-prefixed and fully localized, slugs included:
`/fr/recettes/babka-au-chocolat` ↔ `/en/recipes/chocolate-babka`.
French is the default and the fallback.
