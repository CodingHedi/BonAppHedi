package fr.bonapphedi;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
class RecipeMetadataTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void putsTheRecipeInTheTitleAndDescription() throws Exception {
        mvc.perform(get("/fr/recettes/babka-au-chocolat"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("<title>Babka au chocolat")))
                .andExpect(content().string(containsString("Une brioche tressée au marbrage")));
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
    void aDraftGetsNoMetadataEither() throws Exception {
        // Unpublished has to mean unpublished here too. Emitting a title and a
        // JSON-LD block for a draft would publish it to exactly the audience
        // this layer exists to serve.
        mvc.perform(get("/fr/recettes/jus-grenade-orange"))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("application/ld+json"))));
    }
}
