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
  locale-correct slugs. Tags are a dropdown over a list of checkboxes and combine
  by narrowing, so the assertions are about checked state and falling counts —
  use the `toggleTag` helper at the top of the file rather than clicking, since
  the list has to be opened first. Also that the trigger's count reports what is
  on while the list is shut, that Escape closes it and hands focus back, that the
  header magnifier reaches the search box, and that its focus request does not
  linger into the next visit.
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
- **Matching copy loosely to protect a placeholder.** The smoke suite once
  matched the legal and privacy pages on `/confidentialité|privacy/i`, so that
  writing the real copy would not fail a test. It also meant the mentions
  légales read "À compléter avant la mise en ligne" for months, green the whole
  time, while the site was live. Both notices are written now, and the legal
  rows are pinned to `Hébergeur` and `Host`. An assertion loose enough never to
  fail is not protecting anything.
- **Screenshot baselines from `Docs/Design/`.** Those prototypes contain their
  own drag-and-drop placeholder chrome and will never match a real render.
  Generate baselines only from a state you have actually looked at.

---

## Backend

```powershell
cd backend
.\mvnw.cmd test          # 290 tests
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

**"Each test class" is a rule two classes broke, and the cost was four red
merges.** `RecipeImageTest` and `RecipeMetadataTest` shipped in milestone 3
without a `@TestPropertySource`, so both fell back to the default datasource —
`backend/data/bonapphedi.db`, the developer's own dev database. Locally that
mostly worked, while quietly running the suite against real data. In CI there is
no `backend/data` at all, Flyway cannot open a file inside a directory that does
not exist, and both classes died at `SQLITE_CANTOPEN`. A class that declares no
database is not isolated by accident; it is sharing one nobody chose.

The same fix surfaced a second one. `RecipeMetadataTest` reads the served shell,
which `IndexHtmlController` loads **once at context startup**, and
`SpaFallbackTest` used to write its stand-in `index.html` into
`target/test-classes/static` in a `@BeforeAll`. Which of the two won came down
to which booted its context first — green in CI, six of seven red locally, on
run order alone. The stand-ins are committed test resources now, and nothing
writes to the classpath during a run. **If a suite depends on a file another
suite writes, it is not a suite, it is a race.**

Milestone 3 added four backend classes worth knowing by name:
`RecipeImageTest` (photographs reach the JSON), `RecipeMetadataTest` (ADR 4's
metadata in the served HTML, including that an edit invalidates it),
`SitemapAndRssTest` (the sitemap, both feeds and `robots.txt`) and
`PhotoUploadTest` (the upload, and every limit ADR 8 said was not optional).

### What the plan asked for, and what actually exists

Kept honest deliberately: a list of intentions reads the same whether or not it
was carried out.

| Planned | Now |
|---|---|
| MockMvc contract tests per endpoint, per locale | **Yes** — `RecipeApiTest`, `SocialApiTest`, `AdminApiTest`, `AuthApiTest` assert JSON keys, not just status codes |
| Rating dedupe: same cookie twice, both locales, fingerprint limit | **Yes** — all three, in `SocialApiTest` |
| Sanitizer tests for `<script>`, `<img onerror>`, `javascript:` hrefs | **Yes** — `MarkdownRendererTest`, plus a comment fed through the write path |
| Security matrix, anonymous / `ROLE_USER` / `ROLE_ADMIN` | **Yes** — `ApiSecurityMatrixTest` covers every endpoint under `/api`, and fails when one appears that the matrix does not name |
| The 0/1/2-provider matrix for config-driven OAuth | **Yes** — 0 (`AuthDisabledTest`), 1 (`AuthApiTest`), 2 (`AuthTwoProvidersTest`) |
| A Flyway migration test running V1→Vn on a fresh database | **Yes** — `MigrationsFromEmptyTest`, against a `@TempDir` file that has never existed |
| `scripts/verify.ps1` running both halves | **No** — it does not exist. `frontend/npm run verify` and `backend/.\mvnw.cmd test` are run separately |

**`ApiSecurityMatrixTest` is the one to know about before adding an endpoint.**
It reads the mapped handlers out of Spring and compares them against four
declared sets, so a new mapping fails the build until somebody writes down who
may call it. That is the gap it closes: the rules were tested where anyone
thought to test them, and an endpoint nobody thought about was covered by
nothing. It fails in the other direction too, when the matrix names an endpoint
that has been deleted.

The one remaining gap is in [Docs/backlog.md](Docs/backlog.md) rather than left
here as an implied promise.

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

**Measured 2026-08-08: 153 of 154 pass.** The 40 specs that used to be
unrunnable because they need a session now run — `application-acceptance.yml`
points sign-in at a local OIDC issuer and a real authorization-code flow
completes — and the database is put back to the seeded state before every spec,
which is what the mocks gave the suite for free by resetting on every page load.
ADR 0001's second amendment records the exemption that makes the first part
legal: the three sign-in helpers may differ between backends, and nothing else
does.

**The one failure cannot pass and should not be made to.** `admin.spec.ts` has
*"signing in as the admin opens the door, without a reload"*. Against the mocks
signing in is a state change with no navigation; against real OAuth it is three
redirects, so there is necessarily a reload. It asserts something only a mock can
do.

Nothing found in getting from 88 to 153 was a defect in the application. Every
failure resolved along the way was the two fixtures disagreeing about what a
signed-in account looks like — its name, its avatar, how many providers exist —
or a bug in the harness itself. Zero contract drift, still.

To reproduce:

```powershell
# 1. Point the dev loop at the real API
#    useMocks: false in src/environments/environment.development.ts
.\scripts\dev.ps1 -Fresh -Acceptance
# 2. Then, in another shell
cd frontend
$env:PW_TARGET = 'real'
npx playwright test --workers=1
```

**`-Acceptance` starts the backend under the `acceptance` profile**, which is
what points sign-in at the local issuer. Without it the backend uses whatever
`application-local.yml` holds — real Google — and every session spec fails at a
consent screen Playwright cannot drive. Playwright starts the issuer itself.

**`PW_TARGET=real`** is what makes the suite use the dev server on 4200 instead
of starting its own mocked one on 4300 — without it you measure the mocks and
learn nothing.

**`--workers=1` is required, not a precaution.** One database, one reset endpoint
and one issuer identity are all shared by the whole run; two workers would race
for every one of them. `-Fresh` matters much less than it used to, now that each
spec resets, but it still guarantees the run starts from the same place it will
end.

The one failure, accounted for:

| Cause | Specs | Why |
|---|---|---|
| Only a mock can do it | 1 | `signing in as the admin opens the door, **without a reload**`. Against the mocks signing in is a state change with no navigation; against real OAuth it is three redirects. The spec is true of a mock and false of the world, and is left failing rather than rewritten to suit the harness. |

### The signed-in half, by hand

Playwright cannot reach one thing and never will: **Google's own login form**.
Google detects automated browsers and refuses to render it — the same in
Playwright, Cypress, Selenium and Puppeteer, with no sanctioned way round it. The
suite proves the integration against a local OIDC issuer, which is all of *this*
application's code. The provider's own screen needs a person.

**Done 2026-08-08, and every step passed:**

| Checked | Result |
|---|---|
| Sign-in returns to the recipe you were reading, not the home page | ✅ |
| A new account arrives with no avatar (ADR 7 makes it a choice) | ✅ |
| Choosing subject, tint and ink saves and shows in the header | ✅ |
| A display name saves, and clearing it falls back to the account name | ✅ |
| A posted comment carries the chosen avatar, drawn as SVG | ✅ |
| **No request to `googleusercontent.com` or `gstatic.com` on that page** | ✅ |
| The allowlisted account gets the admin area | ✅ |
| A second, non-allowlisted account does not, and `/fr/admin` sends it home | ✅ |

The sixth row is the one worth having done. It is the whole point of ADR 7: a
commenter's avatar used to be the URL the provider returned, so *reading* a
thread disclosed the reader's IP to Google. It renders perfectly either way —
only a request log tells you, and no test in this suite runs against real Google
to check.

Register **both** redirect URIs in the Google console before trying this:
`http://localhost:4200/login/oauth2/code/google` and the production one. They
coexist; replacing one with the other breaks the environment you are not looking
at, and Google reports only `redirect_uri_mismatch`.

---

## CI

`.github/workflows/ci.yml` runs **both halves** on every push and pull request,
as two independent jobs:

| Job | Runs | Matching local command |
|---|---|---|
| `frontend` | lint → typecheck → unit → build → e2e | `cd frontend ; npm run verify` |
| `backend` | the 185 JVM tests | `cd backend ; .\mvnw.cmd test` |

Green locally on both means green in CI; if it does not, the workflow and the
local commands have drifted and one of them is wrong.

**The backend job is new, and its absence is worth recording.** For the whole of
milestone 2 and everything after it, CI ran the frontend only — this file said
"the same chain" and meant one half of it. Every backend test, including the
migration and security ones written specifically to catch what review would not,
ran only when somebody remembered to type the command. Nothing was found broken
when the job was added, which is luck rather than vindication.

The jobs are independent rather than sequential on purpose. Neither can break the
other — the frontend suites are pinned to the mocks and never reach a JVM — so
chaining them would only delay finding out that both are broken.
