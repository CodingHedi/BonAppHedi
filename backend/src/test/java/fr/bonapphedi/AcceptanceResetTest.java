package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Putting the database back to the seeded state, for the acceptance run only.
 *
 * <p>Once the specs needing a session could finally run, the acceptance number
 * stopped being limited by sign-in and started being limited by the specs
 * standing on each other: three admin specs pass and, in passing, publish a
 * draft, rename the babka and create a recipe, so every later spec asserting the
 * seeded catalogue fails. All 34 remaining failures were that (ADR 0001, second
 * amendment). The mocks never had the problem because their store resets on
 * every page load; a real database does not.
 *
 * <p>So the run gets the same thing deliberately, between spec files.
 *
 * <p>Nothing here hard-codes how many recipes the seed has. The first version
 * did, guessed five because {@code SeedDataTest} says five are published, and
 * failed against four - one of the five has no French translation, so the
 * locale-filtered endpoint does not return it. A test that has to be told the
 * answer would need editing every time the seed grows, and would be asserting
 * the seed rather than the reset. It reads the count, breaks it, and checks it
 * comes back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("acceptance")
@TestPropertySource(
        properties = {
            // Never the real database. Without this the acceptance profile
            // inherits ./data/bonapphedi.db from application.yml and this test
            // would clean the dev loop's own data.
            "spring.datasource.url=jdbc:sqlite:file:./target/test-acceptance-reset.db?foreign_keys=on"
        })
class AcceptanceResetTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void rebuildsRatherThanRelyingOnFlywayClean() throws Exception {
        // The assertion that would have caught the first implementation. It used
        // flyway.clean(), which on SQLite drops nothing and throws nothing: the
        // history survived, migrate() saw every version applied and did nothing,
        // and the reset was a 204 that changed the database not at all.
        //
        // Checked through the schema history rather than through the data,
        // because that is what tells a rebuild apart from a no-op: a genuine
        // reset writes new rows here, and the seed being present afterwards
        // proves nothing when it was already present before.
        reset();
        String firstInstall = jdbc.queryForObject(
                "SELECT max(installed_on) FROM flyway_schema_history", String.class);

        reset();
        String secondInstall = jdbc.queryForObject(
                "SELECT max(installed_on) FROM flyway_schema_history", String.class);

        assertThat(secondInstall)
                .as("the schema history was not rewritten, so nothing was actually rebuilt")
                .isNotEqualTo(firstInstall);
    }

    @Test
    void putsTheCatalogueBackAfterSomethingHasChangedIt() throws Exception {
        reset();
        int seeded = publishedRecipes();
        assertThat(seeded).as("the seed should offer something to count").isPositive();

        // Emptied rather than added to, and that is worth a word. The obvious
        // move - publish the seeded draft, exactly as the admin spec does - does
        // not change this number at all: the draft has no French translation, so
        // the locale-filtered endpoint never returned it and never will. A test
        // whose mutation quietly does nothing passes for the wrong reason, which
        // is why the assertion below exists rather than being assumed.
        jdbc.update("DELETE FROM recipe");
        assertThat(publishedRecipes())
                .as("the mutation this test depends on did not actually change anything")
                .isNotEqualTo(seeded);

        reset();

        assertThat(publishedRecipes()).isEqualTo(seeded);
    }

    @Test
    void takesCommentsAndRatingsWithIt() throws Exception {
        // Not only the catalogue. The comment and reaction counts drift too -
        // `Received: "5 commentaires"` - and a reset that restored recipes while
        // leaving the thread behind would fix the visible half and leave the
        // confusing one.
        reset();
        int comments = count("SELECT count(*) FROM comment");

        jdbc.update(
                "INSERT INTO comment (recipe_id, display_name, body_markdown, body_html, status, created_at) "
                        + "SELECT id, 'Someone', 'x', '<p>x</p>', 'PUBLISHED', '2026-01-01T00:00:00Z' "
                        + "FROM recipe LIMIT 1");
        assertThat(count("SELECT count(*) FROM comment")).isGreaterThan(comments);

        reset();

        assertThat(count("SELECT count(*) FROM comment")).isEqualTo(comments);
    }

    @Test
    void isRepeatable() throws Exception {
        // Called between every spec file, so the second reset must behave like
        // the first. A clean that only works against an already-migrated schema
        // would pass once and fail on the one after it.
        reset();
        int seeded = publishedRecipes();

        for (int attempt = 2; attempt <= 4; attempt++) {
            reset();
            assertThat(publishedRecipes())
                    .as("reset number %d did not leave the same state as the first", attempt)
                    .isEqualTo(seeded);
        }
    }

    private void reset() throws Exception {
        mvc.perform(post("/api/test/reset").with(csrf())).andExpect(status().isNoContent());
    }

    private int publishedRecipes() throws Exception {
        String body = mvc.perform(get("/api/recipes").param("locale", "fr"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        // `items`, not the root. The list endpoint answers
        // {"items":[...],"page":..,"size":..,"total":..} and the first version of
        // this helper returned the root's size - which is 4, the number of
        // fields, whatever the database holds. It reported a steady "4 recipes"
        // through an empty table and through a full one, and sent an hour of
        // debugging after the reset instead of the assertion.
        JsonNode page = JSON.readTree(body);
        return page.path("items").size();
    }

    private int count(String sql) {
        Integer value = jdbc.queryForObject(sql, Integer.class);
        return value == null ? 0 : value;
    }
}
