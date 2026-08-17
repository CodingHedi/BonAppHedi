package fr.bonapphedi.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The width ladder exists twice, and this is what stops the two copies drifting.
 *
 * <p>The server is the source of truth — it sends the available widths on every
 * {@code ImageRef} rather than leaving a client to apply a rule. But the mocked
 * build has no server, so {@code image-sources.ts} reconstructs the same list,
 * and that copy is what the whole e2e suite runs against.
 *
 * <p><b>The drift would be silent and one-directional.</b> Add a width to the
 * frontend that the server does not offer and the mocked build renders a
 * {@code srcset} the suite is perfectly happy with, while production answers 404
 * for a size no test ever requests. Remove one and the mocked build simply stops
 * exercising it. Neither shows up anywhere else.
 *
 * <p>Reading the TypeScript from a backend test is unusual and is the point:
 * nothing else in either suite can see both lists at once. {@code AvatarTest}
 * does the same thing for the avatar vocabulary, for the same reason.
 */
class MediaLadderTest {

    /** cwd is backend/ for every runner here: mvnw, and surefire's module base. */
    private static final Path MIRROR = Path.of("../frontend/src/app/core/api/image-sources.ts");

    @Test
    void theFrontendMirrorsTheWidthsTheServerOffers() throws IOException {
        assertThat(MIRROR)
                .as("the frontend width ladder has moved; this test needs its new path, not deleting")
                .isRegularFile();

        String source = Files.readString(MIRROR, StandardCharsets.UTF_8);

        Matcher block = Pattern.compile("WIDTH_LADDER\\s*=\\s*\\[(.*?)]", Pattern.DOTALL)
                .matcher(source);
        assertThat(block.find()).as("WIDTH_LADDER is no longer an array literal").isTrue();

        List<Integer> mirrored = Pattern.compile("\\d+")
                .matcher(block.group(1))
                .results()
                .map(result -> Integer.parseInt(result.group()))
                .toList();

        assertThat(mirrored).as("no widths were parsed, so this compared nothing").isNotEmpty();

        List<Integer> offered =
                java.util.Arrays.stream(MediaStorage.WIDTH_LADDER).boxed().toList();

        // Order matters as well as membership: both sides emit smallest-first
        // and a browser reads a srcset in the order it is given.
        assertThat(mirrored).isEqualTo(offered);
    }

    @Test
    void theFrontendBuildsDerivativeNamesTheSameWay() throws IOException {
        // The other half of the mirror. A frontend that agreed on the widths and
        // spelled the filename differently would fail in exactly the same way,
        // and the '@' is load-bearing rather than decorative.
        String source = Files.readString(MIRROR, StandardCharsets.UTF_8);

        assertThat(source)
                .as("the frontend no longer builds derivative names with '@'")
                .contains("@${width}");

        assertThat(MediaStorage.derivativeName("babka.jpg", 400)).isEqualTo("babka@400.jpg");
    }
}
