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
  everyone typing on a normal keyboard. Also the typo-tolerant matcher and its
  edit-distance budget, where the cases that matter are the ones it must *not*
  match: `poivron` and `poivre` are two edits apart and both are seeded, so the
  budget is what keeps a search for one from answering with the other.
- **`src/app/shared/markdown-input.spec.ts`** — what the comment toolbar does to
  a selection. Unwrapping rather than nesting, toggling a prefix across several
  lines, and telling `*italic*` from the inner half of `**bold**`.
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
  locale-correct slugs. Tags are toggle chips rather than a dropdown and combine
  by narrowing, so the assertions are about `aria-pressed` and falling counts.
  Also that the header magnifier reaches the search box, and that its focus
  request does not linger into the next visit.
- **`e2e/profile.spec.ts`** — the account page: the guard, the picker, saving,
  and that choosing an avatar costs no request to anyone (ADR 7).

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

## Backend

```powershell
cd backend
.\mvnw.cmd test          # 170 tests
```

**One assertion cannot live in `AuthApiTest`, and it is worth knowing why.**
Spring Security's `csrf()` request post-processor swaps the application's
`CookieCsrfTokenRepository` for a test one at *servlet-context* scope, not per
request. So from the first test in a class that uses `csrf()` onwards, no
response carries `XSRF-TOKEN`, and any assertion that it does passes or fails on
whatever order JUnit happens to run the methods in. It passed that way for
months and went red when five unrelated methods were added. It now lives in
`CsrfCookieTest`, which has a context with no `csrf()` in it — so do not add one
there.

**Renaming or deleting a migration needs `clean`.** Maven copies resources into
`target/classes` and never removes ones that have disappeared from `src`, so a
migration you have just renamed is still on the classpath and still runs. It
cost a confused minute here; without `.\mvnw.cmd clean test` you are testing the
migrations you used to have.

Each test class points `spring.datasource.url` at its own file under `target/`,
so the classes do not share state — but those files **persist between runs**,
which is why the classes that write also reset in `@BeforeEach`. A test that
forgets to is a test that can pass on last run's leftovers.

### What the plan asked for, and what actually exists

Kept honest deliberately: a list of intentions reads the same whether or not it
was carried out.

| Planned | Now |
|---|---|
| MockMvc contract tests per endpoint, per locale | **Yes** — `RecipeApiTest`, `SocialApiTest`, `AdminApiTest`, `AuthApiTest` assert JSON keys, not just status codes |
| Rating dedupe: same cookie twice, both locales, fingerprint limit | **Yes** — all three, in `SocialApiTest` |
| Sanitizer tests for `<script>`, `<img onerror>`, `javascript:` hrefs | **Yes** — `MarkdownRendererTest`, plus a comment fed through the write path |
| Security matrix, anonymous / `ROLE_USER` / `ROLE_ADMIN` | **Partly** — every `/api/admin/**` path across all three roles, but not each social endpoint |
| The 0/1/2-provider matrix for config-driven OAuth | **Partly** — 0 (`AuthDisabledTest`) and 1 (`AuthApiTest`). Two configured at once is untested |
| A Flyway migration test running V1→Vn on a fresh database | **Yes** — `MigrationsFromEmptyTest`, against a `@TempDir` file that has never existed |
| `scripts/verify.ps1` running both halves | **No** — it does not exist. `frontend/npm run verify` and `backend/.\mvnw.cmd test` are run separately |

The three gaps are in [Docs/backlog.md](Docs/backlog.md) rather than left here as
implied promises.

### Things caught by tests that were written first

Both of these passed a green-only run and were only found by reading an actual
failure — which is why `CLAUDE.md` insists on red first:

- an ingredient mapper read `base_quantity`, then `name`, then asked `wasNull()`.
  JDBC reports on the column read **last**, so "salt and pepper, to taste" came
  back quantified.
- the markdown renderer escaped raw HTML instead of sanitizing it. Safe, but
  `<b>bold</b>` rendered bold in the preview and appeared as literal text once
  stored.

And two found only by running the real thing, which no unit test would have
reached: a blank `fingerprint-salt` made every rating a 500 on a default
install, and `-Fresh` had never deleted the database it claimed to.

**The milestone-1 e2e suite must pass unmodified against the real backend** —
that is the acceptance test for the swap, scoped by the amendment in ADR 0001.

**Measured 2026-07-27: 64 of 96 pass, and none of the 32 failures is a contract
mismatch.** ADR 0001 carries the amendment that scopes the guarantee to the
specs not requiring a session, and explains why the other 26 cannot pass without
a live Google. That figure predates the avatar work and the suite is now 115
specs; it has not been re-measured, because it currently cannot be.

**The reproduction below no longer does what it says, and that is the fix worth
making next.** It used to work because the suite reused whatever served on 4200.
Pinning it to its own port and to `environment.e2e.ts` is what stopped a flipped
dev loop turning `verify` red — and it also removed the only way to point the
suite at the real backend. `npx playwright test` now starts its own server on
4300 against the mocks, whatever is running on 4200:

```powershell
# What the acceptance run used to be. The last line no longer reaches :4200.
# Flip useMocks to false in environments/environment.development.ts
.\scripts\dev.ps1 -Fresh
npx playwright test
```

Reaching the real API again needs a deliberate opt-in in `playwright.config.ts`
— a `PW_TARGET=real` alongside the existing `prod`, setting `baseURL` to 4200 and
omitting `webServer` — and that is in `Docs/backlog.md`. The `-Fresh` still
matters when it comes back: a database carrying a previous run's ratings fails
specs that assert the seeded `4.0 / 5 · 1 avis`, and those failures look exactly
like backend bugs.

What *was* checked against the real API on 2026-07-27, by hand rather than
through the suite: migrations apply from empty through V6; a plain GET issues
`XSRF-TOKEN`; `PUT /api/auth/avatar` answers 403 without the token and 401 with
it while anonymous; the comment endpoint returns `author.avatar` and no
`author.avatarUrl`; `/fr/profil` redirects an anonymous visitor to sign-in
carrying `returnTo`; and a recipe page with its seeded thread makes no request to
any provider. Signing in, choosing an avatar and seeing it against a comment
needs a person at a browser, because the OAuth round trip does.

---

## CI

`.github/workflows/ci.yml` runs the same chain on every push and pull request.
Green locally means green in CI; if it does not, the workflow and the `verify`
script have drifted apart and one of them is wrong.
