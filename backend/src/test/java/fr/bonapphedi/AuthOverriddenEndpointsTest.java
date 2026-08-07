package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.config.ConfiguredProviders;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A provider whose endpoints have been pointed somewhere other than the real
 * one.
 *
 * <p>This exists for the acceptance run. 40 of the 132 milestone-1 specs need a
 * signed-in session, and against the real API signing in means clicking a button
 * that navigates to Google and never comes back — so a third of the suite has
 * never run against the real backend at all (ADR 0001's amendment scopes the
 * guarantee around exactly that hole). Playwright cannot fake the round trip:
 * the token exchange and the userinfo call are server-to-server and never touch
 * the browser. The only way in is to give the server a different issuer to talk
 * to.
 *
 * <p>Deliberately the <em>same</em> registration id. The acceptance run overrides
 * {@code google}'s endpoints rather than inventing a provider, so the sign-in row
 * still renders one Google button, the specs still click it, and nothing about
 * the frontend knows or cares. What changes is who answers.
 *
 * <p>Endpoint URIs rather than an {@code issuer-uri} with OIDC discovery, and
 * that is the whole reason this is four properties instead of one: Spring
 * resolves an issuer eagerly while building the bean, so the application would
 * fail to boot whenever the issuer was not already listening. A startup-ordering
 * dependency is precisely the kind of failure this harness must not add — it
 * would present as a dead backend, and the last time the acceptance run measured
 * the wrong thing it cost the whole 64/96 figure.
 *
 * <p>This is not a sign-in bypass and must never become one. The full
 * authorization-code flow still runs, a client-id and secret are still required,
 * and a blank configuration still yields no providers at all (ADR 0003). The
 * only thing configuration can now change is which server is on the other end —
 * and {@link ProductionProfileTest} fails if production ever names one.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-auth-endpoints.db?foreign_keys=on",
            "bah.oauth.google.client-id=acceptance-id",
            "bah.oauth.google.client-secret=acceptance-secret",
            "bah.oauth.google.issuer-uri=http://localhost:9779",
            "bah.oauth.google.authorization-uri=http://127.0.0.1:9779/authorize",
            "bah.oauth.google.token-uri=http://127.0.0.1:9779/token",
            "bah.oauth.google.user-info-uri=http://127.0.0.1:9779/userinfo",
            "bah.oauth.google.jwk-set-uri=http://127.0.0.1:9779/jwks"
        })
class AuthOverriddenEndpointsTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConfiguredProviders providers;

    @Test
    void sendsTheVisitorToTheConfiguredIssuerRatherThanGoogle() throws Exception {
        // The assertion that matters. Without the override this redirects to
        // accounts.google.com, the browser leaves for a host the acceptance run
        // cannot drive, and the 40 session specs stay unrunnable.
        mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", Matchers.startsWith("http://127.0.0.1:9779/authorize")));
    }

    @Test
    void expectsTheIdTokenToBeIssuedByTheConfiguredIssuer() {
        // The claim that is not an address, and the one that cost an hour. Every
        // endpoint can point at the local issuer and sign-in still fails on the
        // very last step - "The ID Token contains invalid claims: {iss=...}" -
        // because the registration is still built from Spring's GOOGLE
        // definition and that carries accounts.google.com. Nothing connects to
        // this value; it is only compared.
        assertThat(registration("google").getProviderDetails().getIssuerUri())
                .isEqualTo("http://localhost:9779");
    }

    @Test
    void overridesEveryEndpointItWasGiven() {
        // All four, because a half-applied override is the bad case: the browser
        // would reach the local issuer, get a code, and the server would then
        // exchange it against the real Google and fail in a way that reads like a
        // credentials problem.
        ClientRegistration google = registration("google");

        assertThat(google.getProviderDetails().getAuthorizationUri())
                .isEqualTo("http://127.0.0.1:9779/authorize");
        assertThat(google.getProviderDetails().getTokenUri()).isEqualTo("http://127.0.0.1:9779/token");
        assertThat(google.getProviderDetails().getUserInfoEndpoint().getUri())
                .isEqualTo("http://127.0.0.1:9779/userinfo");
        assertThat(google.getProviderDetails().getJwkSetUri()).isEqualTo("http://127.0.0.1:9779/jwks");
    }

    @Test
    void keepsEverythingAboutTheProviderThatWasNotOverridden() {
        // Scopes, the brand name and the id all still come from Spring's own
        // GOOGLE definition. An override that quietly rebuilt the registration
        // from nothing would drop `openid` and the flow would stop being OIDC —
        // which fails later, at the id_token, and not here.
        ClientRegistration google = registration("google");

        assertThat(google.getScopes()).contains("openid", "email", "profile");
        assertThat(google.getClientName()).isEqualTo("Google");
        assertThat(google.getClientId()).isEqualTo("acceptance-id");
    }

    @Test
    void stillOffersExactlyOneProviderToTheSignInRow() throws Exception {
        // The point of reusing the `google` id: the frontend is unchanged, so the
        // specs that click "Google" keep working and this cannot drift into a
        // second button nobody meant to ship.
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value("google"))
                .andExpect(jsonPath("$[0].label").value("Google"));
    }

    private ClientRegistration registration(String id) {
        return providers.registrations().stream()
                .filter(candidate -> candidate.getRegistrationId().equals(id))
                .findFirst()
                .orElseThrow(() -> new AssertionError(id + " is configured but was not registered"));
    }
}
