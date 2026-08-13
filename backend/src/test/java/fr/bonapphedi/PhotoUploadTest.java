package fr.bonapphedi;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Uploading a photograph, which is the first untrusted file the site accepts
 * (ADR 8).
 *
 * <p>Comments are text and are sanitized on write; an avatar is a token from a
 * closed set. A file is a different category, and ADR 8 named the price of
 * taking one: a size cap, a content type that is sniffed rather than believed, a
 * bounded output, and a serving path that cannot be walked. Each of those is a
 * test here, because each is the sort of thing a first pass on a personal site
 * skips.
 *
 * <p>Its own media directory as well as its own database. Without that these
 * tests write into, and delete from, the photographs the developer is looking at
 * in the dev server.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-upload.db?foreign_keys=on",
            "bah.media.dir=./target/test-media",
            // Small enough to test the refusal with a payload measured in
            // kilobytes rather than megabytes, and large enough to admit the
            // fixtures below — a 2400x1200 PNG is small but not tiny.
            "bah.media.max-upload-bytes=262144",
            // Above the 2.88 megapixels of the largest fixture and below the
            // 5.76 of the one used to trip it, so the guard is tested with an
            // image that decodes perfectly well and is simply too big.
            "bah.media.max-pixels=4000000"
        })
class PhotoUploadTest {

    @Autowired
    private MockMvc mvc;

    // --- the happy path ---------------------------------------------------

    @Test
    void storesThePhotographAndServesItFromOurOwnOrigin() throws Exception {
        String url = upload("babka", png(800, 400, Color.RED));

        Assertions.assertThat(url).startsWith("/media/").endsWith(".jpg");

        // Served back, and as a JPEG whatever went in. Re-encoding is not a
        // formality: it is what drops everything the camera wrote into the file,
        // and a recipe photograph taken on a phone carries GPS coordinates of
        // the kitchen it was taken in.
        mvc.perform(get(url))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.IMAGE_JPEG));
    }

    @Test
    void putsThePhotographOnTheRecipeTheApiServes() throws Exception {
        String url = upload("shakshuka", png(800, 400, Color.BLUE));

        mvc.perform(get("/api/recipes/chakchouka").param("locale", "fr"))
                .andExpect(jsonPath("$.image.url").value(url))
                // Alt is assembled from the translated title rather than
                // uploaded, which is why the photograph is on `recipe` and not
                // on `recipe_translation`.
                .andExpect(jsonPath("$.image.alt").value("Chakchouka"));
    }

    @Test
    void recordsTheGeometryTheLayoutNeedsToReserveItsBox() throws Exception {
        // image.ts reserves its box from an aspect ratio so a photograph costs
        // zero layout shift, and it can only do that if the dimensions arrive
        // with the JSON rather than with the file.
        upload("sourdough", png(2400, 1200, Color.GREEN));

        mvc.perform(get("/api/recipes/pain-au-levain").param("locale", "fr"))
                .andExpect(jsonPath("$.image.width").value(1600))
                .andExpect(jsonPath("$.image.height").value(800))
                .andExpect(jsonPath("$.image.dominant").value(org.hamcrest.Matchers.matchesPattern("#[0-9a-f]{6}")));
    }

    @Test
    void leavesASmallPhotographTheSizeItIs() throws Exception {
        // Only ever down. Enlarging a small photograph invents detail and makes
        // the file bigger to say less.
        upload("beef-tagine", png(320, 200, Color.ORANGE));

        mvc.perform(get("/api/recipes/tajine-de-boeuf").param("locale", "fr"))
                .andExpect(jsonPath("$.image.width").value(320))
                .andExpect(jsonPath("$.image.height").value(200));
    }

    // --- the limits ADR 8 said were not optional --------------------------

    @Test
    void refusesSomethingThatIsNotAnImageHoweverItIsLabelled() throws Exception {
        // The whole point of sniffing. Both the filename and the declared
        // content type say JPEG, and the bytes are a shell script.
        MockMultipartFile lie = new MockMultipartFile(
                "file", "photo.jpg", MediaType.IMAGE_JPEG_VALUE, "#!/bin/sh\nrm -rf /\n".getBytes(StandardCharsets.UTF_8));

        mvc.perform(put("babka", lie)).andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void refusesAFileOverTheCap() throws Exception {
        MockMultipartFile huge =
                new MockMultipartFile("file", "big.jpg", MediaType.IMAGE_JPEG_VALUE, new byte[300_000]);

        mvc.perform(put("babka", huge)).andExpect(status().isPayloadTooLarge());
    }

    @Test
    void refusesAnImageThatWouldDecodeIntoTooManyPixels() throws Exception {
        // A flat colour compresses to almost nothing, so this clears the size
        // cap comfortably and would still allocate a bitmap far larger than the
        // file. The cap on bytes does not see it coming, which is the entire
        // reason the pixel guard exists.
        //
        // Deliberately an image that decodes. A malformed header would be
        // refused by the decoder itself and the test would pass with the guard
        // deleted, proving nothing.
        MockMultipartFile bomb =
                new MockMultipartFile("file", "bomb.png", MediaType.IMAGE_PNG_VALUE, png(2400, 2400, Color.WHITE));

        Assertions.assertThat(bomb.getSize()).isLessThan(262144);
        mvc.perform(put("babka", bomb)).andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void refusesAnEmptyUpload() throws Exception {
        MockMultipartFile nothing = new MockMultipartFile("file", "empty.jpg", MediaType.IMAGE_JPEG_VALUE, new byte[0]);

        mvc.perform(put("babka", nothing)).andExpect(status().isBadRequest());
    }

    @Test
    void refusesARecipeThatDoesNotExist() throws Exception {
        mvc.perform(put("no-such-recipe", file(png(80, 80, Color.PINK)))).andExpect(status().isNotFound());
    }

    // --- replacing and removing -------------------------------------------

    @Test
    void replacingLeavesNothingBehind() throws Exception {
        String first = upload("basque-cheesecake", png(400, 400, Color.CYAN));
        String second = upload("basque-cheesecake", png(400, 400, Color.MAGENTA));

        Assertions.assertThat(second).isNotEqualTo(first);
        // Uploads are the one part of this site's state that grows without
        // bound, and every copy of it has to be backed up from now on.
        mvc.perform(get(first)).andExpect(status().isNotFound());
        mvc.perform(get(second)).andExpect(status().isOk());
    }

    @Test
    void removingThePhotographReturnsTheRecipeToItsPlaceholder() throws Exception {
        upload("babka", png(400, 400, Color.YELLOW));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/admin/recipes/babka/photo")
                        .with(oauth2Login().oauth2User(admin()))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(jsonPath("$.image.url").doesNotExist());
    }

    // --- the wiring that is easy to leave out ------------------------------

    @Test
    void theSharedCardPictureFollowsTheUpload() throws Exception {
        // og:image is most of the reason a link preview is worth having, and
        // IndexHtmlController caches the whole spliced head. Without the save
        // publishing a change, a new photograph would reach the site and never
        // reach anything that shares it.
        //
        // The page is fetched first, and that is the whole test. Asking only
        // afterwards would render a head that was never cached, and would pass
        // just as happily with the event removed.
        mvc.perform(get("/fr/recettes/tajine-de-boeuf")).andExpect(status().isOk());

        String url = upload("beef-tagine", png(600, 400, Color.DARK_GRAY));

        mvc.perform(get("/fr/recettes/tajine-de-boeuf"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("property=\"og:image\"")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString(url)));
    }

    // --- helpers ----------------------------------------------------------

    /** Uploads, asserts it was accepted, and hands back the url it was given. */
    private String upload(String key, byte[] image) throws Exception {
        String json = mvc.perform(put(key, file(image)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return com.jayway.jsonpath.JsonPath.read(json, "$.url");
    }

    private static MockMultipartFile file(byte[] image) {
        return new MockMultipartFile("file", "photo.png", MediaType.IMAGE_PNG_VALUE, image);
    }

    /**
     * {@code multipart()} posts by default, and this endpoint replaces rather
     * than appends — the same reason {@code PUT /api/admin/recipes} is a PUT.
     */
    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder put(
            String key, MockMultipartFile file) {
        return multipart(HttpMethod.PUT, "/api/admin/recipes/" + key + "/photo")
                .file(file)
                .with(oauth2Login().oauth2User(admin()))
                .with(csrf());
    }

    private static byte[] png(int width, int height, Color colour) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(colour);
        g.fillRect(0, 0, width, height);
        g.dispose();

        var out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private static AppUserPrincipal admin() {
        return new AppUserPrincipal(new AppUser(1, "google", "g-1", "Hédi", "hedi@example.com", true));
    }
}
