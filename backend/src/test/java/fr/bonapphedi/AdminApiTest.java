package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
 * Authoring, moderation and the dashboard behind them.
 *
 * <p>The rule with the most riding on it is the one about what a save carries
 * forward. A draft is what an author owns and it is deliberately less than a
 * recipe: no publication date, no featured rank, no hero copy, no scores. Saving
 * by spreading the draft over the row would quietly reset every one of those the
 * first time somebody fixed a typo — a recipe's rating silently returning to
 * zero is not something a test suite notices unless it is asked to.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-admin.db?foreign_keys=on")
class AdminApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void removeWhatEarlierTestsCreated() {
        jdbc.sql("DELETE FROM recipe WHERE key LIKE 'test-%'").update();

        // The seeded pending comment is approved by one test and deleted outright
        // by another, so restoring its status is not enough - it has to be put
        // back. Rewritten rather than repaired, so these tests do not depend on
        // the order they happen to run in.
        jdbc.sql("DELETE FROM comment WHERE display_name = 'Anonyme'").update();
        jdbc.sql(
                        """
                        INSERT INTO comment (recipe_id, user_id, display_name, body_markdown, body_html, status, created_at)
                        VALUES (2, NULL, 'Anonyme', 'premier !!!', '<p>premier !!!</p>', 'PENDING', '2026-07-25T12:00:00Z')
                        """)
                .update();
    }

    private static AppUserPrincipal admin() {
        return new AppUserPrincipal(new AppUser(1, "google", "g-1", "Hédi", "hedi@example.com", true));
    }

    private static AppUserPrincipal ordinary() {
        return new AppUserPrincipal(new AppUser(2, "google", "g-2", "Sam", "sam@example.com", false));
    }

    // --- who may be here at all -------------------------------------------

    @Test
    void keepsTheWholeAreaBehindTheAdminRole() throws Exception {
        // The Angular route guard decides what the UI offers; this decides what
        // the server permits, and only the second one is enforcement.
        for (String path : new String[] {
            "/api/admin/recipes", "/api/admin/recipes/babka", "/api/admin/comments/pending", "/api/admin/stats"
        }) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).with(oauth2Login().oauth2User(ordinary()))).andExpect(status().isForbidden());
        }
    }

    // --- the recipe table -------------------------------------------------

    @Test
    void listsEveryRecipeIncludingTheOnesThePublicCannotSee() throws Exception {
        // Six are seeded and one is a draft. The public list is five; this is the
        // screen where finding the unpublished one is the entire point.
        mvc.perform(get("/api/admin/recipes").param("locale", "fr").with(oauth2Login().oauth2User(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(6))
                .andExpect(jsonPath("$[?(@.key == 'babka')].status").value("PUBLISHED"))
                .andExpect(jsonPath("$[?(@.key == 'babka')].title").value("Babka au chocolat"))
                .andExpect(jsonPath("$[?(@.key == 'babka')].ratingCount").value(1))
                .andExpect(jsonPath("$[?(@.key == 'babka')].commentCount").value(2));
    }

    @Test
    void showsWhichLanguagesARecipeActuallyHas() throws Exception {
        // Gaps are the thing being looked for, so this cannot be inferred from
        // the row existing - a recipe row exists in both languages either way.
        mvc.perform(get("/api/admin/recipes").param("locale", "fr").with(oauth2Login().oauth2User(admin())))
                .andExpect(jsonPath("$[?(@.key == 'babka')].translated.length()").value(2));
    }

    @Test
    void namesAnUntranslatedRecipeInWhicheverLanguageItHas() throws Exception {
        // Falling back beats showing a blank cell or a bare key: the row still
        // has to be clickable, and the author still has to recognise it.
        mvc.perform(get("/api/admin/recipes").param("locale", "en").with(oauth2Login().oauth2User(admin())))
                .andExpect(jsonPath("$[*].title").value(org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.emptyString()))));
    }

    // --- the editor -------------------------------------------------------

    @Test
    void returnsADraftShapedForTheEditor() throws Exception {
        mvc.perform(get("/api/admin/recipes/babka").with(oauth2Login().oauth2User(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").value("babka"))
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.baseServings").value(2))
                .andExpect(jsonPath("$.youtubeVideoId").value("YE7VzlLtp-4"))
                // Both languages at once - the one place in the contract that
                // carries every locale, because an author is writing both.
                .andExpect(jsonPath("$.t.fr.title").value("Babka au chocolat"))
                .andExpect(jsonPath("$.t.en.title").value("Chocolate babka"))
                .andExpect(jsonPath("$.ingredients.length()").value(7))
                .andExpect(jsonPath("$.ingredients[0].t.fr.name").value("Farine"))
                .andExpect(jsonPath("$.steps.length()").value(5))
                .andExpect(jsonPath("$.tagKeys.length()").value(2));
    }

    @Test
    void answersNotFoundForAKeyThatDoesNotExist() throws Exception {
        mvc.perform(get("/api/admin/recipes/nexiste-pas").with(oauth2Login().oauth2User(admin())))
                .andExpect(status().isNotFound());
    }

    @Test
    void handsBackAnEmptyRecipeThatIsAlreadyShaped() throws Exception {
        // Both locales present, one blank ingredient, one blank step: the
        // editor's first job should be writing, not "add a row".
        mvc.perform(get("/api/admin/recipes/blank").with(oauth2Login().oauth2User(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.key").value(""))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.baseServings").value(2))
                .andExpect(jsonPath("$.ingredients.length()").value(1))
                .andExpect(jsonPath("$.steps.length()").value(1))
                .andExpect(jsonPath("$.t.fr.title").value(""))
                .andExpect(jsonPath("$.t.en.title").value(""));
    }

    /** Declared before {@code /recipes/{key}}, or "blank" is swallowed as a key. */
    @Test
    void doesNotMistakeBlankForARecipeKey() throws Exception {
        mvc.perform(get("/api/admin/recipes/blank").with(oauth2Login().oauth2User(admin())))
                .andExpect(jsonPath("$.key").value(""));
    }

    // --- saving -----------------------------------------------------------

    @Test
    void createsARecipeThatDidNotExist() throws Exception {
        mvc.perform(save(draft("test-new", "PUBLISHED", "Tarte aux pommes", "Apple tart")))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/admin/recipes/test-new").with(oauth2Login().oauth2User(admin())))
                .andExpect(jsonPath("$.t.fr.title").value("Tarte aux pommes"))
                .andExpect(jsonPath("$.ingredients.length()").value(1))
                .andExpect(jsonPath("$.steps.length()").value(1));

        // And it is a real recipe, not just an admin row: it reaches the site.
        mvc.perform(get("/api/recipes/tarte-aux-pommes").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Tarte aux pommes"));
    }

    @Test
    void replacesTheRecipeRatherThanAccumulatingRows() throws Exception {
        mvc.perform(save(draft("test-replace", "PUBLISHED", "Un", "One"))).andExpect(status().isNoContent());
        mvc.perform(save(draft("test-replace", "PUBLISHED", "Deux", "Two"))).andExpect(status().isNoContent());

        mvc.perform(get("/api/admin/recipes/test-replace").with(oauth2Login().oauth2User(admin())))
                .andExpect(jsonPath("$.t.fr.title").value("Deux"))
                // Ingredients and steps are replaced wholesale, which is what the
                // aggregate-root shape in ADR 0002 is for. Two saves must not
                // leave two copies of every ingredient.
                .andExpect(jsonPath("$.ingredients.length()").value(1))
                .andExpect(jsonPath("$.steps.length()").value(1));
    }

    @Test
    void carriesForwardEverythingTheAuthorDoesNotOwn() throws Exception {
        mvc.perform(save(draft("test-carry", "PUBLISHED", "Avant", "Before"))).andExpect(status().isNoContent());

        long id = recipeId("test-carry");

        // Things a recipe accumulates rather than something anyone types: a
        // publication date, a place in the carousel, hero copy written elsewhere,
        // and a score left by strangers.
        jdbc.sql("UPDATE recipe SET published_at = '2020-01-01T00:00:00Z', featured_rank = 9 WHERE id = ?")
                .param(id).update();
        jdbc.sql("UPDATE recipe_translation SET hero_kicker = 'Recette du moment', hero_excerpt = 'Longue version'"
                        + " WHERE recipe_id = ? AND locale = 'fr'")
                .param(id).update();
        jdbc.sql("INSERT INTO rating (recipe_id, visitor_id, stars, created_at) VALUES (?, 'someone', 5, '2026-01-01T00:00:00Z')")
                .param(id).update();

        mvc.perform(save(draft("test-carry", "PUBLISHED", "Après", "After"))).andExpect(status().isNoContent());

        assertThat(one("SELECT published_at FROM recipe WHERE id = " + id)).isEqualTo("2020-01-01T00:00:00Z");
        assertThat(one("SELECT featured_rank FROM recipe WHERE id = " + id)).isEqualTo("9");
        assertThat(one("SELECT hero_kicker FROM recipe_translation WHERE recipe_id = " + id + " AND locale = 'fr'"))
                .isEqualTo("Recette du moment");
        assertThat(one("SELECT count(*) FROM rating WHERE recipe_id = " + id)).isEqualTo("1");

        // The edit itself still landed.
        assertThat(one("SELECT title FROM recipe_translation WHERE recipe_id = " + id + " AND locale = 'fr'"))
                .isEqualTo("Après");
    }

    @Test
    void rendersAndDerivesWhatIsNotTyped() throws Exception {
        mvc.perform(save(draft("test-derived", "PUBLISHED", "Tarte", "Tart"))).andExpect(status().isNoContent());

        long id = recipeId("test-derived");

        // body_html is rendered on write, like every other body on the site, so
        // a saved recipe is not the one row the frontend has to render itself.
        assertThat(one("SELECT body_html FROM recipe_translation WHERE recipe_id = " + id + " AND locale = 'fr'"))
                .contains("<strong>beurre</strong>");

        // search_text is title + excerpt + tag labels + ingredient names, derived
        // exactly as V2 derives it - so searching an ingredient finds a recipe
        // saved through the editor and not only the seeded ones.
        assertThat(one("SELECT search_text FROM recipe_translation WHERE recipe_id = " + id + " AND locale = 'fr'"))
                .contains("Tarte")
                .contains("Farine");
    }

    @Test
    void refusesADraftWithNoKey() throws Exception {
        mvc.perform(save(draft("   ", "DRAFT", "Sans clé", "No key"))).andExpect(status().isBadRequest());
    }

    @Test
    void changesTheStatusOnItsOwn() throws Exception {
        mvc.perform(save(draft("test-status", "PUBLISHED", "Visible", "Visible"))).andExpect(status().isNoContent());

        mvc.perform(put("/api/admin/recipes/test-status/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ARCHIVED\"}")
                        .with(oauth2Login().oauth2User(admin()))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        // Archiving takes it off the public site, which is the whole point.
        mvc.perform(get("/api/recipes/visible").param("locale", "fr")).andExpect(status().isNotFound());
    }

    @Test
    void refusesAStatusThatIsNotOne() throws Exception {
        // CHECK would catch it as a 500 rather than as an answer.
        mvc.perform(put("/api/admin/recipes/babka/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DELETED\"}")
                        .with(oauth2Login().oauth2User(admin()))
                        .with(csrf()))
                .andExpect(status().isBadRequest());
    }

    // --- moderation -------------------------------------------------------

    @Test
    void queuesPendingCommentsOldestFirstWithEnoughToJudgeThem() throws Exception {
        mvc.perform(get("/api/admin/comments/pending")
                        .param("locale", "fr")
                        .with(oauth2Login().oauth2User(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].comment.bodyMarkdown").value("premier !!!"))
                // A queue is worked through oldest first, unlike the public
                // thread, and it needs to say which recipe it is about.
                .andExpect(jsonPath("$[0].recipeKey").value("shakshuka"))
                .andExpect(jsonPath("$[0].recipeTitle").value("Chakchouka"));
    }

    @Test
    void publishesAnApprovedComment() throws Exception {
        long id = pendingCommentId();

        mvc.perform(moderate(id, true)).andExpect(status().isNoContent());

        // Approving is what puts it in front of the public, so assert that and
        // not merely the column.
        mvc.perform(get("/api/recipes/chakchouka/comments").param("locale", "fr"))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].status").value("PUBLISHED"));
    }

    @Test
    void removesARejectedCommentEntirely() throws Exception {
        long id = pendingCommentId();

        mvc.perform(moderate(id, false)).andExpect(status().isNoContent());

        // Deleted rather than left in a REJECTED state. The schema permits that
        // status, but no screen would ever show one, and keeping a stranger's
        // rejected remark on file is a retention question nobody needs to answer.
        assertThat(one("SELECT count(*) FROM comment WHERE id = " + id)).isEqualTo("0");
    }

    @Test
    void refusesToModerateSomethingThatIsGone() throws Exception {
        mvc.perform(moderate(999_999, true)).andExpect(status().isNotFound());
    }

    // --- the dashboard ----------------------------------------------------

    @Test
    void countsTheSiteUpForTheDashboard() throws Exception {
        mvc.perform(get("/api/admin/stats").param("locale", "fr").with(oauth2Login().oauth2User(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipes.PUBLISHED").value(5))
                .andExpect(jsonPath("$.recipes.DRAFT").value(1))
                .andExpect(jsonPath("$.recipes.ARCHIVED").value(0))
                .andExpect(jsonPath("$.comments.total").value(3))
                .andExpect(jsonPath("$.comments.pending").value(1))
                .andExpect(jsonPath("$.ratings.count").value(1))
                .andExpect(jsonPath("$.ratings.average").value(4.0));
    }

    @Test
    void ranksOnlyRecipesThatHaveActuallyBeenRated() throws Exception {
        // "No score yet" and "scored badly" are different facts, and a table that
        // ties them at zero is telling the author something untrue.
        mvc.perform(get("/api/admin/stats").param("locale", "fr").with(oauth2Login().oauth2User(admin())))
                .andExpect(jsonPath("$.top.length()").value(1))
                .andExpect(jsonPath("$.top[0].key").value("babka"))
                .andExpect(jsonPath("$.top[0].ratingAverage").value(4.0))
                .andExpect(jsonPath("$.top[0].commentCount").value(2));
    }

    // --- helpers ----------------------------------------------------------

    private MockHttpServletRequestBuilder save(String json) {
        return put("/api/admin/recipes")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
                .with(oauth2Login().oauth2User(admin()))
                .with(csrf());
    }

    private MockHttpServletRequestBuilder moderate(long id, boolean approve) {
        return post("/api/admin/comments/{id}/moderate", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":" + approve + "}")
                .with(oauth2Login().oauth2User(admin()))
                .with(csrf());
    }

    /** A complete draft, since a partial one is not something the editor sends. */
    private static String draft(String key, String status, String frTitle, String enTitle) {
        String frSlug = frTitle.trim().toLowerCase().replace(' ', '-').replace("é", "e").replace("è", "e");
        String enSlug = enTitle.trim().toLowerCase().replace(' ', '-');

        return """
                {
                  "key": "%s",
                  "status": "%s",
                  "tagKeys": ["dessert"],
                  "prepMinutes": 20,
                  "cookMinutes": 40,
                  "difficulty": 2,
                  "baseServings": 4,
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
                    "fr": {"slug": "%s", "title": "%s", "excerpt": "Un dessert",
                           "bodyMarkdown": "Avec du **beurre**."},
                    "en": {"slug": "%s", "title": "%s", "excerpt": "A dessert",
                           "bodyMarkdown": "With **butter**."}
                  }
                }
                """
                .formatted(key, status, frSlug, frTitle, enSlug, enTitle);
    }

    private long recipeId(String key) {
        return jdbc.sql("SELECT id FROM recipe WHERE key = ?").param(key).query(Long.class).single();
    }

    private long pendingCommentId() {
        return jdbc.sql("SELECT id FROM comment WHERE status = 'PENDING'").query(Long.class).single();
    }

    /**
     * Read back as text so one helper covers numbers, strings and counts alike.
     * SQLite's typing is dynamic, so the driver hands back a string for any of
     * them - which is exactly the property being leaned on here.
     */
    private String one(String sql) {
        return jdbc.sql(sql).query(String.class).single();
    }
}
