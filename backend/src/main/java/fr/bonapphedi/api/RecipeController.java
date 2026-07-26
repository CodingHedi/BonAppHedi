package fr.bonapphedi.api;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Everything the public site reads.
 *
 * <p>Anonymous and side-effect free, which is what lets these responses be
 * cached later without thinking about it. The write side lives elsewhere,
 * deliberately - see the note on {@code SocialApi} in the frontend contract.
 *
 * <p>{@code locale} is a query parameter rather than a path segment because the
 * URL prefix the visitor sees ({@code /fr/recettes/...}) is the frontend's
 * routing concern, not the API's. The API is asked for one language and answers
 * in it.
 */
@RestController
@RequestMapping("/api")
public class RecipeController {

    private final RecipeQueryDao dao;

    public RecipeController(RecipeQueryDao dao) {
        this.dao = dao;
    }

    @GetMapping("/recipes")
    public Dto.Page<Dto.RecipeSummary> list(
            @RequestParam(defaultValue = "fr") String locale,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String author,
            @RequestParam(required = false) String sort) {

        List<Dto.RecipeSummary> items = dao.list(validLocale(locale), tag, author, sort);

        // Unpaged for now, and honestly so: six recipes do not need paging, and
        // the envelope is here because the contract has it and because adding
        // paging later must not change the response shape.
        return new Dto.Page<>(items, 0, items.size(), items.size());
    }

    /**
     * Declared before {@code /recipes/{slug}} so "featured" is not swallowed as
     * a slug. Spring orders by specificity and would get this right anyway, but
     * relying on that is a trap for whoever adds the next fixed path.
     */
    @GetMapping("/recipes/featured")
    public List<Dto.HeroSlide> featured(@RequestParam(defaultValue = "fr") String locale) {
        return dao.featured(validLocale(locale));
    }

    @GetMapping("/recipes/{slug}")
    public Dto.RecipeDetail bySlug(
            @PathVariable String slug, @RequestParam(defaultValue = "fr") String locale) {

        return dao.bySlug(slug, validLocale(locale))
                // A draft, an unknown slug, and a slug belonging to the other
                // language are all the same answer: there is no such page here.
                // Distinguishing them would confirm that a draft exists.
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/tags")
    public List<Dto.Tag> tags(@RequestParam(defaultValue = "fr") String locale) {
        return dao.tags(validLocale(locale));
    }

    @GetMapping("/authors")
    public List<Dto.Author> authors(@RequestParam(defaultValue = "fr") String locale) {
        return dao.authors(validLocale(locale));
    }

    /**
     * The locale reaches SQL, so it is checked against the two that exist rather
     * than trusted. Every column it selects is interpolated as a bind parameter,
     * but a value that decides which rows are visible deserves validating on its
     * own terms.
     */
    private String validLocale(String locale) {
        if ("fr".equals(locale) || "en".equals(locale)) {
            return locale;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown locale");
    }
}
