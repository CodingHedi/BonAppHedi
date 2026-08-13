package fr.bonapphedi.web;

import fr.bonapphedi.api.RecipeChanged;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The sitemap and the per-language feeds (ADR 4).
 *
 * <p>The last of what that ADR promised in place of Angular SSR, and the half
 * that was still missing after the per-recipe metadata landed. Both documents
 * are for readers that never load the site — a crawler deciding what to fetch,
 * a feed reader deciding what is new — so both are written here rather than
 * assembled in a browser that neither of them runs.
 *
 * <p><b>Two feeds, not one.</b> The site is bilingual and its routes are
 * translated, so a single feed would either pick a language for every
 * subscriber or interleave two, and an item a reader cannot read is
 * indistinguishable from noise. The sitemap is one document because its job is
 * the opposite: to state that the two addresses are one recipe.
 *
 * <p>Cached like the metadata and dropped by the same event, which is what
 * keeps a withdrawn recipe from being advertised until the next restart.
 */
@RestController
public class FeedController {

    /** RSS 2.0 dates are RFC 822, the one format every reader must accept. */
    private static final DateTimeFormatter RFC_822 = DateTimeFormatter.RFC_1123_DATE_TIME;

    /**
     * The channel blurb, per language. Two strings rather than a lookup into
     * the frontend's translation files: those ship to the browser and this
     * never reaches one.
     */
    private static final Map<String, String> CHANNEL_DESCRIPTION = Map.of(
            "fr", "Un carnet de recettes tenu à la main.",
            "en", "A recipe notebook kept by hand.");

    private static final String TITLE = "Bon App' Hédi";

    private final FeedDao recipes;
    private final SiteUrls urls;

    /** Per document, so a crawl does not rebuild the sitemap on every request. */
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public FeedController(FeedDao recipes, SiteUrls urls) {
        this.recipes = recipes;
        this.urls = urls;
    }

    /**
     * Dropped whole, for the reason {@code RecipeChanged} carries no key: a
     * save can change the slug or the status that decides whether a recipe
     * belongs in these documents at all.
     */
    @EventListener
    public void forget(RecipeChanged changed) {
        cache.clear();
    }

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    ResponseEntity<String> sitemap() {
        return xml(cache.computeIfAbsent("sitemap", key -> renderSitemap()), MediaType.APPLICATION_XML);
    }

    @GetMapping(value = {"/fr/rss.xml", "/en/rss.xml"}, produces = "application/rss+xml")
    ResponseEntity<String> rss(jakarta.servlet.http.HttpServletRequest request) {
        String locale = request.getRequestURI().startsWith("/en/") ? "en" : "fr";
        return xml(
                cache.computeIfAbsent("rss:" + locale, key -> renderRss(locale)),
                MediaType.valueOf("application/rss+xml"));
    }

    /**
     * The charset is stated rather than left to the XML declaration. A parser
     * would recover from that, but the header is what anything reading the
     * bytes without parsing them reads first — and a feed title arriving as
     * "Chakchouka" mangled is the failure nobody sees, because it appears in
     * somebody else's reader.
     */
    private static ResponseEntity<String> xml(String body, MediaType type) {
        return ResponseEntity.ok()
                .contentType(new MediaType(type, StandardCharsets.UTF_8))
                .body(body);
    }

    private String renderSitemap() {
        StringBuilder out = new StringBuilder(4096);
        out.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
                .append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"")
                .append(" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n");

        // The two home pages first, and they are the whole of what is listed
        // besides recipes. Every other route is either behind a session, a
        // duplicate of a list a crawler can already reach, or the mentions
        // légales, which nobody should be invited to crawl.
        List<String> locales = List.of("fr", "en");
        for (String locale : locales) {
            out.append("  <url>\n    <loc>").append(Xml.escape(urls.home(locale))).append("</loc>\n");
            for (String other : locales) {
                out.append(alternate(other, urls.home(other)));
            }
            out.append("  </url>\n");
        }

        for (FeedDao.Entry entry : recipes.published()) {
            for (FeedDao.Translation t : entry.translations()) {
                out.append("  <url>\n    <loc>")
                        .append(Xml.escape(urls.recipe(t.locale(), t.slug())))
                        .append("</loc>\n");

                if (entry.publishedAt() != null) {
                    // Date only: <lastmod> takes a full timestamp happily, and
                    // the day is all this actually knows. published_at is when
                    // the recipe went up, not when it was last edited.
                    out.append("    <lastmod>")
                            .append(entry.publishedAt(), 0, 10)
                            .append("</lastmod>\n");
                }

                // Every alternate including this one, which is what the
                // annotation expects: the set is what the pages have in common,
                // not what each one points at.
                for (FeedDao.Translation alt : entry.translations()) {
                    out.append(alternate(alt.locale(), urls.recipe(alt.locale(), alt.slug())));
                }

                out.append("  </url>\n");
            }
        }

        return out.append("</urlset>\n").toString();
    }

    private static String alternate(String locale, String href) {
        return "    <xhtml:link rel=\"alternate\" hreflang=\"" + locale + "\" href=\"" + Xml.escape(href) + "\"/>\n";
    }

    private String renderRss(String locale) {
        String self = urls.home(locale) + "/rss.xml";

        StringBuilder out = new StringBuilder(4096);
        out.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
                .append("<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n")
                .append("  <channel>\n")
                .append("    <title>").append(Xml.escape(TITLE)).append("</title>\n")
                .append("    <link>").append(Xml.escape(urls.home(locale))).append("</link>\n")
                .append("    <description>")
                .append(Xml.escape(CHANNEL_DESCRIPTION.get(locale)))
                .append("</description>\n")
                .append("    <language>").append(locale).append("</language>\n")
                // Where the feed says it lives, so a reader that was handed the
                // address by something else can still recognise a move.
                .append("    <atom:link href=\"")
                .append(Xml.escape(self))
                .append("\" rel=\"self\" type=\"application/rss+xml\"/>\n");

        for (FeedDao.Entry entry : recipes.published()) {
            for (FeedDao.Translation t : entry.translations()) {
                if (!t.locale().equals(locale)) continue;

                String link = urls.recipe(locale, t.slug());
                out.append("    <item>\n")
                        .append("      <title>").append(Xml.escape(t.title())).append("</title>\n")
                        .append("      <link>").append(Xml.escape(link)).append("</link>\n")
                        // The address rather than the title, because this is
                        // what a reader keys "already seen" on: a corrected
                        // title would otherwise resurface the recipe as new.
                        .append("      <guid isPermaLink=\"true\">")
                        .append(Xml.escape(link))
                        .append("</guid>\n")
                        .append("      <description>")
                        .append(Xml.escape(t.excerpt()))
                        .append("</description>\n");

                if (entry.publishedAt() != null) {
                    out.append("      <pubDate>")
                            .append(RFC_822.format(Instant.parse(entry.publishedAt()).atOffset(ZoneOffset.UTC)))
                            .append("</pubDate>\n");
                }

                out.append("    </item>\n");
            }
        }

        return out.append("  </channel>\n</rss>\n").toString();
    }
}
