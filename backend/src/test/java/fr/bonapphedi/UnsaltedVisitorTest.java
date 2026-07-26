package fr.bonapphedi;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A fresh checkout, with no salt configured.
 *
 * <p>Which is what everyone starts with: {@code bah.security.fingerprint-salt}
 * defaults to blank, exactly as the OAuth credentials do, so that the app runs
 * from a clone with nothing filled in. Every other social test sets a salt,
 * which meant the default the app actually ships with was the one configuration
 * nothing exercised - and it made every rating and every reaction answer 500,
 * because an empty HMAC key is rejected outright rather than treated as no key.
 *
 * <p>Found by running the real frontend against the real backend, and not by any
 * of the hundred and twenty tests that came before it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-unsalted.db?foreign_keys=on",
            // Blank, not absent: this is what an unset BAH_FINGERPRINT_SALT
            // resolves to through the placeholder in application.yml.
            "bah.security.fingerprint-salt="
        })
class UnsaltedVisitorTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void resetWrites() {
        jdbc.sql("DELETE FROM rating WHERE visitor_id <> 'seed-visitor'").update();
        jdbc.sql("DELETE FROM reaction").update();
        jdbc.sql("DELETE FROM visitor").update();
    }

    @Test
    void ratesPerfectlyWellWithNoSaltConfigured() throws Exception {
        mvc.perform(put("/api/recipes/babka-au-chocolat/rating")
                        .param("locale", "fr")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stars\":5}")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.yourRating").value(5))
                .andExpect(cookie().exists("bah-visitor"));
    }

    @Test
    void reactsPerfectlyWellWithNoSaltConfigured() throws Exception {
        mvc.perform(put("/api/recipes/babka-au-chocolat/reaction")
                        .param("locale", "fr")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reacted\":true}")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reacted").value(true));
    }

    @Test
    void stillRefusesTheThirdCookieFromOneFingerprint() throws Exception {
        // The salt makes a stored fingerprint useless to whoever ends up with the
        // database. It is not what makes the fingerprint work, so an instance
        // with none configured must still be able to tell two visitors apart.
        rateAnonymously().andExpect(status().isOk());
        rateAnonymously().andExpect(status().isOk());
        rateAnonymously().andExpect(status().isTooManyRequests());
    }

    private org.springframework.test.web.servlet.ResultActions rateAnonymously() throws Exception {
        return mvc.perform(put("/api/recipes/babka-au-chocolat/rating")
                .param("locale", "fr")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"stars\":4}")
                .with(csrf()));
    }
}
