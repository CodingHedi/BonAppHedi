package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
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

/**
 * {@code recipe.key} is published, so it can never be renamed.
 *
 * <p>ADR 16 stores bookmarks and share links as keys, on the grounds that a key
 * cannot change. That is true today, and it is true for a reason no line of code
 * states out loud: {@code AdminDao.save} resolves {@code recipeIdFor(key)} and
 * inserts when it finds nothing, and {@code updateRecipe} writes status, prep,
 * cook, difficulty, servings and video — with no key among them. The key is what
 * the upsert matches on, not a field it writes.
 *
 * <p><b>What this asserts, and what it deliberately does not.</b> The first
 * draft of this class saved a recipe under a <em>different</em> key and checked
 * the original was untouched — which sounds like the right test and cannot
 * fail. Under upsert-by-key a different key never finds the original in the
 * first place, so the assertion holds however {@code updateRecipe} is written,
 * including with {@code key = :key} added to it. It was a test asserting
 * something structurally true, in the same family as the {@code isNotFound()}
 * that passes against an application with no controller.
 *
 * <p>So it asserts the property a bookmark actually depends on: **an ordinary
 * save leaves the key and the row id exactly as they were**, and the public API
 * still answers under that key afterwards. That does fail if a save ever starts
 * writing the key, whatever route it takes to doing so.
 *
 * <p>Confirmed by making {@code updateRecipe} write {@code key = :key || '-x'}
 * once. It goes red on the first assertion.
 *
 * <p>The second test is about something else and says so: saving under an
 * unused key silently creates a second recipe rather than refusing. That is a
 * real defect in the editor, it predates this work, and it is recorded in
 * {@code Docs/backlog.md}. It is pinned here because the behaviour is load
 * bearing in the opposite direction — it is *why* a key cannot be renamed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-key-immutable.db?foreign_keys=on",
            "bah.admin.emails=boss@example.com"
        })
class AdminKeyIsImmutableTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    private static AppUserPrincipal admin() {
        return new AppUserPrincipal(new AppUser(1L, "google", "g-1", "Boss", "boss@example.com", true));
    }

    /**
     * The seed is restored before each test, because both of these write and
     * the SQLite file outlives the run. Without it the second test inserts on
     * its first run and updates on every one after, so it passes once and then
     * measures nothing.
     */
    @BeforeEach
    void removeAnythingThisClassCreated() {
        jdbc.sql("DELETE FROM recipe WHERE key NOT IN "
                        + "('babka', 'shakshuka', 'sourdough', 'basque-cheesecake', 'beef-tagine', 'draft-only')")
                .update();
    }

    @Test
    void anOrdinarySaveLeavesTheKeyAndTheRowAlone() throws Exception {
        long before = recipeId("babka");

        // Exactly what the editor sends when somebody fixes a typo: the whole
        // draft back under the key it was loaded with, published as it was and
        // keeping its slugs. Demoting it or renaming its slugs would 404 the
        // assertion below for a reason that has nothing to do with the key.
        mvc.perform(save(draft("babka", "PUBLISHED", "babka-au-chocolat", "chocolate-babka")))
                .andExpect(status().isNoContent());

        // Same key, same row. A bookmark is a key and the bookmark table points
        // at the id, so either changing is a dangling reference.
        assertThat(recipeId("babka")).isEqualTo(before);

        // And the public API still answers under it, which is what a reader
        // would actually notice.
        mvc.perform(get("/api/recipes/{slug}", "babka-au-chocolat").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").value("babka"));
    }

    @Test
    void savingUnderAnUnusedKeyCreatesASecondRecipeAndLeavesTheFirst() throws Exception {
        long before = recipeId("babka");
        int recipesBefore = countRecipes();

        mvc.perform(save(draft("babka-renamed", "DRAFT", "babka-renommee", "babka-renamed")))
                .andExpect(status().isNoContent());

        // Pinned, not endorsed. This is the duplicate defect in Docs/backlog.md
        // — and it is also the mechanism that makes a key unrenameable, so the
        // day it is fixed, whatever replaces it has to keep the second half of
        // this assertion true.
        assertThat(countRecipes()).isEqualTo(recipesBefore + 1);
        assertThat(recipeId("babka")).isEqualTo(before);
    }

    private long recipeId(String key) {
        return jdbc.sql("SELECT id FROM recipe WHERE key = ?").param(key).query(Long.class).single();
    }

    private int countRecipes() {
        return jdbc.sql("SELECT count(*) FROM recipe").query(Integer.class).single();
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder save(String json) {
        return put("/api/admin/recipes")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
                .with(oauth2Login().oauth2User(admin()))
                .with(csrf());
    }

    /** A complete draft, since a partial one is not something the editor sends. */
    private static String draft(String key, String status, String frSlug, String enSlug) {
        return """
                {
                  "key": "%s",
                  "status": "%s",
                  "tagKeys": ["dessert"],
                  "prepMinutes": 15,
                  "cookMinutes": 45,
                  "difficulty": 1,
                  "baseServings": 2,
                  "youtubeVideoId": null,
                  "ingredients": [
                    {"baseQuantity": 250, "unit": "g", "scalable": true,
                     "t": {"fr": {"name": "Farine", "note": null}, "en": {"name": "Flour", "note": null}}}
                  ],
                  "steps": [
                    {"durationMinutes": 10, "videoOffsetSeconds": null,
                     "t": {"fr": {"body": "Mélanger."}, "en": {"body": "Mix."}}}
                  ],
                  "t": {
                    "fr": {"slug": "%s", "title": "Babka au chocolat", "excerpt": "Un dessert",
                           "bodyMarkdown": "Avec du **beurre**."},
                    "en": {"slug": "%s", "title": "Chocolate babka", "excerpt": "A dessert",
                           "bodyMarkdown": "With **butter**."}
                  }
                }
                """
                .formatted(key, status, frSlug, enSlug);
    }
}
