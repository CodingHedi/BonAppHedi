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

    /**
     * The widths a browser may ask for, smallest first. ADR 8's "bounded set",
     * and the bound is these three.
     *
     * <p>Chosen against the two slots that exist: a card's media box is 190px
     * tall in a column roughly 350px wide, and the detail page's is a 16/9 box
     * up to about 800px. So 400 serves a card at 1× and 800 serves it at 2× or
     * the detail page at 1×; 1600 is the stored original and covers the rest.
     *
     * <p><b>Closed on purpose.</b> A width outside this list is a 404 rather
     * than a new file: the generator would otherwise be an open invitation to
     * fill the disk one query string at a time, and nothing this side of the
     * ladder is asking for arbitrary sizes.
     */
    public static final int[] WIDTH_LADDER = {400, 800};

    /**
     * Separates a base name from a derivative width: {@code babka@400.jpg}.
     *
     * <p>An {@code @} rather than a hyphen, and that is not cosmetic. Uploads
     * are named {@code <slug>-<digest>.jpg} and slugs contain hyphens, so
     * {@code foo-400.jpg} is ambiguous — it is either a derivative of
     * {@code foo.jpg} or the original for a recipe whose slug ends in 400.
     * {@code @} cannot occur in a generated base name, so the split is exact.
     */
    private static final char WIDTH_MARK = '@';

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

    /** {@code babka.jpg} at 400 → {@code babka@400.jpg}. */
    public static String derivativeName(String file, int width) {
        int dot = file.lastIndexOf('.');
        String stem = dot < 0 ? file : file.substring(0, dot);
        String extension = dot < 0 ? "" : file.substring(dot);
        return stem + WIDTH_MARK + width + extension;
    }

    /** What a derivative name refers to: the original it came from, and its width. */
    public record Derivative(String original, int width) {}

    /**
     * Reads {@code babka@400.jpg} back as {@code (babka.jpg, 400)}, or empty if
     * the name is not a derivative of a width on the ladder.
     *
     * <p>Empty covers a name with no mark, a mark with rubbish after it, and a
     * width nobody offered. The last is the one that matters: it is what keeps
     * {@code foo@37.jpg} from being generated on demand a thousand times.
     */
    public static Optional<Derivative> parseDerivative(String name) {
        if (name == null) return Optional.empty();

        int mark = name.lastIndexOf(WIDTH_MARK);
        int dot = name.lastIndexOf('.');
        if (mark < 1 || dot <= mark) return Optional.empty();

        int width;
        try {
            width = Integer.parseInt(name.substring(mark + 1, dot));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }

        if (java.util.Arrays.stream(WIDTH_LADDER).noneMatch(offered -> offered == width)) {
            return Optional.empty();
        }

        return Optional.of(new Derivative(name.substring(0, mark) + name.substring(dot), width));
    }

    /**
     * Every address for one photograph, smallest first, ending in the original.
     *
     * <p>Built from the stored width rather than from what is on disk, because
     * the files are made on request: a derivative that has never been asked for
     * does not exist yet, and listing only what exists would mean the first
     * visitor gets no {@code srcset} and every one after gets one.
     *
     * <p>Ladder entries at or above the stored width are dropped. A photograph
     * 350px wide is offered at 350 and nothing else — upscaling it would cost
     * bytes to say less, and {@code PhotoIngest.derive} refuses to do it, so
     * offering an 800 here would promise a file that will never be written.
     */
    public static java.util.List<Integer> widthsFor(int storedWidth) {
        java.util.List<Integer> widths = new java.util.ArrayList<>();
        for (int width : WIDTH_LADDER) {
            if (width < storedWidth) widths.add(width);
        }
        widths.add(storedWidth);
        return java.util.List.copyOf(widths);
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
     * Writes a photograph under a name this class has resolved, replacing any
     * file already there.
     *
     * <p>The name is checked the same way a read is, and for a stronger reason:
     * a write that escapes the directory does not return the wrong bytes, it
     * puts attacker-chosen bytes at an attacker-chosen path. Callers here build
     * the name themselves rather than taking it from the upload, so this is the
     * second lock again — but it is the one that would matter.
     */
    public void store(String name, byte[] bytes) throws IOException {
        Path target = resolve(name);
        if (target == null) throw new IOException("refusing to write outside the media directory: " + name);

        Files.createDirectories(root);
        Files.write(target, bytes);
    }

    /** Quietly does nothing for a name that is absent or not ours to delete. */
    public void delete(String name) {
        Path target = resolve(name);
        if (target == null) return;

        try {
            Files.deleteIfExists(target);
        } catch (IOException e) {
            // Worth saying and not worth failing an upload over: the row has
            // already moved on, so the consequence is an orphaned file rather
            // than a photograph nobody can see.
            log.error("Could not delete the photograph {}", target, e);
        }
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
        Path candidate = resolve(name);

        if (candidate == null) return Optional.empty();
        if (!Files.isRegularFile(candidate) || !Files.isReadable(candidate)) return Optional.empty();

        return Optional.of(candidate);
    }

    /**
     * The containment check itself, shared by every path in and out. Null means
     * the name resolved outside the directory, whatever it did to get there — a
     * name carrying separators, a symlink out of the tree, an absolute path.
     */
    private Path resolve(String name) {
        if (name == null || name.isBlank()) return null;

        Path candidate = root.resolve(name).toAbsolutePath().normalize();
        return candidate.startsWith(root) ? candidate : null;
    }
}
