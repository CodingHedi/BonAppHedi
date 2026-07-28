package fr.bonapphedi.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The guard on what may be written to {@code app_user.avatar}.
 *
 * <p>An avatar is a token from a closed set (ADR 7), and the set is enforced here
 * rather than trusted from the browser: the endpoint is a signed-in write, so
 * without this any string of any length would end up in the column.
 */
class AvatarTest {

    @Test
    void acceptsEveryCombinationTheSiteOffers() {
        // Exhaustive rather than sampled. This is the only assertion that the
        // picker cannot offer a choice the server then rejects, and a rejected
        // choice is invisible until somebody clicks that one avatar.
        for (String icon : Avatar.ICONS) {
            for (int tint = 0; tint < Avatar.TINTS; tint++) {
                // Two segments: the neutral ink, and the spelling of every
                // avatar chosen before an ink could be chosen at all.
                assertThat(Avatar.isValid(icon + "/" + tint))
                        .as(icon + "/" + tint + " is offered but refused")
                        .isTrue();

                for (int ink = 0; ink < Avatar.TINTS; ink++) {
                    assertThat(Avatar.isValid(icon + "/" + tint + "/" + ink))
                            .as(icon + "/" + tint + "/" + ink + " is offered but refused")
                            .isTrue();
                }
            }
        }
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(
            strings = {
                "pineapple/2", // an icon that does not exist
                "carrot/6", // one past the end of the tint ramp
                "carrot/-1",
                "carrot", // no tint
                "carrot/", // empty tint
                "carrot/x",
                "carrot/ 1", // Integer.parseInt is lenient about neither, but String.split is
                "carrot/01",
                "/0",
                "   ",
                // The ink, on the same terms as the tint one segment over.
                "carrot/2/x",
                "carrot/2/", // empty ink is not a neutral ink written oddly
                "carrot/2/6", // one past the end of the ramp
                "carrot/2/-1",
                "carrot/2/01",
                "carrot/2/ 1",
                "carrot/2/3/4", // a fourth segment
                // The thing this replaced. Nothing about it should be storable in
                // the column that used to hold exactly this.
                "https://lh3.googleusercontent.com/a/abc"
            })
    void rejectsAnythingElse(String token) {
        assertThat(Avatar.isValid(token)).as(token + " was accepted").isFalse();
    }

    /**
     * The two halves of the vocabulary agreeing.
     *
     * <p>The drawings live in the frontend's icon registry and the guard lives
     * here, so the names exist twice and can drift. The drift is one-directional
     * and silent: an icon the picker offers and this list is missing produces a
     * 400 on the one avatar nobody tested, months after the icon was added.
     *
     * <p>Reading the TypeScript is unusual for a backend test and is the point —
     * nothing else in either suite can see both lists at once.
     */
    @Test
    void offersExactlyWhatTheFrontendPickerDraws() throws IOException {
        // cwd is backend/ for every runner here: mvnw from backend, and the
        // surefire working directory is the module base.
        Path registry = Path.of("../frontend/src/app/core/avatar/avatar-token.ts");

        assertThat(registry)
                .as("the frontend avatar vocabulary has moved; this test needs its new path, not deleting")
                .isRegularFile();

        String source = Files.readString(registry, StandardCharsets.UTF_8);

        Matcher block = Pattern.compile("AVATAR_ICONS\\s*=\\s*\\[(.*?)]", Pattern.DOTALL)
                .matcher(source);
        assertThat(block.find()).as("AVATAR_ICONS is no longer an array literal").isTrue();

        List<String> drawn = Pattern.compile("'([a-z-]+)'")
                .matcher(block.group(1))
                .results()
                .map(result -> result.group(1))
                .toList();

        assertThat(drawn).as("no icon names were parsed, so this compared nothing").isNotEmpty();
        assertThat(Avatar.ICONS).containsExactlyInAnyOrderElementsOf(drawn);
    }

    @Test
    void agreesWithTheFrontendOnHowManyTintsThereAre() throws IOException {
        String source = Files.readString(
                Path.of("../frontend/src/app/core/avatar/avatar-token.ts"), StandardCharsets.UTF_8);

        Matcher hues = Pattern.compile("AVATAR_TINT_HUES\\s*=\\s*\\[(.*?)]", Pattern.DOTALL)
                .matcher(source);
        assertThat(hues.find()).as("AVATAR_TINT_HUES is no longer an array literal").isTrue();

        long count = Pattern.compile("\\d+").matcher(hues.group(1)).results().count();

        // A ramp longer here than there means the server accepts a tint the
        // frontend renders as an undefined hue, which is a grey disc.
        assertThat(count).isEqualTo(Avatar.TINTS);
    }
}
