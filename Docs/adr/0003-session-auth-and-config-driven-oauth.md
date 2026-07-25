# 3. Session-cookie auth, with OAuth providers discovered from config

Date: 2026-07-25 · Status: accepted

## Context

Reading and rating recipes requires no account. Commenting requires signing in.
The design prototype showed a single hardcoded "S'identifier avec GitHub"
button; the actual providers are Google and Facebook.

Instagram was requested and rejected on fact: the Basic Display API — the only
path for ordinary personal accounts — was shut down in December 2024, and its
replacement requires a Business/Creator account plus Meta app review. Facebook
is the working substitute for the same identity.

## Decision

**Session cookies** (Spring Session JDBC), not JWT. The frontend and API are
same-origin in every environment, so there is no reason to put a bearer token
in JavaScript where XSS can reach it — and logout genuinely invalidates.

**Providers are discovered from configuration.** `ClientRegistrationConfig`
builds registrations from `CommonOAuth2Provider`, skipping any whose client-id
or secret is blank, and `GET /api/auth/providers` returns what survived. The
Angular sign-in row renders one button per entry.

## Consequences

- Enabling Facebook later is a config change and a restart. The frontend has no
  knowledge of which providers exist and never needs redeploying for one.
- Zero providers configured is a valid state: the app boots, the endpoint
  returns `[]`, the sign-in row shows an unavailable notice, and nothing 500s.
  There is a test for exactly this.
- `spring.security.oauth2.client.registration.*` with blank placeholder values
  cannot be used — Spring rejects a blank client-id at startup. Hence the custom
  `bah.oauth.*` properties.
- `http.oauth2Login(...)` is only wired when at least one provider exists;
  Spring throws on an empty `InMemoryClientRegistrationRepository`.
- Facebook needs an explicit user-info URI
  (`graph.facebook.com/me?fields=id,name,email,...`) or the user arrives with no
  name and no email.
- Facebook additionally requires app review for the `email` permission before
  non-admin users can log in. Google ships first for that reason.
- Admin is an email allowlist checked on every login, so removing yourself from
  the list actually demotes you.
- CSRF: Spring Security 6+ XOR-encodes tokens, which breaks the naive
  `CookieCsrfTokenRepository` pairing. The documented SPA handler pattern is
  required, plus a filter that forces the cookie to be issued.
