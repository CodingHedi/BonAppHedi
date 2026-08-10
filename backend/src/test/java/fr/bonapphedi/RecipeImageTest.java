package fr.bonapphedi;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Photographs reach the JSON, on the list and on the detail (ADR 8).
 *
 * <p>Every recipe carried {@code ImageRef(null, title)} until this milestone —
 * hardcoded in {@code RecipeQueryDao}, with no column behind it — so a test that
 * only checked the field's <em>presence</em> passed against a site with no
 * photography at all. These assert the url is populated and the geometry with
 * it, because the geometry is what {@code image.ts} needs to reserve its box and
 * cost zero layout shift.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RecipeImageTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void everyPublishedRecipeHasAPhotographInTheList() throws Exception {
        // ADR 8's definition of done, asserted where it is cheapest to check.
        // `!= null` on every item rather than one: the failure being guarded
        // against is a recipe quietly left without one.
        mvc.perform(get("/api/recipes").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.image.url == null)]").isEmpty())
                .andExpect(jsonPath("$.items[0].image.url").value("/media/babka-au-chocolat.jpg"));
    }

    @Test
    void carriesTheGeometryTheLayoutNeeds() throws Exception {
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.image.url").value("/media/babka-au-chocolat.jpg"))
                .andExpect(jsonPath("$.image.width").value(1600))
                .andExpect(jsonPath("$.image.height").value(738))
                .andExpect(jsonPath("$.image.dominant").value("#908271"));
    }

    @Test
    void altTextIsTheTranslatedTitle() throws Exception {
        // The photograph is per-recipe and the alt text is not: it is the only
        // part of an ImageRef that has to differ between languages.
        mvc.perform(get("/api/recipes/chocolate-babka").param("locale", "en"))
                .andExpect(jsonPath("$.image.alt").value("Chocolate babka"))
                .andExpect(jsonPath("$.image.url").value("/media/babka-au-chocolat.jpg"));
    }

    @Test
    void servesThePhotographItsOwnJsonNames() throws Exception {
        // The URL in the JSON has to be one the site actually answers, from our
        // own origin. ADR 6 and ADR 7 are built on nothing leaving the origin.
        mvc.perform(get("/media/babka-au-chocolat.jpg"))
                .andExpect(status().isOk());
    }

    @Test
    void refusesToBeWalkedOutOfTheImageDirectory() throws Exception {
        // The one thing a file-serving path must not do.
        //
        // 4xx rather than a specific code, and that is the honest assertion:
        // Spring's firewall rejects an encoded traversal with 400 before any
        // handler sees it, so pinning 404 would be asserting the framework's
        // behaviour rather than ours. What matters is that it is refused and
        // that no file comes back.
        mvc.perform(get("/media/..%2F..%2Fapplication.yml"))
                .andExpect(status().is4xxClientError());

        // Reaches the handler, so this one does test our guard rather than the
        // firewall: a plain name that is simply not there.
        mvc.perform(get("/media/nothing-here.jpg")).andExpect(status().isNotFound());
    }
}
