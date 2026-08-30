package fr.bonapphedi;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The ceiling on writes (ADR 17, stage 5).
 *
 * <p>Set to 3 here rather than the shipped 300, because the assertion is about
 * the behaviour and not about the number — a test that had to make three
 * hundred requests to prove a limit works would take longer than the rest of
 * this suite and would be measuring the machine.
 *
 * <p>The interesting assertions are the negative ones. A ceiling that also
 * refuses reads would quietly stop crawlers taking every page, on a site whose
 * whole purpose is being found by recipe name — and nothing would fail, the
 * pages would simply stop being indexed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-ceiling.db?foreign_keys=on",
            "bah.security.fingerprint-salt=ceiling-salt",
            "bah.security.max-writes-per-minute=3"
        })
class WriteCeilingTest {

    @Autowired
    private MockMvc mvc;

    private static final String BABKA = "babka-au-chocolat";

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder rate(int stars) {
        return put("/api/recipes/{slug}/rating", BABKA)
                .param("locale", "fr")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"stars\":" + stars + "}")
                .with(csrf());
    }

    @Test
    void writesAreRefusedOnceTheCeilingIsPassed() throws Exception {
        // Three are allowed, because that is what the ceiling is set to here.
        for (int i = 0; i < 3; i++) {
            mvc.perform(rate(4)).andExpect(status().isOk());
        }

        // The fourth is refused, and told when to come back rather than simply
        // rejected - this is a temporary refusal of a request that looks
        // perfectly legitimate.
        mvc.perform(rate(4))
                .andExpect(status().isTooManyRequests())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Retry-After", "60"));
    }

    @Test
    void readsAreNeverLimited() throws Exception {
        // Well past the ceiling. A limit on GET would be a limit on being found:
        // a crawler is supposed to take every page, and nothing would fail - the
        // pages would simply stop being indexed.
        for (int i = 0; i < 12; i++) {
            mvc.perform(get("/api/recipes").param("locale", "fr")).andExpect(status().isOk());
        }
        mvc.perform(get("/api/recipes/{slug}", BABKA).param("locale", "fr")).andExpect(status().isOk());
    }
}
