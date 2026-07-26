# Testing

> The [README](README.md#testing) covers the commands and how the chain fits
> together, including why the browser-problem fixture exists. This is the
> reference: what each layer is responsible for, and — more importantly — what
> to add as the app grows.

```powershell
cd frontend
npm run verify          # lint → typecheck → unit → build → e2e
npm run verify:prod     # same, e2e against a production build
```

---

## The layers

| Layer | Where | Time | Answers |
|---|---|---|---|
| **Lint** | `frontend/eslint.config.js` | ~10s | Does it follow the project's conventions? Includes Angular template accessibility rules. |
| **Typecheck** | `frontend/tsconfig.{app,spec}.json` | ~10s | Does it typecheck under both configs? `ng build` only covers the app one. |
| **Unit** | `frontend/src/**/*.spec.ts` (Vitest) | ~1s | Is the pure logic right? |
| **Build** | `ng build` | ~2s | Does it compile for production and stay inside the bundle budgets? |
| **Smoke** | `frontend/e2e/smoke.spec.ts` | ~3s | Does every route resolve, render and load its assets? |
| **Behavioural e2e** | `frontend/e2e/*.spec.ts` | ~3s | Do the features work in a real browser? |

### Unit tests

Reserved for logic that is easy to get subtly wrong and cheap to pin down.

- **`src/app/shared/format.spec.ts`** — relative time in *both* languages,
  durations, video timestamps. Asserts exact output strings (`il y a 1 mois`,
  `1 month ago`) because the design copy depends on them, and because
  `Intl.RelativeTimeFormat`'s default `numeric: 'auto'` would silently render
  "le mois dernier" instead.
- **`src/app/shared/text.spec.ts`** — accent and ligature folding for search. A
  French search box that matches `mijoté` but not `mijote` looks broken to
  everyone typing on a normal keyboard.
- **`src/app/core/i18n/translations.spec.ts`** — reads the shipped
  `public/i18n/*.json` and checks every locale defines the same keys, no empty
  strings, matching interpolation placeholders, and that the French
  zero-is-singular plural rule survives. Reads from disk rather than importing,
  so it asserts against what actually deploys.

**Do not unit-test components.** Their behaviour is covered end-to-end, through
the DOM a visitor actually gets.

### End-to-end

- **`e2e/fixtures.ts`** — the shared `test` export. Every spec imports from here,
  never from `@playwright/test` directly. See the README for why.
- **`e2e/smoke.spec.ts`** — route sweep plus the silent-failure checks
  (no raw translation keys, fonts applied, tokens live).
- **`e2e/shell.spec.ts`** — locale redirect, language switching, theme
  persistence across reload, OS dark-mode default, 404 handling.
- **`e2e/recipe-list.spec.ts`** — search, filtering, sorting, carousel, and
  locale-correct slugs.

---

## Keeping this honest as the app grows

The suite is only worth running if it keeps pace with the code.

**Add a route** → add it to `ROUTES` in `e2e/smoke.spec.ts`. One line, and it is
the entire reason that file exists.

**Add a translation key** → nothing to do. `translations.spec.ts` already fails
if you add it to one locale and forget the other.

**Add a feature with real logic** (the servings scaler, rating dedupe, slug
generation) → unit-test the pure function, then add *one* e2e test proving it
works through the UI. Not every branch: the one that would embarrass you.

**Fix a bug** → write the test that would have caught it, and write it *first*,
watching it fail. A regression test that has never failed is not known to work.

**Add an e2e spec** → import `test` from `./fixtures`. If a genuinely benign
warning starts failing tests, add it to `IGNORED` there **with a comment saying
why**. That list is a liability; keep it short.

**Change the design system** → the token and font smoke checks cover the
catastrophic cases. Visual comparison against `Docs/Design/` stays a human job.

**Bump a dependency or upgrade the framework** → `npm run verify:prod`. That is
exactly what the prod variant is for.

### Traps already hit here

Recorded because each one cost time once:

- **One-shot reads of async state.** `expect(await x()).toBe(y)` does not retry.
  Angular applies theme changes in an effect that flushes *after* the click
  resolves, so use `expect.poll(...)` or a retrying locator assertion.
- **Asserting a specific language on `/`.** That route negotiates from
  `Accept-Language`, and the test browser reports `en-US`. Pinning French there
  asserts the negotiation is broken.
- **Asserting on placeholder copy.** The legal and privacy pages are stubs until
  M3, so the smoke suite matches them loosely on purpose — writing the real copy
  should not be a test failure.
- **Screenshot baselines from `Docs/Design/`.** Those prototypes contain their
  own drag-and-drop placeholder chrome and will never match a real render.
  Generate baselines only from a state you have actually looked at.

---

## Backend (from milestone 2)

Not yet present. When it lands:

```powershell
cd backend
.\mvnw.cmd clean verify        # Maven is NOT installed; always the wrapper
```

Planned coverage, per `Docs/adr/` and the implementation plan:

- MockMvc contract tests per endpoint **per locale**, asserting the exact JSON
  shape the M1 mocks produced — that is the acceptance test for the mock→API
  swap
- a Flyway migration test running V1→Vn against a fresh temporary database
- rating dedupe: same cookie twice → one row; both locales → one row; three
  cookies sharing a fingerprint → 429
- the 0/1/2-provider matrix for config-driven OAuth
- sanitizer tests feeding `<script>`, `<img onerror>`, `javascript:` hrefs and
  `<iframe>` through both policies
- a security matrix (anonymous / `ROLE_USER` / `ROLE_ADMIN` × each endpoint)

At that point `scripts/verify.ps1` runs both halves, and **the milestone-1 e2e
suite must pass unmodified against the real backend** — that is the acceptance
test for the swap.

**Measured 2026-07-27: 64 of 96 pass, and none of the 32 failures is a contract
mismatch.** ADR 0001 carries the amendment that scopes the guarantee to the
specs not requiring a session, and explains why the other 26 cannot pass without
a live Google. To reproduce: flip `useMocks` to false in
`environments/environment.development.ts`, start both halves with
`.\scripts\dev.ps1 -Fresh`, and run `npx playwright test`. The `-Fresh` matters —
a database carrying a previous run's ratings fails specs that assert the seeded
`4.0 / 5 · 1 avis`, and those failures look exactly like backend bugs.

---

## CI

`.github/workflows/ci.yml` runs the same chain on every push and pull request.
Green locally means green in CI; if it does not, the workflow and the `verify`
script have drifted apart and one of them is wrong.
