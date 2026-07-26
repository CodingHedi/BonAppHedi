/**
 * The environment the test suites build against. **Do not flip `useMocks` here.**
 *
 * `environment.development.ts` is yours to flip whenever you want the dev loop
 * pointed at the real backend. This file is not: the unit and e2e suites are
 * pinned to it precisely so that flipping the other one cannot change what the
 * tests run against.
 *
 * That separation exists because its absence cost real time. With the suites
 * building from the development file, pointing the dev loop at the live API made
 * `npm run verify` run the whole e2e suite against a real database — 33 specs
 * failed on live data and read exactly like regressions in the change being
 * tested. They were not.
 *
 * Running against the real API is a deliberate act with its own instructions,
 * in ADR 0001 and TESTING.md. It should never be something `verify` does by
 * accident because a file was left flipped.
 */
export const environment = {
  production: false,
  useMocks: true,
};
