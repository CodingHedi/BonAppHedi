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

    private final MediaStorage storage;

    public MediaController(MediaStorage storage) {
        this.storage = storage;
    }

    /**
     * {@code :.+} because the default mapping treats a trailing {@code .jpg} as
     * a format suffix and hands the method a name with the extension stripped,
     * which then matches nothing on disk.
     */
    @GetMapping(MediaStorage.PREFIX + "{name:.+}")
    ResponseEntity<Resource> photograph(@PathVariable String name) throws IOException {
        Optional<Path> found = storage.find(name);
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
}
