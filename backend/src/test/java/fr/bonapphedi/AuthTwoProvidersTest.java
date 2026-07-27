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
 * Two providers configured at once — the case between {@link AuthDisabledTest}
 * (none) and {@link AuthApiTest} (one).
 *
 * <p>It was listed in TESTING.md as planned coverage and quietly never written,
 * which is worse than an admitted gap: a plan not carried out reads exactly like
 * one that was. Nothing asserted that the sign-in row would render two buttons,
 * that a second registration is built correctly, or that adding one leaves the
 * first alone — and "adding Facebook is a config change and a restart" (ADR 0003)
 * is a promise nobody had tested.
 *
 * <p>Credentials here are fake and that is enough. What cannot be tested without
 * Meta's app review is the round trip; what can be tested, and is, is everything
 * this side of the redirect.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-auth-two.db?foreign_keys=on",
            "bah.oauth.google.client-id=google-test-id",
            "bah.oauth.google.client-secret=google-test-secret",
            "bah.oauth.facebook.client-id=facebook-test-id",
            "bah.oauth.facebook.client-secret=facebook-test-secret"
        })
class AuthTwoProvidersTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConfiguredProviders providers;

    @Test
    void offersBothToTheSignInRow() throws Exception {
        // Order is not asserted. The map the credentials are bound from does not
        // promise one, and the row renders whatever arrives — pinning it here
        // would be a test of Spring's binding rather than of this application.
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].id", Matchers.containsInAnyOrder("google", "facebook")))
                // Brand names, straight from Spring's own provider definitions,
                // never invented here and never translated.
                .andExpect(jsonPath("$[*].label", Matchers.containsInAnyOrder("Google", "Facebook")));
    }

    @Test
    void givesEachProviderItsOwnAuthorizationEndpoint() throws Exception {
        // The frontend's signIn() navigates to exactly these paths, so both are
        // part of the contract the moment a second provider is switched on.
        mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", Matchers.startsWith("https://accounts.google.com/")));

        mvc.perform(get("/oauth2/authorization/facebook"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", Matchers.startsWith("https://www.facebook.com/")));
    }

    @Test
    void asksFacebookForTheFieldsItOtherwiseWithholds() {
        // The Graph API answers with whatever the URI names and nothing else, so
        // an endpoint that stopped naming these would produce a signed-in account
        // called `null` — on the provider nobody can test end to end, which is
        // the worst combination available.
        //
        // Worth knowing while reading this: Spring's own FACEBOOK default already
        // names id, name and email, so this passes with the override removed
        // entirely. It is here to catch a future default that stops doing so, not
        // to prove the override runs.
        assertThat(registration("facebook").getProviderDetails().getUserInfoEndpoint().getUri())
                .contains("fields=")
                .contains("id")
                .contains("name")
                .contains("email");
    }

    @Test
    void doesNotAskFacebookForAPictureItWillNotRead() {
        // ADR 7 stopped anything reading the provider's picture, because
        // rendering it made every reader of a comment thread call the provider.
        // This is the step before that: not asking. Requesting a field nothing
        // consumes would collect a URL to somebody's face on every sign-in and
        // drop it on the floor, which is the same disclosure with none of the
        // benefit — and it is exactly what this URI did until the two-provider
        // coverage above went looking.
        assertThat(registration("facebook").getProviderDetails().getUserInfoEndpoint().getUri())
                .doesNotContain("picture");
    }

    @Test
    void leavesTheFirstRegistrationAlone() {
        // A second provider is additive. This is the assertion that fails if the
        // builder is ever shared or mutated between the two rather than built per
        // provider — the sort of thing that works for whichever one is configured
        // alone and breaks only when both are.
        ClientRegistration google = registration("google");

        assertThat(google.getClientId()).isEqualTo("google-test-id");
        assertThat(google.getScopes()).contains("openid", "email", "profile");
        assertThat(google.getProviderDetails().getUserInfoEndpoint().getUri())
                .as("Google's user-info endpoint has been overwritten with Facebook's")
                .doesNotContain("facebook");

        assertThat(registration("facebook").getClientId()).isEqualTo("facebook-test-id");
    }

    @Test
    void keepsTheSiteAnonymousWithTwoProvidersAsWithOne() throws Exception {
        // Configuring providers must not start requiring one. The public site is
        // the whole point and it is read by people who will never sign in.
        mvc.perform(get("/api/recipes").param("locale", "fr")).andExpect(status().isOk());
        mvc.perform(get("/api/auth/session")).andExpect(status().isNoContent());
    }

    private ClientRegistration registration(String id) {
        return providers.registrations().stream()
                .filter(candidate -> candidate.getRegistrationId().equals(id))
                .findFirst()
                .orElseThrow(() -> new AssertionError(id + " is configured but was not registered"));
    }
}
