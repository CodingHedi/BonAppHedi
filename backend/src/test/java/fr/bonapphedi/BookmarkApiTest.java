package fr.bonapphedi;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Saved recipes, and specifically the merge (ADR 16).
 *
 * <p>The sync between a browser's list and an account's is a <b>union</b>, and
 * that one word is what makes the whole design affordable: bookmarks are
 * additive and idempotent, so there is no conflict to resolve, no loser to pick,
 * and a merge that fails halfway is simply retried on the next load. Eventual
 * consistency falls out of the data shape rather than being engineered.
 *
 * <p>Which means the tests worth writing are the ones that would catch it
 * quietly becoming a <em>replacement</em>. That is the plausible mistake — it is
 * the shape most sync code has — and its symptom is the worst kind: signing in
 * on a second device, where the local list is empty, would silently delete
 * everything the reader had saved. {@link #mergingAnEmptyLocalListDeletesNothing}
 * is that test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-bookmarks.db?foreign_keys=on")
class BookmarkApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void oneAccountAndNoBookmarks() {
        jdbc.sql("DELETE FROM bookmark").update();
        jdbc.sql("DELETE FROM app_user").update();
        jdbc.sql(
                        """
                        INSERT INTO app_user (id, provider, provider_user_id, display_name, email, is_admin, created_at)
                        VALUES (1, 'google', 'g-1', 'Camille', 'camille@example.com', 0, '2026-07-01T00:00:00Z')
                        """)
                .update();
    }

    private static AppUserPrincipal camille() {
        return new AppUserPrincipal(new AppUser(1L, "google", "g-1", "Camille", "camille@example.com", false));
    }

    private static MockHttpServletRequestBuilder merge(String json) {
        return put("/api/auth/bookmarks")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
                .with(oauth2Login().oauth2User(camille()))
                .with(csrf());
    }

    @Test
    void savingAndUnsavingIsIdempotent() throws Exception {
        // Pressed twice by a reader on a bad connection, or retried by a client
        // that never saw the first answer. Both must leave one bookmark, which
        // is the schema's UNIQUE pair doing the work rather than this code.
        mvc.perform(bookmark("babka-au-chocolat", true)).andExpect(status().isNoContent());
        mvc.perform(bookmark("babka-au-chocolat", true)).andExpect(status().isNoContent());

        mvc.perform(get("/api/auth/bookmarks").with(oauth2Login().oauth2User(camille())))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0]").value("babka"));

        mvc.perform(bookmark("babka-au-chocolat", false)).andExpect(status().isNoContent());
        mvc.perform(bookmark("babka-au-chocolat", false)).andExpect(status().isNoContent());

        mvc.perform(get("/api/auth/bookmarks").with(oauth2Login().oauth2User(camille())))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void mergingAddsTheBrowsersListToTheAccounts() throws Exception {
        mvc.perform(bookmark("babka-au-chocolat", true)).andExpect(status().isNoContent());

        // What signing in sends: whatever this browser was holding.
        mvc.perform(merge("{\"keys\":[\"shakshuka\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    /**
     * The one that matters.
     *
     * <p>A reader signs in on a device that has saved nothing. If the merge were
     * a replacement — the shape most sync code takes — this is the request that
     * would empty their account, and they would find out later by looking for a
     * recipe that is no longer there.
     */
    @Test
    void mergingAnEmptyLocalListDeletesNothing() throws Exception {
        mvc.perform(bookmark("babka-au-chocolat", true)).andExpect(status().isNoContent());

        mvc.perform(merge("{\"keys\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0]").value("babka"));
    }

    @Test
    void mergingTwiceChangesNothing() throws Exception {
        mvc.perform(merge("{\"keys\":[\"babka\",\"shakshuka\"]}"))
                .andExpect(jsonPath("$.length()").value(2));

        // Criterion 3 of ADR 16: running the merge twice changes nothing, which
        // is what lets a failed one be retried without thinking about it.
        mvc.perform(merge("{\"keys\":[\"babka\",\"shakshuka\"]}"))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void anUnknownKeyIsIgnoredRatherThanRefused() throws Exception {
        // A stored list can outlive a recipe. Answering 400 would strand a
        // reader whose other bookmarks are all still there.
        mvc.perform(merge("{\"keys\":[\"babka\",\"deleted-long-ago\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0]").value("babka"));
    }

    @Test
    void theListSpeaksKeysAndNotSlugs() throws Exception {
        // The whole point of the field: a bookmark made on the French page is
        // the same string the English page will look for.
        mvc.perform(bookmark("babka-au-chocolat", true)).andExpect(status().isNoContent());

        mvc.perform(get("/api/auth/bookmarks").with(oauth2Login().oauth2User(camille())))
                .andExpect(jsonPath("$[0]").value("babka"));
    }

    private static MockHttpServletRequestBuilder bookmark(String slug, boolean on) {
        return put("/api/recipes/{slug}/bookmark", slug)
                .param("locale", "fr")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"bookmarked\":" + on + "}")
                .with(oauth2Login().oauth2User(camille()))
                .with(csrf());
    }
}
