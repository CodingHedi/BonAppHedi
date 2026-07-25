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

### Before you ship

One command. Run it before any release, dependency bump or framework upgrade:

```powershell
cd frontend
npm run verify          # lint → typecheck → unit → build → e2e
npm run verify:prod     # same, but e2e against a production build
```

See **[Docs/TESTING.md](Docs/TESTING.md)** for what each layer covers and — more
importantly — what to add when the app grows.

### Other commands

```powershell
cd frontend
npm test                              # unit (vitest)
npm run test:smoke                    # "is the app alive" route sweep
npm run test:e2e                      # full playwright suite
npm run test:e2e:ui                   # playwright, interactive
npm run lint
npm run format
npm run build -- --configuration production

cd backend
.\mvnw.cmd clean verify               # compile + all tests
.\mvnw.cmd -Pweb clean package        # fat jar including the Angular build
```

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
