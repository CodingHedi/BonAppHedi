package fr.bonapphedi.api;

import fr.bonapphedi.admin.AdminDao;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
 * Authoring, moderation and the dashboard.
 *
 * <p>Everything here is admin-only, and it is the security chain that makes it
 * so: {@code /api/admin/**} requires {@code ROLE_ADMIN} in one place rather than
 * every method repeating an annotation, which is one place to get it wrong
 * instead of nine. The Angular route guard in front of these screens decides
 * what the UI offers and enforces nothing.
 *
 * <p>{@code locale} on the reads is a display concern only. It picks the language
 * a title is shown in and never which recipes come back - an admin sees drafts,
 * archived recipes and untranslated ones, because finding those is the job.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED", "ARCHIVED");

    private final AdminDao dao;

    public AdminController(AdminDao dao) {
        this.dao = dao;
    }

    public record StatusRequest(String status) {}

    public record ModerationRequest(Boolean approve) {}

    // --- recipes ----------------------------------------------------------

    @GetMapping("/recipes")
    public List<Dto.AdminRecipeRow> recipes(@RequestParam(defaultValue = "fr") String locale) {
        return dao.recipes(validLocale(locale));
    }

    /**
     * Declared before {@code /recipes/{key}} so "blank" is not read as a key.
     * Spring orders by specificity and would get this right anyway; relying on
     * that is a trap for whoever adds the next fixed path.
     */
    @GetMapping("/recipes/blank")
    public Dto.RecipeDraft blank() {
        return dao.blank();
    }

    @GetMapping("/recipes/{key}")
    public Dto.RecipeDraft draft(@PathVariable String key) {
        return dao.draft(key).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    /**
     * Creates when the key is new, replaces when it is not - so the editor has
     * one button and does not have to know which it is doing.
     */
    @PutMapping("/recipes")
    public ResponseEntity<Void> save(@RequestBody Dto.RecipeDraft draft) {
        if (draft.key() == null || draft.key().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "a recipe needs a key");
        }
        if (!STATUSES.contains(draft.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown status");
        }
        if (draft.difficulty() < 1 || draft.difficulty() > 3 || draft.baseServings() < 1) {
            // CHECK constraints would catch both, as a 500. An answer beats a
            // stack trace for something the editor can put right.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "difficulty is 1..3, servings at least 1");
        }

        dao.save(draft);
        return ResponseEntity.noContent().build();
    }

    /**
     * Separate from {@link #save} because it is the one-click action on the table
     * row, where there is no draft in hand to send.
     */
    @PutMapping("/recipes/{key}/status")
    public ResponseEntity<Void> setStatus(@PathVariable String key, @RequestBody StatusRequest body) {
        if (body.status() == null || !STATUSES.contains(body.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown status");
        }
        if (!dao.setStatus(key, body.status())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return ResponseEntity.noContent().build();
    }

    // --- moderation -------------------------------------------------------

    @GetMapping("/comments/pending")
    public List<Dto.ModerationItem> pending(@RequestParam(defaultValue = "fr") String locale) {
        return dao.pending(validLocale(locale));
    }

    /** Approving publishes the comment; rejecting removes it from the site. */
    @PostMapping("/comments/{id}/moderate")
    public ResponseEntity<Void> moderate(@PathVariable long id, @RequestBody ModerationRequest body) {
        if (body.approve() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "approve is required");
        }
        if (!dao.moderate(id, body.approve())) {
            // Already handled, or never existed. Two moderators working the queue
            // at once is normal and must not produce a 500 for the slower one.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return ResponseEntity.noContent().build();
    }

    // --- dashboard --------------------------------------------------------

    @GetMapping("/stats")
    public Dto.AdminStats stats(@RequestParam(defaultValue = "fr") String locale) {
        return dao.stats(validLocale(locale));
    }

    private String validLocale(String locale) {
        if ("fr".equals(locale) || "en".equals(locale)) {
            return locale;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown locale");
    }
}
