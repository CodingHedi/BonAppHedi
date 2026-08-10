package fr.bonapphedi.media;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * Where recipe photographs live, and the only way to a file inside it (ADR 8).
 *
 * <p>On disk beside the SQLite database rather than inside the jar, because
 * photographs arrive by upload after the build. That has a consequence recorded
 * in ADR 8 and worth repeating: the backups no longer cover everything the site
 * owns, and the failure is silent — {@code backup.sh} keeps succeeding while the
 * photographs are not in it.
 */
@Component
public class MediaStorage {

    /**
     * The URL prefix, shared with {@code RecipeQueryDao} so the address in the
     * JSON and the address the site answers cannot drift apart.
     */
    public static final String PREFIX = "/media/";

    private static final Logger log = LoggerFactory.getLogger(MediaStorage.class);

    /** Ships in the jar; copied out on startup. See {@link #installSeedImages()}. */
    private static final String SEED_RESOURCES = "classpath:seed-images/*.jpg";

    private final Path root;

    public MediaStorage(@Value("${bah.media.dir:./data/images}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    public static String urlFor(String file) {
        return PREFIX + file;
    }

    /**
     * Copies the seeded photographs out of the jar, skipping any already there.
     *
     * <p>A SQL migration can name a file and cannot create one, so without this
     * {@code V8__recipe_image.sql} would point six rows at nothing on every
     * fresh database. That is not a rare path: {@code dev.ps1 -Fresh} deletes
     * the database on purpose, and a restored backup starts from the same
     * place.
     *
     * <p>Skipping what exists is what makes it safe to run on every boot, and
     * is also what stops it overwriting a photograph somebody has since
     * replaced through the admin.
     */
    @PostConstruct
    void installSeedImages() {
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            // Not fatal on its own: the site runs without photographs, and
            // saying so once is more useful than refusing to start.
            log.error("Could not create the media directory at {}", root, e);
            return;
        }

        Resource[] seeds;
        try {
            seeds = new PathMatchingResourcePatternResolver().getResources(SEED_RESOURCES);
        } catch (IOException e) {
            log.error("Could not read the seeded photographs from the jar", e);
            return;
        }

        int copied = 0;
        for (Resource seed : seeds) {
            String name = seed.getFilename();
            if (name == null) continue;

            Path target = root.resolve(name);
            if (Files.exists(target)) continue;

            try (InputStream in = seed.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
                copied++;
            } catch (IOException e) {
                log.error("Could not install the seeded photograph {}", name, e);
            }
        }

        if (copied > 0) log.info("Installed {} seeded photographs into {}", copied, root);
    }

    /**
     * Resolves a name to a readable file inside the directory, or empty.
     *
     * <p>Empty covers "does not exist" and "is not inside the directory" alike,
     * deliberately: a caller that could tell them apart could probe the disk one
     * 404 at a time.
     *
     * <p>The containment check is on the <em>normalised absolute</em> path, so
     * it holds for anything that survives to here — a name carrying separators,
     * a symlink out of the tree, an absolute path. Spring's firewall rejects the
     * obvious encoded traversals long before this, which makes this the second
     * lock rather than the only one.
     */
    public Optional<Path> find(String name) {
        Path candidate = root.resolve(name).toAbsolutePath().normalize();

        if (!candidate.startsWith(root)) return Optional.empty();
        if (!Files.isRegularFile(candidate) || !Files.isReadable(candidate)) return Optional.empty();

        return Optional.of(candidate);
    }
}
