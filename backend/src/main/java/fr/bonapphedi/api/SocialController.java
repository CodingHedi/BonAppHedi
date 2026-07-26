package fr.bonapphedi.api;

import fr.bonapphedi.auth.AppUserPrincipal;
import fr.bonapphedi.content.MarkdownRenderer;
import fr.bonapphedi.social.SocialDao;
import fr.bonapphedi.social.VisitorIdentity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Everything a visitor can write about a recipe.
 *
 * <p>Split from {@link RecipeController} rather than bolted onto it because the
 * two have genuinely different shapes: reads are anonymous and cacheable, while
 * every method here mutates, carries a session cookie and an XSRF header, and
 * has something to say about who is allowed to do it.
 *
 * <p>Rating and reacting need no account - they are identified by a cookie. A
 * comment needs one, because it carries a name.
 *
 * <p>PUT rather than POST for the two anonymous ones, and that is not decoration:
 * both are idempotent replacements. Rating again replaces your score, reacting
 * again with the same value changes nothing, and a client that retries after a
 * dropped connection must not end up counted twice.
 */
@RestController
@RequestMapping("/api")
public class SocialController {

    private final SocialDao dao;
    private final VisitorIdentity visitors;
    private final MarkdownRenderer markdown;

    public SocialController(SocialDao dao, VisitorIdentity visitors, MarkdownRenderer markdown) {
        this.dao = dao;
        this.visitors = visitors;
        this.markdown = markdown;
    }

    public record RatingRequest(Integer stars) {}

    public record ReactionRequest(Boolean reacted) {}

    public record CommentRequest(String bodyMarkdown) {}

    // --- ratings and reactions --------------------------------------------

    @PutMapping("/recipes/{slug}/rating")
    public Dto.RatingSummary rate(
            @PathVariable String slug,
            @RequestParam(defaultValue = "fr") String locale,
            @RequestBody RatingRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {

        // Checked before a visitor is created, so a request that was never going
        // to succeed does not leave a cookie and a row behind it.
        if (body.stars() == null || body.stars() < 1 || body.stars() > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "stars must be 1..5");
        }

        long recipeId = publicRecipe(slug, locale);
        String visitor = visitors.require(request, response);

        dao.rate(recipeId, visitor, body.stars());
        return dao.ratingFor(recipeId, visitor);
    }

    @PutMapping("/recipes/{slug}/reaction")
    public Dto.Reactions react(
            @PathVariable String slug,
            @RequestParam(defaultValue = "fr") String locale,
            @RequestBody ReactionRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {

        if (body.reacted() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reacted is required");
        }

        long recipeId = publicRecipe(slug, locale);
        String visitor = visitors.require(request, response);

        dao.react(recipeId, visitor, body.reacted());
        return dao.reactionsFor(recipeId, visitor);
    }

    // --- comments ---------------------------------------------------------

    @GetMapping("/recipes/{slug}/comments")
    public List<Dto.Comment> comments(
            @PathVariable String slug,
            @RequestParam(defaultValue = "fr") String locale,
            @AuthenticationPrincipal AppUserPrincipal principal) {

        return dao.commentsFor(publicRecipe(slug, locale), userId(principal));
    }

    @PostMapping("/recipes/{slug}/comments")
    public ResponseEntity<Dto.Comment> addComment(
            @PathVariable String slug,
            @RequestParam(defaultValue = "fr") String locale,
            @RequestBody CommentRequest body,
            @AuthenticationPrincipal AppUserPrincipal principal) {

        // 401 rather than 403: the visitor is not forbidden from commenting, they
        // simply have not said who they are yet, and the UI offers sign-in.
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        String markdownBody = body.bodyMarkdown() == null ? "" : body.bodyMarkdown().trim();
        if (markdownBody.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "a comment cannot be empty");
        }

        long recipeId = publicRecipe(slug, locale);

        // Rendered and sanitized here, on the way in, so the database only ever
        // holds HTML that has already been through the policy - a comment body is
        // untrusted input from a stranger and this is the boundary.
        long id = dao.addComment(
                recipeId,
                principal.user().id(),
                principal.user().displayName(),
                principal.user().avatarUrl(),
                markdownBody,
                markdown.render(markdownBody));

        return dao.commentById(id, principal.user().id())
                .map(comment -> ResponseEntity.status(HttpStatus.CREATED).body(comment))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR));
    }

    /**
     * Your own comment, and only your own.
     *
     * <p>An admin does not remove things through here - moderation is a status
     * change in the admin area, so that a rejected comment leaves a trace instead
     * of vanishing.
     */
    @DeleteMapping("/comments/{id}")
    public ResponseEntity<Void> deleteComment(
            @PathVariable long id, @AuthenticationPrincipal AppUserPrincipal principal) {

        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        if (dao.deleteOwnComment(id, principal.user().id()) == 0) {
            // Somebody else's, or gone already. Both answer the same way: telling
            // them apart would confirm which ids exist.
            throw new ResponseStatusException(
                    dao.commentExists(id) ? HttpStatus.FORBIDDEN : HttpStatus.NOT_FOUND);
        }

        return ResponseEntity.noContent().build();
    }

    // --- shared -----------------------------------------------------------

    /**
     * A draft, an unknown slug and a slug from the other language are all the same
     * answer, exactly as they are on the read side. Rating something that is not
     * published must not be the thing that reveals it exists.
     */
    private long publicRecipe(String slug, String locale) {
        if (!"fr".equals(locale) && !"en".equals(locale)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown locale");
        }

        return dao.publicRecipeId(slug, locale)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private Long userId(AppUserPrincipal principal) {
        return principal == null ? null : principal.user().id();
    }
}
