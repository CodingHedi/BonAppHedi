package fr.bonapphedi;

import static org.hamcrest.Matchers.nullValue;
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
 * The read API, asserted against the shape {@code core/api/models.ts} declares.
 *
 * <p>The mock services are the contract (ADR 0001) and the backend has to
 * satisfy them field for field, so these tests check JSON keys and not just
 * status codes. A response that is right in spirit and spells a field
 * {@code prep_minutes} passes every status assertion and breaks the entire
 * frontend.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-api.db?foreign_keys=on")
class RecipeApiTest {

    @Autowired
    private MockMvc mvc;

    // --- list -------------------------------------------------------------

    @Test
    void listsOnlyPublishedRecipes() throws Exception {
        // Six are seeded, one is a draft. The public list is five.
        mvc.perform(get("/api/recipes").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.total").value(5));
    }

    @Test
    void ordersNewestFirstByDefault() throws Exception {
        // The babka is the most recent, and the list page opens on it.
        mvc.perform(get("/api/recipes").param("locale", "fr"))
                .andExpect(jsonPath("$.items[0].slug").value("babka-au-chocolat"));
    }

    @Test
    void reversesOnRequest() throws Exception {
        mvc.perform(get("/api/recipes").param("locale", "fr").param("sort", "oldest"))
                .andExpect(jsonPath("$.items[0].slug").value("pain-au-levain"));
    }

    @Test
    void returnsSummariesShapedLikeTheContract() throws Exception {
        mvc.perform(get("/api/recipes").param("locale", "fr"))
                .andExpect(jsonPath("$.items[0].title").value("Babka au chocolat"))
                .andExpect(jsonPath("$.items[0].excerpt").isNotEmpty())
                .andExpect(jsonPath("$.items[0].publishedAt").isNotEmpty())
                .andExpect(jsonPath("$.items[0].prepMinutes").value(15))
                .andExpect(jsonPath("$.items[0].cookMinutes").value(45))
                .andExpect(jsonPath("$.items[0].difficulty").value(1))
                .andExpect(jsonPath("$.items[0].rating.average").value(4.0))
                .andExpect(jsonPath("$.items[0].rating.count").value(1))
                .andExpect(jsonPath("$.items[0].author.displayName").value("Hedi"))
                .andExpect(jsonPath("$.items[0].tags.length()").value(2))
                // Photography landed with ADR 8, so this is no longer null. The
                // assertion it replaces read `value(nullValue())` and was right
                // for as long as RecipeQueryDao hardcoded it.
                //
                // Present, not absent, is still the point and still worth
                // asserting: ImageRef's url, width, height and dominant are all
                // nullable in the contract, and to the frontend a key that is
                // missing is a different thing to a key that is null.
                .andExpect(jsonPath("$.items[0].image.url").isNotEmpty())
                .andExpect(jsonPath("$.items[0].image.width").isNotEmpty())
                .andExpect(jsonPath("$.items[0].image.dominant").isNotEmpty())
                .andExpect(jsonPath("$.items[0].image.alt").value("Babka au chocolat"))
                .andExpect(jsonPath("$.items[0].searchText").isNotEmpty());
    }

    @Test
    void servesTheEnglishTreeWithItsOwnSlugs() throws Exception {
        mvc.perform(get("/api/recipes").param("locale", "en"))
                .andExpect(jsonPath("$.items[0].slug").value("chocolate-babka"))
                .andExpect(jsonPath("$.items[0].title").value("Chocolate babka"));
    }

    @Test
    void filtersByTagUsingTheLocalisedSlug() throws Exception {
        // "chocolat" in French is the same tag as "chocolate" in English.
        mvc.perform(get("/api/recipes").param("locale", "fr").param("tag", "chocolat"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].slug").value("babka-au-chocolat"));
    }

    // --- detail -----------------------------------------------------------

    @Test
    void returnsTheFullRecipe() throws Exception {
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baseServings").value(2))
                .andExpect(jsonPath("$.youtubeVideoId").value("YE7VzlLtp-4"))
                .andExpect(jsonPath("$.ingredients.length()").value(7))
                .andExpect(jsonPath("$.steps.length()").value(5))
                .andExpect(jsonPath("$.bodyMarkdown").isNotEmpty())
                .andExpect(jsonPath("$.rating.average").value(4.0))
                .andExpect(jsonPath("$.rating.count").value(1))
                // Nobody is signed in, and an anonymous visitor has rated nothing.
                .andExpect(jsonPath("$.rating.yourRating").value(nullValue()))
                .andExpect(jsonPath("$.reactions.count").value(0))
                .andExpect(jsonPath("$.reactions.reacted").value(false))
                .andExpect(jsonPath("$.commentCount").value(2));
    }

    @Test
    void ordersIngredientsAndStepsAsAuthored() throws Exception {
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(jsonPath("$.ingredients[0].name").value("Farine"))
                .andExpect(jsonPath("$.ingredients[0].baseQuantity").value(250))
                .andExpect(jsonPath("$.ingredients[0].unit").value("g"))
                .andExpect(jsonPath("$.ingredients[0].scalable").value(true))
                // Step three is the 02:14 an e2e spec clicks.
                .andExpect(jsonPath("$.steps[2].videoOffsetSeconds").value(134));
    }

    @Test
    void marksTheUnscalableIngredientAsSuch() throws Exception {
        // Salt and pepper have no quantity and must not gain one.
        mvc.perform(get("/api/recipes/chakchouka").param("locale", "fr"))
                .andExpect(jsonPath("$.ingredients[5].scalable").value(false))
                .andExpect(jsonPath("$.ingredients[5].baseQuantity").value(nullValue()))
                .andExpect(jsonPath("$.ingredients[5].note").value("au goût"));
    }

    @Test
    void offersTheOtherLanguageSoTheSwitcherCanNavigate() throws Exception {
        // Slugs live in the database, so the page has to carry its counterpart;
        // the header cannot compute it.
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(jsonPath("$.alternates.length()").value(2))
                .andExpect(jsonPath("$.alternates[?(@.locale == 'en')].slug").value("chocolate-babka"));
    }

    @Test
    void refusesASlugFromTheOtherLanguage() throws Exception {
        // Otherwise /en/recipes/babka-au-chocolat would quietly work and the two
        // language trees would stop being distinct.
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "en"))
                .andExpect(status().isNotFound());
    }

    @Test
    void refusesADraftBySlug() throws Exception {
        // "Unpublished" has to mean more than "unlisted".
        mvc.perform(get("/api/recipes/jus-grenade-orange").param("locale", "fr"))
                .andExpect(status().isNotFound());
    }

    @Test
    void returnsNotFoundForAnUnknownSlug() throws Exception {
        mvc.perform(get("/api/recipes/nexiste-pas").param("locale", "fr"))
                .andExpect(status().isNotFound());
    }

    // --- featured, tags, authors ------------------------------------------

    @Test
    void featuresTheCarouselSlidesInOrder() throws Exception {
        mvc.perform(get("/api/recipes/featured").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].slug").value("babka-au-chocolat"))
                .andExpect(jsonPath("$[0].kicker").value("Recette du moment"))
                // The hero copy is deliberately longer than the card excerpt.
                .andExpect(jsonPath("$[0].excerpt").isNotEmpty());
    }

    @Test
    void countsTagsAcrossPublishedRecipesOnly() throws Exception {
        mvc.perform(get("/api/tags").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[?(@.slug == 'dessert')].count").value(2))
                .andExpect(jsonPath("$[?(@.slug == 'chocolat')].colorVariant").value("accent"));
    }

    @Test
    void listsTheAuthors() throws Exception {
        mvc.perform(get("/api/authors"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].slug").value("hedi"))
                .andExpect(jsonPath("$[0].displayName").value("Hedi"));
    }
}
