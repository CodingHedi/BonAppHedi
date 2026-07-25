# Testing

One command before anything ships:

```powershell
cd frontend
npm run verify
```

Lint → typecheck → unit → production build → end-to-end. It fails fast, in that
order, because each stage is slower than the one before it.

Before an actual **deploy**, run the production variant instead — it runs the
same e2e suite against an optimised, budget-enforced, hash-named build rather
than the dev server:

```powershell
npm run verify:prod
```

---

## The layers, and what each is for

| Layer | Where | Runs in | Answers |
|---|---|---|---|
| **Lint** | `eslint.config.js` | ~10s | Does it follow the project's conventions? Includes Angular template accessibility rules. |
| **Typecheck** | `tsconfig.{app,spec}.json` | ~10s | Does it typecheck under both configs? `ng build` only covers the app one. |
| **Unit** | `src/**/*.spec.ts` (Vitest) | ~1s | Is the pure logic right? |
| **Build** | `ng build` | ~2s | Does it compile for production and stay inside the bundle budgets? |
| **Smoke** | `e2e/smoke.spec.ts` | ~3s | Does every route resolve, render, and load its assets? |
| **Behavioural e2e** | `e2e/*.spec.ts` | ~3s | Do the features work in a real browser? |

### Unit tests

Reserved for logic that is easy to get subtly wrong and cheap to pin down:

- `shared/format.spec.ts` — relative time in **both** languages, durations,
  video timestamps. These assert exact output strings (`il y a 1 mois`,
  `1 month ago`) because the design copy depends on them, and because
  `Intl.RelativeTimeFormat`'s default `numeric: 'auto'` would silently produce
  "le mois dernier" instead.
- `shared/text.spec.ts` — accent and ligature folding for search. A French
  search box that only matches `mijoté` and not `mijote` looks broken.
- `core/i18n/translations.spec.ts` — reads the shipped `public/i18n/*.json` and
  checks that every locale defines the same keys, no empty strings, matching
  interpolation placeholders, and that the French zero-is-singular plural rule
  survives.

Do **not** unit-test components. Their behaviour is covered by e2e, where it is
tested through the DOM a visitor actually gets.

### The browser-problem fixture

Every e2e spec imports `test` from `e2e/fixtures.ts`, not from
`@playwright/test`. That fixture fails a test if the browser logged an error,
threw, or failed a request — **even when every assertion passed**.

This is the highest-value thing in the suite, because it catches the regressions
nobody writes an assertion for:

- a translation file 404s and the page renders raw `nav.search` keys
- a lazy chunk path breaks and a route renders nothing
- an Angular injection error fires inside a component that still paints
- a font or asset path rots after a build-config change

If you add a spec, import from `./fixtures`. If a genuinely benign warning
starts failing tests, add it to `IGNORED` in that file **with a comment saying
why** — that list is a liability, keep it short.

### Smoke suite

`e2e/smoke.spec.ts` sweeps every route checking it resolves and renders real
content. It deliberately asserts almost nothing about behaviour.

Run it alone when you just want to know the app is fundamentally alive:

```powershell
npm run test:smoke
```

It also holds three checks that exist because the failure they catch is silent:

- **no raw translation keys** anywhere on the page
- **fonts applied** — a broken `@fontsource` import still renders, just in a
  system fallback
- **design tokens live** — if `_tokens.scss` stopped being imported the page
  would fall back to browser defaults and still look like a page

---

## Keeping this suite honest as the app grows

The suite is only worth running if it keeps pace with the code. Concretely:

**When you add a route** → add it to `ROUTES` in `e2e/smoke.spec.ts`. That is
one line and it is the whole reason the smoke suite exists.

**When you add a translation key** → nothing to do. `translations.spec.ts`
already fails if you add it to one locale and not the other.

**When you add a feature with real logic** (the servings scaler, rating dedupe,
slug generation) → unit-test the pure function, then add one e2e test proving it
works through the UI. Not every branch — the one that would embarrass you.

**When you fix a bug** → write the test that would have caught it, and write it
*first*, watching it fail. A regression test that has never failed is not known
to work.

**When you change the design system** → the token and font smoke checks cover
the catastrophic cases. Visual comparison against `Docs/Design/` stays a human
job; do not add screenshot baselines from those prototypes, they contain the
prototype's own placeholder chrome and will never match.

**Before a dependency bump or framework upgrade** → `npm run verify:prod`. This
is exactly what that variant is for.

### Anti-patterns to avoid here

- **Asserting on placeholder copy.** The legal and privacy pages are stubs until
  M3; the smoke suite matches them loosely on purpose, so writing the real copy
  is not a test failure.
- **One-shot reads of async state.** `expect(await x()).toBe(y)` does not retry.
  Angular applies theme changes in an effect that flushes after the click
  resolves, so use `expect.poll(...)` or a retrying locator assertion.
- **Screenshot baselines generated from a broken state.** Generate them only
  from a state you have actually looked at.

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

At that point `scripts/verify.ps1` runs both halves, and the M1 e2e suite must
pass **unmodified** against the real backend.

---

## CI

`.github/workflows/ci.yml` runs `verify` on every push and pull request. It is
the same chain you run locally, so a green local run means a green CI run.
