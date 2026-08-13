package fr.bonapphedi.api;

import fr.bonapphedi.admin.AdminDao;
import fr.bonapphedi.media.MediaStorage;
import fr.bonapphedi.media.PhotoIngest;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
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

    /**
     * An event rather than a call into whatever caches recipes, so this class
     * keeps knowing only about saving. {@code IndexHtmlController} holds a
     * per-recipe metadata cache and has to drop it here — a stale
     * {@code <title>} outlives the edit that changed it and is invisible from
     * the admin, because the editor reads the API and never the served HTML.
     */
    private final ApplicationEventPublisher events;

    private final MediaStorage storage;
    private final PhotoIngest ingest;

    public AdminController(
            AdminDao dao, ApplicationEventPublisher events, MediaStorage storage, PhotoIngest ingest) {
        this.dao = dao;
        this.events = events;
        this.storage = storage;
        this.ingest = ingest;
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
        events.publishEvent(new RecipeChanged());
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
        // Publishing and unpublishing both change what the metadata layer may
        // emit, so this matters at least as much as an edit: a draft that was
        // published must stop being invisible to crawlers, and one that was
        // withdrawn must stop being visible to them.
        events.publishEvent(new RecipeChanged());
        return ResponseEntity.noContent().build();
    }

    // --- photographs ------------------------------------------------------

    /**
     * The first untrusted file this site accepts (ADR 8).
     *
     * <p>A PUT and not a POST: a recipe has one photograph, and uploading again
     * replaces it rather than adding a second. Nothing about the upload is
     * believed — {@link PhotoIngest} decides what is an image, and the name the
     * file is stored under is built here from the recipe key and a digest of
     * what was actually written, never from what the caller called it.
     *
     * <p>The digest in the name is doing two jobs. It cannot collide across
     * recipes, and it changes whenever the bytes do, which is what lets
     * {@link fr.bonapphedi.media.MediaController} cache aggressively without a
     * replacement being invisible behind it.
     */
    @PutMapping(value = "/recipes/{key}/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Dto.AdminPhoto photo(@PathVariable String key, @RequestPart("file") MultipartFile file) throws IOException {
        if (dao.recipeIdFor(key).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        PhotoIngest.Photograph photo;
        try {
            photo = ingest.accept(file.getBytes());
        } catch (PhotoIngest.Refused refused) {
            throw new ResponseStatusException(refused.status, refused.getMessage());
        }

        String name = fileNameFor(key, photo.jpeg());
        Optional<String> previous = dao.imageFileFor(key);

        // Written before the row moves, so the row never names a file that is
        // not there yet. The other order fails as a broken image on the live
        // site; this one fails as an orphan nobody sees.
        storage.store(name, photo.jpeg());
        dao.setImage(key, name, photo.width(), photo.height(), photo.dominant());
        previous.filter(old -> !old.equals(name)).ifPresent(storage::delete);

        // og:image, the JSON-LD image and the sitemap all carry this, and all
        // three are cached.
        events.publishEvent(new RecipeChanged());

        return new Dto.AdminPhoto(MediaStorage.urlFor(name), photo.width(), photo.height(), photo.dominant());
    }

    /** Back to the generated placeholder panel, which is what no photograph looks like. */
    @DeleteMapping("/recipes/{key}/photo")
    public ResponseEntity<Void> removePhoto(@PathVariable String key) {
        Optional<String> previous = dao.imageFileFor(key);
        if (!dao.clearImage(key)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        previous.ifPresent(storage::delete);
        events.publishEvent(new RecipeChanged());
        return ResponseEntity.noContent().build();
    }

    /**
     * Keys are slugs and have always been, so this changes nothing today. It is
     * here because the name reaches the filesystem: the day a key is allowed a
     * character that means something to a path, this is what stops it meaning
     * it.
     */
    private static String fileNameFor(String key, byte[] jpeg) {
        String safe = key.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9-]", "");
        if (safe.isBlank()) safe = "photo";

        return safe + '-' + digest(jpeg) + ".jpg";
    }

    private static String digest(byte[] bytes) {
        try {
            byte[] sum = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder(8);
            for (int i = 0; i < 4; i++) hex.append(String.format("%02x", sum[i]));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            // SHA-256 is required of every JVM, so this is unreachable rather
            // than unhandled.
            throw new IllegalStateException(e);
        }
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
