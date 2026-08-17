package fr.bonapphedi.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The naming and the ladder, which decide what a browser is allowed to ask for.
 *
 * <p>Plain JUnit and no Spring: these are the parts that can be checked
 * exhaustively, and the cases that matter — an ambiguous name, a width nobody
 * offered, a photograph too small to have derivatives — are all reachable
 * without a database or a file on disk.
 */
class MediaNamingTest {

    @Test
    void aDerivativeNameKeepsTheExtension() {
        assertThat(MediaStorage.derivativeName("babka.jpg", 400)).isEqualTo("babka@400.jpg");
        assertThat(MediaStorage.derivativeName("babka-au-chocolat-1a2b3c4d.jpg", 800))
                .isEqualTo("babka-au-chocolat-1a2b3c4d@800.jpg");
    }

    @Test
    void aDerivativeNameRoundTrips() {
        for (int width : MediaStorage.WIDTH_LADDER) {
            String name = MediaStorage.derivativeName("tajine-de-boeuf.jpg", width);
            assertThat(MediaStorage.parseDerivative(name))
                    .contains(new MediaStorage.Derivative("tajine-de-boeuf.jpg", width));
        }
    }

    @Test
    void aHyphenatedOriginalIsNotMistakenForADerivative() {
        // The reason the separator is '@'. Uploads are named <slug>-<digest>.jpg
        // and slugs contain hyphens, so a hyphen here would make this name
        // ambiguous: a derivative of "soupe.jpg", or the original for a recipe
        // whose slug ends in 400. It has to read as an original.
        assertThat(MediaStorage.parseDerivative("soupe-400.jpg")).isEmpty();
        assertThat(MediaStorage.parseDerivative("babka-au-chocolat.jpg")).isEmpty();
    }

    @Test
    void aWidthOffTheLadderIsNotADerivative() {
        // This is the guard that stops the generator being an invitation to
        // fill the disk one URL at a time.
        assertThat(MediaStorage.parseDerivative("babka@37.jpg")).isEmpty();
        assertThat(MediaStorage.parseDerivative("babka@401.jpg")).isEmpty();
        assertThat(MediaStorage.parseDerivative("babka@99999.jpg")).isEmpty();
    }

    @Test
    void rubbishIsNotADerivative() {
        assertThat(MediaStorage.parseDerivative("babka@.jpg")).isEmpty();
        assertThat(MediaStorage.parseDerivative("babka@four.jpg")).isEmpty();
        assertThat(MediaStorage.parseDerivative("@400.jpg")).isEmpty();
        assertThat(MediaStorage.parseDerivative("babka@400")).isEmpty();
        assertThat(MediaStorage.parseDerivative(null)).isEmpty();
    }

    @Test
    void theLadderStopsBelowTheStoredWidth() {
        assertThat(MediaStorage.widthsFor(1600)).isEqualTo(List.of(400, 800, 1600));
        assertThat(MediaStorage.widthsFor(1205)).isEqualTo(List.of(400, 800, 1205));
    }

    @Test
    void aPhotographTooSmallToDivideIsOfferedOnceOnly() {
        // Upscaling costs bytes to say less, PhotoIngest.derive refuses to do
        // it, and offering a width here would promise a file that will never be
        // written. 400 is excluded at exactly 400 for the same reason: the
        // derivative would be a byte-for-byte second copy under another name.
        assertThat(MediaStorage.widthsFor(350)).isEqualTo(List.of(350));
        assertThat(MediaStorage.widthsFor(400)).isEqualTo(List.of(400));
        assertThat(MediaStorage.widthsFor(800)).isEqualTo(List.of(400, 800));
    }
}
