package fr.bonapphedi.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Every absolute address the site claims for itself, built in one place.
 *
 * <p>Three layers now emit the same URLs at readers that cannot check them: the
 * canonical and hreflang tags in the served HTML, the sitemap, and the feeds.
 * Built separately they would drift silently and in the worst possible
 * direction — a sitemap inviting a crawler to an address whose own page names a
 * different canonical is a site arguing with itself, and nothing in the
 * application would fail.
 *
 * <p>The locale is in the path segment as well as the prefix, because the
 * routes are translated: {@code /fr/recettes/...} and {@code /en/recipes/...}.
 * That mapping is the part most likely to be re-derived by hand and got wrong.
 */
@Component
public class SiteUrls {

    private final String base;

    public SiteUrls(@Value("${bah.site.url:https://bonapphedi.fr}") String siteUrl) {
        this.base = siteUrl.endsWith("/") ? siteUrl.substring(0, siteUrl.length() - 1) : siteUrl;
    }

    /** No trailing slash, so callers concatenate a rooted path and get one separator. */
    public String base() {
        return base;
    }

    public String home(String locale) {
        return base + '/' + locale;
    }

    public String recipe(String locale, String slug) {
        return home(locale) + '/' + segment(locale) + '/' + slug;
    }

    /** French is the default for anything that is not English, matching the router. */
    public static String segment(String locale) {
        return "en".equals(locale) ? "recipes" : "recettes";
    }
}
