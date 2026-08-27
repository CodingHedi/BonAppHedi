package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.api.RecipeChanged;
import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Per-recipe metadata in the served HTML, without executing JavaScript (ADR 4).
 *
 * <p>This is the entire claim ADR 4 made in place of SSR: a crawler or a link
 * unfurler that never runs JS still gets the title, the description, the
 * photograph and {@code schema.org/Recipe}. Until now they got the empty shell,
 * so a recipe pasted into a chat was an unadorned URL.
 *
 * <p>Asserted against the raw response body rather than a parsed DOM on
 * purpose: what matters is what arrives on the wire, which is exactly what a
 * unfurler reads.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-metadata.db?foreign_keys=on")
class RecipeMetadataTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ApplicationEventPublisher events;

    /**
     * One test withdraws a recipe, so the seeded status is put back rather than
     * assumed — otherwise the second run of the suite starts where the first one
     * stopped, and the failure lands on whichever test happens to read that
     * recipe first.
     *
     * <p>The row alone is not enough. The metadata cache outlives a write that
     * goes round the admin endpoint, so restoring by SQL and not saying so would
     * leave the cache holding the withdrawn page and fail the next test for a
     * reason that has nothing to do with it.
     */
    @BeforeEach
    void putTheWithdrawnRecipeBack() {
        jdbc.sql("UPDATE recipe SET status = 'PUBLISHED' WHERE key = 'shakshuka'")
                .update();
        jdbc.sql("DELETE FROM recipe WHERE key LIKE 'test-%'").update();
        events.publishEvent(new RecipeChanged());
    }

    private static AppUserPrincipal admin() {
        return new AppUserPrincipal(new AppUser(1, "google", "g-1", "Hédi", "hedi@example.com", true));
    }

    @Test
    void putsTheRecipeInTheTitleAndDescription() throws Exception {
        mvc.perform(get("/fr/recettes/babka-au-chocolat"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("<title>Babka au chocolat")))
                .andExpect(content().string(containsString("Une brioche tressée au marbrage")));
    }

    @Test
    void servesExactlyOneDescriptionAndItIsTheRecipes() throws Exception {
        // The shell ships its own site-level description, so splicing the
        // recipe's in without taking that one out leaves two — and the generic
        // one first, which is the one a crawler reads. Every recipe page then
        // describes itself as "un carnet de recettes tenu à la main".
        //
        // containsString cannot see this: it passes on a page carrying both,
        // which is exactly how it shipped. The count is the assertion.
        String html =
                mvc.perform(get("/fr/recettes/babka-au-chocolat"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        assertThat(countOf(html, "<meta name=\"description\""))
                .as("one description, or the first one wins and it is the wrong one")
                .isEqualTo(1);
        assertThat(html).contains("Une brioche tressée au marbrage");
        assertThat(html).doesNotContain("Un carnet de recettes tenu à la main");
    }

    /** Deliberately not a regex: the markup is fixed and a literal cannot drift. */
    private static int countOf(String haystack, String needle) {
        int count = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) count++;
        return count;
    }

    @Test
    void carriesOpenGraphIncludingThePhotograph() throws Exception {
        // og:image is why ADR 8 sequenced this second: a card with no picture is
        // most of the reason link previews are worth having.
        mvc.perform(get("/fr/recettes/babka-au-chocolat"))
                .andExpect(content().string(containsString("property=\"og:title\"")))
                .andExpect(content().string(containsString("property=\"og:description\"")))
                .andExpect(content().string(containsString("property=\"og:type\" content=\"article\"")))
                .andExpect(content().string(containsString("/media/babka-au-chocolat.jpg")))
                .andExpect(content().string(containsString("name=\"twitter:card\"")));
    }

    @Test
    void pointsAtItselfAndAtItsTranslation() throws Exception {
        // Canonical stops the two locales competing as duplicates; hreflang is
        // how the other language is offered rather than guessed.
        mvc.perform(get("/fr/recettes/babka-au-chocolat"))
                .andExpect(content().string(containsString(
                        "rel=\"canonical\" href=\"https://bonapphedi.fr/fr/recettes/babka-au-chocolat\"")))
                .andExpect(content().string(containsString("hreflang=\"en\"")))
                .andExpect(content().string(containsString("/en/recipes/chocolate-babka")));
    }

    @Test
    void emitsRecipeJsonLd() throws Exception {
        mvc.perform(get("/fr/recettes/babka-au-chocolat"))
                .andExpect(content().string(containsString("application/ld+json")))
                .andExpect(content().string(containsString("\"@type\":\"Recipe\"")))
                .andExpect(content().string(containsString("\"recipeIngredient\"")))
                .andExpect(content().string(containsString("\"recipeInstructions\"")));
    }

    @Test
    void servesTheEnglishRecipeInEnglish() throws Exception {
        mvc.perform(get("/en/recipes/chocolate-babka"))
                .andExpect(content().string(containsString("<title>Chocolate babka")))
                .andExpect(content().string(containsString("content=\"en\"")));
    }

    @Test
    void leavesAnUnknownSlugToTheAngularRouter() throws Exception {
        // Still 200 and still the shell: the SPA renders its own 404 in the
        // visitor's language. What must not happen is a title claiming a recipe
        // that does not exist.
        mvc.perform(get("/fr/recettes/pas-une-recette"))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("application/ld+json"))));
    }

    @Test
    void anEditReachesTheServedHtml() throws Exception {
        // The cache is keyed per (slug, locale) and the shell never changes, so
        // without invalidation a stale title outlives the edit until the next
        // restart — invisible from the admin, which reads the API and never the
        // served HTML.
        //
        // Withdrawing rather than renaming, because it exercises the harder
        // half: the metadata has to *stop* being emitted, and a cache that only
        // refreshed on content would happily keep serving a withdrawn recipe to
        // exactly the crawlers this layer feeds.
        mvc.perform(get("/fr/recettes/chakchouka"))
                .andExpect(content().string(containsString("application/ld+json")));

        setStatus("shakshuka", "DRAFT");

        mvc.perform(get("/fr/recettes/chakchouka"))
                .andExpect(content().string(not(containsString("application/ld+json"))));

        // And back, because a cache that empties once is not the same as one
        // that tracks. Publishing has to reach the served HTML too - a recipe
        // that went live and stayed invisible to crawlers is the failure this
        // layer exists to prevent.
        setStatus("shakshuka", "PUBLISHED");

        mvc.perform(get("/fr/recettes/chakchouka"))
                .andExpect(content().string(containsString("application/ld+json")));
    }

    @Test
    void aNewRecipeReachesAnAddressSomebodyHasAlreadyVisited() throws Exception {
        // The save path rather than the status one, and a URL that was read
        // before the recipe existed. An unknown slug is answered with the plain
        // shell and that answer is cached like any other, so without
        // invalidation here a newly published recipe stays invisible at exactly
        // the address that was shared before it went up - and stays that way
        // until the next restart.
        mvc.perform(get("/fr/recettes/tarte-de-test"))
                .andExpect(content().string(not(containsString("application/ld+json"))));

        mvc.perform(put("/api/admin/recipes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(draft())
                        .with(oauth2Login().oauth2User(admin()))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get("/fr/recettes/tarte-de-test"))
                .andExpect(content().string(containsString("<title>Tarte de test")))
                .andExpect(content().string(containsString("application/ld+json")));
    }

    private static String draft() {
        return """
                {
                  "key": "test-metadata",
                  "status": "PUBLISHED",
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
                    "fr": {"slug": "tarte-de-test", "title": "Tarte de test", "excerpt": "Un dessert",
                           "bodyMarkdown": "Avec du **beurre**."},
                    "en": {"slug": "test-tart", "title": "Test tart", "excerpt": "A dessert",
                           "bodyMarkdown": "With **butter**."}
                  }
                }
                """;
    }

    private void setStatus(String key, String status) throws Exception {
        mvc.perform(put("/api/admin/recipes/" + key + "/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"" + status + "\"}")
                        .with(oauth2Login().oauth2User(admin()))
                        .with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void aDraftGetsNoMetadataEither() throws Exception {
        // Unpublished has to mean unpublished here too. Emitting a title and a
        // JSON-LD block for a draft would publish it to exactly the audience
        // this layer exists to serve.
        mvc.perform(get("/fr/recettes/jus-grenade-orange"))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("application/ld+json"))));
    }
}
