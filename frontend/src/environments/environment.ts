export const environment = {
  production: true,
  /**
   * False since milestone 2: what deploys talks to the real Spring Boot API.
   *
   * `environment.development.ts` stays on the mocks, and that asymmetry is
   * deliberate — the unit and e2e suites run without a JVM, which is the reason
   * ADR 0001 keeps the mocks in the repo after the swap. To point the dev server
   * at the real backend, flip the file next door and start both halves with
   * `.\scripts\dev.ps1`.
   */
  useMocks: false,
};
