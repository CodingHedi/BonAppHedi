package fr.bonapphedi.media;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves recipe photographs from our own origin (ADR 8).
 *
 * <p>Deliberately not under {@code /api}: this is a file, not a resource in the
 * API's contract, and {@code ApiSecurityMatrixTest} exists to make every
 * {@code /api} endpoint declare who may call it. Putting a public image there
 * would mean declaring it as a public read, which is true but says nothing.
 *
 * <p>Serving from the origin is not incidental. ADR 6 and ADR 7 are both built
 * on nothing being fetched from a third party to render a page — that is what
 * keeps the site free of a cookie-consent obligation — and an image CDN would
 * end it quietly.
 */
@RestController
public class MediaController {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MediaController.class);

    private final MediaStorage storage;
    private final PhotoIngest ingest;

    public MediaController(MediaStorage storage, PhotoIngest ingest) {
        this.storage = storage;
        this.ingest = ingest;
    }

    /**
     * {@code :.+} because the default mapping treats a trailing {@code .jpg} as
     * a format suffix and hands the method a name with the extension stripped,
     * which then matches nothing on disk.
     */
    @GetMapping(MediaStorage.PREFIX + "{name:.+}")
    ResponseEntity<Resource> photograph(@PathVariable String name) throws IOException {
        Optional<Path> found = storage.find(name);
        if (found.isEmpty()) found = generate(name);
        if (found.isEmpty()) return ResponseEntity.notFound().build();

        Path file = found.get();
        String contentType = Optional.ofNullable(Files.probeContentType(file))
                .orElse(MediaType.APPLICATION_OCTET_STREAM_VALUE);

        return ResponseEntity.ok()
                // Immutable is a claim about the URL, not the picture: replacing
                // a recipe's photograph through the admin writes a new file
                // rather than overwriting one, so an address that answers today
                // answers with the same bytes forever.
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(365)).cachePublic().immutable())
                .contentType(MediaType.parseMediaType(contentType))
                .contentLength(Files.size(file))
                .body(new FileSystemResource(file));
    }

    /**
     * Writes a derivative the first time a browser asks for one.
     *
     * <p>Made here rather than at upload, which is what let this ship on top of
     * photographs already on the server: nothing had to be backfilled, and there
     * was no window in which the API offered a {@code srcset} entry for a file
     * that did not exist. The cost is one slow response per size per photograph,
     * once, after which it is an ordinary file with the same immutable caching
     * as any other.
     *
     * <p>Empty for anything that is not a derivative of a width on the ladder,
     * or whose original is not on disk. That is the whole guard: a name has to
     * decode to a width this application offers and to a file it already wrote,
     * so there is nothing here to point at an arbitrary size or an arbitrary
     * source.
     *
     * <p>A failed write is not a failed request. If the disk refuses — which is
     * exactly the shape of the {@code bah.media.dir} defect that shipped a site
     * of broken images — the bytes are already in hand, so it logs and serves
     * them from the original instead of turning a slow path into a 404.
     */
    private Optional<Path> generate(String name) throws IOException {
        Optional<MediaStorage.Derivative> asked = MediaStorage.parseDerivative(name);
        if (asked.isEmpty()) return Optional.empty();

        MediaStorage.Derivative derivative = asked.get();
        Optional<Path> original = storage.find(derivative.original());
        if (original.isEmpty()) return Optional.empty();

        Optional<byte[]> smaller = ingest.derive(Files.readAllBytes(original.get()), derivative.width());
        // The original is already at or below this width. Serving it is right:
        // the address stays valid and the bytes are the smallest that exist.
        if (smaller.isEmpty()) return original;

        try {
            storage.store(name, smaller.get());
        } catch (IOException e) {
            log.error("Could not write the derivative {}; serving the original instead", name, e);
            return original;
        }

        return storage.find(name);
    }
}
