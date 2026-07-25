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
  acceptance test for milestone 2.
