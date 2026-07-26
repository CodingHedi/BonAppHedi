package fr.bonapphedi;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * No provider configured at all, which is a supported state and not a broken one
 * (ADR 0003).
 *
 * <p>It is also the state a fresh checkout starts in and the one a deployment
 * lands in when a secret goes missing, so the app has to boot, the site has to
 * stay readable, and the sign-in row has to be told there is nothing to offer.
 * The alternative - a context that dies at startup because a client-id is blank
 * - is precisely what {@code bah.oauth.*} exists to avoid.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-auth-off.db?foreign_keys=on",
            // Blank rather than absent: this is what an unfilled placeholder or
            // an unset environment variable actually looks like, and Spring's own
            // registration properties reject it at startup.
            "bah.oauth.google.client-id=",
            "bah.oauth.google.client-secret="
        })
class AuthDisabledTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void bootsAndOffersNoProviders() throws Exception {
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void hasNoAuthorizationEndpointToRedirectTo() throws Exception {
        // oauth2Login is left unwired when nothing is registered, because Spring
        // throws on an empty registration repository. The path simply does not
        // exist, which beats a 500 from a filter with nothing to resolve.
        mvc.perform(get("/oauth2/authorization/google")).andExpect(status().isNotFound());
    }

    @Test
    void keepsTheWholePublicSiteWorking() throws Exception {
        mvc.perform(get("/api/recipes").param("locale", "fr")).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr")).andExpect(status().isOk());
        mvc.perform(get("/api/auth/session")).andExpect(status().isNoContent());
    }
}
