# Bon App' Hédi

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

Two terminals.

```powershell
# terminal 1 — backend on :8080
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"

# terminal 2 — frontend on :4200 (proxies /api and /oauth2 to :8080)
cd frontend
npm start
```

Until the backend exists (milestone 2), the frontend runs entirely on mock
services — `npm start` alone is enough.

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
| `test:e2e` | ~4s | Real browser behaviour across 33 tests |

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

For local Google OAuth, register the redirect URI
`http://localhost:4200/login/oauth2/code/google` (port **4200**, not 8080 — the
dev proxy preserves the browser's origin on purpose).

---

## Layout

```
Docs/Design/     The design source of truth. HTML prototypes + screenshots.
                 Reference only — never edited.
Docs/adr/        Architecture decision records.
frontend/        Angular app (npm root).
backend/         Spring Boot app (Maven root, owns the wrapper).
scripts/         Dev, deploy and backup scripts.
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
