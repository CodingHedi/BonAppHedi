package fr.bonapphedi.api;

import fr.bonapphedi.auth.AppUserPrincipal;
import fr.bonapphedi.social.BookmarkDao;
import fr.bonapphedi.social.SocialDao;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * A reader's own saved recipes (ADR 16).
 *
 * <p>Its own controller rather than three more methods on
 * {@link SocialController}, because a bookmark is not a social signal. Rating
 * and reacting are public, anonymous and counted; this is private, needs an
 * account, and is never shown to anybody else. The two happen to have the same
 * shape in the database and nothing else in common.
 *
 * <p>Anonymous readers never reach any of this — their list lives in the
 * browser and is the whole feature for them. These endpoints exist so that
 * signing in makes the list follow them to another device.
 *
 * <p>Everything here speaks recipe <b>keys</b>, which are the same string in
 * both languages and cannot be renamed. A slug identifies a recipe only within
 * one language, so a list held as slugs would empty itself the first time
 * somebody switched.
 */
@RestController
@RequestMapping("/api")
public class BookmarkController {

    private final BookmarkDao bookmarks;
    private final SocialDao recipes;

    public BookmarkController(BookmarkDao bookmarks, SocialDao recipes) {
        this.bookmarks = bookmarks;
        this.recipes = recipes;
    }

    public record BookmarkRequest(Boolean bookmarked) {}

    public record MergeRequest(List<String> keys) {}

    /**
     * The reader's list.
     *
     * <p>401 to a stranger rather than an empty list, and the distinction
     * matters to the page: "you are not signed in" and "you have saved nothing"
     * are different states with different things to say, and an empty array
     * would collapse them.
     */
    @GetMapping("/auth/bookmarks")
    public List<String> list(@AuthenticationPrincipal AppUserPrincipal principal) {
        return bookmarks.keysFor(require(principal));
    }

    /**
     * Adds what the browser was holding and answers with everything.
     *
     * <p>PUT and not POST because it is idempotent: it is a union, so sending
     * the same list twice is indistinguishable from sending it once. That is
     * what lets the client retry after a dropped connection without thinking
     * about it, and it is why a half-finished merge needs no repair.
     */
    @PutMapping("/auth/bookmarks")
    public List<String> merge(
            @RequestBody MergeRequest body, @AuthenticationPrincipal AppUserPrincipal principal) {

        long userId = require(principal);
        return bookmarks.merge(userId, body.keys() == null ? List.of() : body.keys());
    }

    /**
     * Saves or unsaves one recipe, addressed the way its page is.
     *
     * <p>By slug rather than by key, matching every other route under
     * {@code /api/recipes/}: the caller is on that page and has the slug in the
     * URL bar. What comes back out of the list above is still keys — the slug
     * is how you point at a recipe from a page, the key is what you keep.
     */
    @PutMapping("/recipes/{slug}/bookmark")
    public ResponseEntity<Void> set(
            @PathVariable String slug,
            @RequestParam(defaultValue = "fr") String locale,
            @RequestBody BookmarkRequest body,
            @AuthenticationPrincipal AppUserPrincipal principal) {

        long userId = require(principal);

        if (!"fr".equals(locale) && !"en".equals(locale)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown locale");
        }

        long recipeId = recipes.publicRecipeId(slug, locale)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

        bookmarks.set(userId, recipeId, Boolean.TRUE.equals(body.bookmarked()));
        return ResponseEntity.noContent().build();
    }

    /**
     * 401 rather than 403 throughout, as the comment endpoints do: the reader is
     * not forbidden from keeping recipes, they have not said who they are, and
     * the page answers that by offering sign-in rather than an apology.
     */
    private static long require(AppUserPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return principal.user().id();
    }
}
