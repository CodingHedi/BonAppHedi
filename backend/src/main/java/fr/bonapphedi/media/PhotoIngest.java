package fr.bonapphedi.media;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Turns whatever was uploaded into the one kind of file this site serves.
 *
 * <p>Nothing that arrives here is trusted, including the parts that look like
 * facts. The filename and the declared content type are both written by the
 * caller, so neither decides anything: what makes a file an image here is that
 * an {@link ImageIO} reader recognises it, and what it becomes is a JPEG this
 * class encoded itself.
 *
 * <p><b>Re-encoding is the security step, not a formality.</b> Copying the
 * bytes through would keep every EXIF field the camera wrote, and a photograph
 * taken on a phone in a kitchen carries that kitchen's GPS coordinates.
 * Decoding to pixels and writing a new file drops all of it, along with any
 * payload hidden in a segment a decoder elsewhere might read.
 *
 * <p><b>One output size, and that is narrower than ADR 8 imagined.</b> That ADR
 * asks for "a bounded set of generated derivative sizes"; the bound here is
 * one, because nothing consumes a second. {@code image.ts} renders a single
 * {@code <img>} with no {@code srcset}, so a second file would be storage and
 * code with no reader — and this is the one place a second size can be added
 * when the markup asks for it.
 */
@Component
public class PhotoIngest {

    /**
     * The longest side, matching the six seeded photographs exactly (see
     * {@code Docs/photo-mockup.md}), so an uploaded photograph and a seeded one
     * are the same kind of file rather than two conventions in one directory.
     */
    private static final int LONGEST_SIDE = 1600;

    private static final float QUALITY = 0.78f;

    private final long maxBytes;
    private final long maxPixels;

    public PhotoIngest(
            @Value("${bah.media.max-upload-bytes:8388608}") long maxBytes,
            @Value("${bah.media.max-pixels:50000000}") long maxPixels) {
        this.maxBytes = maxBytes;
        this.maxPixels = maxPixels;
    }

    /** What the recipe row needs, and what the response hands back. */
    public record Photograph(byte[] jpeg, int width, int height, String dominant) {}

    /** The upload was refused, with the status the caller should answer. */
    public static class Refused extends RuntimeException {
        public final org.springframework.http.HttpStatus status;

        Refused(org.springframework.http.HttpStatus status, String message) {
            super(message);
            this.status = status;
        }
    }

    public long maxBytes() {
        return maxBytes;
    }

    public Photograph accept(byte[] uploaded) {
        if (uploaded == null || uploaded.length == 0) {
            throw new Refused(org.springframework.http.HttpStatus.BAD_REQUEST, "the upload was empty");
        }
        if (uploaded.length > maxBytes) {
            throw new Refused(
                    org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                    "a photograph may be at most " + maxBytes + " bytes");
        }

        // Dimensions before pixels, deliberately. A few hundred bytes can
        // declare 30000x30000 and cost gigabytes to decode, and the size cap
        // above does not see it coming: the expense is in the bitmap, not in
        // what arrived over the wire.
        measure(uploaded);

        BufferedImage source;
        try {
            source = ImageIO.read(new ByteArrayInputStream(uploaded));
        } catch (IOException e) {
            throw new Refused(org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unreadable image");
        }
        if (source == null) {
            throw new Refused(
                    org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "no image decoder recognised the file");
        }

        BufferedImage scaled = scale(source);
        return new Photograph(encode(scaled), scaled.getWidth(), scaled.getHeight(), dominant(scaled));
    }

    /** Reads the header only, which is all a reader needs to report a size. */
    private void measure(byte[] uploaded) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(uploaded))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new Refused(
                        org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                        "no image decoder recognised the file");
            }

            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels > maxPixels) {
                    throw new Refused(
                            org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                            "a photograph may be at most " + maxPixels + " pixels");
                }
            } finally {
                reader.dispose();
            }
        } catch (IOException e) {
            throw new Refused(org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unreadable image");
        }
    }

    /**
     * Down only. Enlarging a small photograph invents detail and makes the file
     * bigger in order to say less.
     */
    private static BufferedImage scale(BufferedImage source) {
        int width = source.getWidth();
        int height = source.getHeight();
        int longest = Math.max(width, height);

        int targetWidth = width;
        int targetHeight = height;
        if (longest > LONGEST_SIDE) {
            double ratio = (double) LONGEST_SIDE / longest;
            targetWidth = Math.max(1, (int) Math.round(width * ratio));
            targetHeight = Math.max(1, (int) Math.round(height * ratio));
        }

        // TYPE_INT_RGB and a white ground in every case, not only when scaling.
        // JPEG has no alpha, and a transparent PNG written straight out comes
        // back with black where the transparency was.
        BufferedImage target = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, targetWidth, targetHeight);
        g.drawImage(source, 0, 0, targetWidth, targetHeight, null);
        g.dispose();

        return target;
    }

    private static byte[] encode(BufferedImage image) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam params = writer.getDefaultWriteParam();
        params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        params.setCompressionQuality(QUALITY);

        var out = new ByteArrayOutputStream();
        try (var stream = new MemoryCacheImageOutputStream(out)) {
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), params);
        } catch (IOException e) {
            throw new Refused(
                    org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE, "the image could not be re-encoded");
        } finally {
            writer.dispose();
        }

        return out.toByteArray();
    }

    /**
     * The average colour, which is what tints the box while the photograph
     * loads so it fills in rather than flashing an empty panel.
     *
     * <p>Sampled on a grid rather than every pixel: at 1600px the two agree to
     * well within a step of the eight bits the answer is rounded to.
     */
    private static String dominant(BufferedImage image) {
        int step = Math.max(1, Math.max(image.getWidth(), image.getHeight()) / 64);
        long red = 0;
        long green = 0;
        long blue = 0;
        long counted = 0;

        for (int y = 0; y < image.getHeight(); y += step) {
            for (int x = 0; x < image.getWidth(); x += step) {
                int rgb = image.getRGB(x, y);
                red += (rgb >> 16) & 0xff;
                green += (rgb >> 8) & 0xff;
                blue += rgb & 0xff;
                counted++;
            }
        }

        return String.format("#%02x%02x%02x", red / counted, green / counted, blue / counted);
    }
}
