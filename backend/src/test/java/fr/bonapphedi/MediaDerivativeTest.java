package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Smaller copies of a photograph, made the first time one is asked for (ADR 8).
 *
 * <p>The measurement that prompted this is in {@code Docs/backlog.md}: a full
 * scroll of a 300-recipe catalogue transferred 76.6 MB, because every card
 * fetched a 1600px photograph to fill a box 190px tall. The fix is a
 * {@code srcset}, and these are the two halves of it — that the API says which
 * widths exist, and that asking for one produces it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-derivative.db?foreign_keys=on",
            // Its own directory, not the shared ./data/images the dev loop uses.
            // Two reasons, and the second is why this line exists at all: a test
            // should not leave files in the directory somebody is running the
            // site from, and — see the cleanup below — a derivative left behind
            // by the previous run makes every assertion here pass without the
            // generator being called once.
            "bah.media.dir=" + MediaDerivativeTest.MEDIA_DIR
        })
class MediaDerivativeTest {

    static final String MEDIA_DIR = "./target/test-derivative-media";

    @Autowired
    private MockMvc mvc;

    /**
     * Deletes the derivatives, keeping the seeded originals.
     *
     * <p>Without this the suite proves nothing on the second run. The controller
     * looks on disk before it generates — which is the whole design — so a file
     * written by the previous run satisfies every assertion in this class while
     * {@code derive} is never called. That was not hypothetical: it was found by
     * breaking {@code derive} on purpose and watching all eight tests pass.
     */
    @BeforeEach
    void clearDerivatives() throws java.io.IOException {
        java.nio.file.Path dir = java.nio.file.Path.of(MEDIA_DIR);
        if (!java.nio.file.Files.isDirectory(dir)) return;

        try (var files = java.nio.file.Files.list(dir)) {
            for (java.nio.file.Path file : files.toList()) {
                if (file.getFileName().toString().contains("@")) java.nio.file.Files.delete(file);
            }
        }
    }

    @Test
    void theListOffersEveryWidthSmallestFirst() throws Exception {
        mvc.perform(get("/api/recipes").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].image.sources.length()").value(3))
                .andExpect(jsonPath("$.items[0].image.sources[0].width").value(400))
                .andExpect(jsonPath("$.items[0].image.sources[0].url")
                        .value("/media/babka-au-chocolat@400.jpg"))
                .andExpect(jsonPath("$.items[0].image.sources[1].width").value(800))
                .andExpect(jsonPath("$.items[0].image.sources[2].width").value(1600))
                // The largest entry is the original, not a derivative of itself.
                .andExpect(jsonPath("$.items[0].image.sources[2].url")
                        .value("/media/babka-au-chocolat.jpg"));
    }

    @Test
    void theDetailOffersThemToo() throws Exception {
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.image.sources[0].url").value("/media/babka-au-chocolat@400.jpg"));
    }

    @Test
    void askingForADerivativeProducesOneOfThatWidth() throws Exception {
        byte[] body = mvc.perform(get("/media/babka-au-chocolat@400.jpg"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        // Decoded rather than merely counted: a 200 carrying the original bytes
        // under a smaller name would satisfy every other assertion here and
        // would be the whole feature silently not working.
        BufferedImage produced = ImageIO.read(new ByteArrayInputStream(body));
        assertThat(produced).isNotNull();
        assertThat(produced.getWidth()).isEqualTo(400);
    }

    @Test
    void theSmallerCopyIsActuallySmaller() throws Exception {
        int original = mvc.perform(get("/media/babka-au-chocolat.jpg"))
                .andReturn()
                .getResponse()
                .getContentAsByteArray()
                .length;

        int derived = mvc.perform(get("/media/babka-au-chocolat@400.jpg"))
                .andReturn()
                .getResponse()
                .getContentAsByteArray()
                .length;

        // The entire point of the change, stated as a number. It is the one
        // assertion here that would fail if `derive` returned the original.
        assertThat(derived).isLessThan(original / 2);
    }

    @Test
    void aDerivativeIsServedFromDiskTheSecondTime() throws Exception {
        byte[] first = mvc.perform(get("/media/babka-au-chocolat@800.jpg"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        byte[] second = mvc.perform(get("/media/babka-au-chocolat@800.jpg"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        // Byte-identical, which is what "written once and then an ordinary
        // file" means. Re-encoding per request would drift on quality settings
        // and would make the immutable cache header a lie.
        assertThat(second).isEqualTo(first);
    }

    @Test
    void aWidthNobodyOfferedIsNotGenerated() throws Exception {
        // The guard against filling the disk one query string at a time.
        mvc.perform(get("/media/babka-au-chocolat@37.jpg")).andExpect(status().isNotFound());
        mvc.perform(get("/media/babka-au-chocolat@1599.jpg")).andExpect(status().isNotFound());
    }

    @Test
    void aDerivativeOfNothingIsNotGenerated() throws Exception {
        mvc.perform(get("/media/no-such-recipe@400.jpg")).andExpect(status().isNotFound());
    }

    @Test
    void anUnknownNameIsStillNotFound() throws Exception {
        mvc.perform(get("/media/no-such-recipe.jpg")).andExpect(status().isNotFound());
    }
}
