package fr.bonapphedi.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import fr.bonapphedi.api.Dto;
import fr.bonapphedi.api.RecipeChanged;
import fr.bonapphedi.api.RecipeQueryDao;
import fr.bonapphedi.api.Viewer;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Per-recipe metadata spliced into the served HTML (ADR 4).
 *
 * <p>The site is a client-rendered SPA, so anything that does not run
 * JavaScript — a link unfurler, a smaller crawler — used to get an empty shell
 * with the site's generic title. ADR 4 chose this over Angular SSR to avoid a
 * second runtime beside the JVM on a small VPS, and this is where that choice
 * gets paid for.
 *
 * <p>A controller mapping beats the resource chain in {@code SpaResourceConfig},
 * so these four URLs arrive here and everything else still falls through to
 * {@code index.html} untouched.
 *
 * <p><b>Only published recipes get metadata.</b> An unknown slug and a draft
 * both fall back to the plain shell, and the Angular router renders its own 404
 * over it. Emitting a title and a JSON-LD block for a draft would publish it to
 * precisely the audience this layer exists to serve.
 */
@RestController
public class IndexHtmlController {

    /** Where the {@code <head>} ends, and therefore where everything is spliced. */
    private static final String HEAD_END = "</head>";

    private final RecipeQueryDao recipes;
    private final ObjectMapper json;
    private final String siteUrl;

    /**
     * Read once at startup. Null when the jar was built without the frontend —
     * {@code mvnw spring-boot:run} during backend work — in which case this
     * controller stands aside rather than 500ing.
     */
    private final String shell;

    /**
     * Per (slug, locale). The shell is immutable for the life of the process and
     * a recipe changes only on an admin save, so the expensive half — reading
     * the recipe and building the JSON-LD — is done once per recipe rather than
     * once per crawl.
     */
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public IndexHtmlController(
            RecipeQueryDao recipes,
            ObjectMapper json,
            ResourceLoader loader,
            @Value("${bah.site.url:https://bonapphedi.fr}") String siteUrl) {
        this.recipes = recipes;
        this.json = json;
        this.siteUrl = siteUrl.endsWith("/") ? siteUrl.substring(0, siteUrl.length() - 1) : siteUrl;
        this.shell = readShell(loader);
    }

    private static String readShell(ResourceLoader loader) {
        try {
            var resource = loader.getResource("classpath:/static/index.html");
            if (!resource.exists()) return null;
            return resource.getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * Invalidated on save, which is the only thing that can change a recipe.
     *
     * <p>Driven by an event rather than called from the admin controller, so
     * that class keeps knowing only about saving. Without it a stale
     * {@code <title>} outlives the edit that changed it until the next restart,
     * and nothing in the admin would show it: the editor reads the API, never
     * the served HTML.
     */
    @EventListener
    public void forget(RecipeChanged changed) {
        cache.clear();
    }

    @GetMapping(
            value = {"/fr/recettes/{slug}", "/en/recipes/{slug}"},
            produces = MediaType.TEXT_HTML_VALUE)
    ResponseEntity<String> recipePage(@PathVariable String slug, jakarta.servlet.http.HttpServletRequest request) {
        if (shell == null) return ResponseEntity.notFound().build();

        String locale = request.getRequestURI().startsWith("/en/") ? "en" : "fr";
        String page = cache.computeIfAbsent(locale + ':' + slug, key -> render(slug, locale));

        // Charset stated rather than left to be guessed. The shell carries
        // <meta charset="utf-8"> and a browser would recover from that, but the
        // header is what anything not parsing the document reads — and "tressée"
        // arriving as "tressÃ©e" in a link preview is the whole feature failing
        // in the one place nobody looks.
        return ResponseEntity.ok()
                .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                .body(page);
    }

    private String render(String slug, String locale) {
        Optional<Dto.RecipeDetail> found = recipes.bySlug(slug, locale, Viewer.anonymous());
        // The shell unchanged: Angular boots and renders its own 404.
        if (found.isEmpty()) return shell;

        Dto.RecipeDetail r = found.get();
        String url = siteUrl + '/' + locale + '/' + (locale.equals("en") ? "recipes" : "recettes") + '/' + r.slug();

        StringBuilder head = new StringBuilder(1024);
        head.append("<meta name=\"description\" content=\"").append(escape(r.excerpt())).append("\">\n");
        head.append("<link rel=\"canonical\" href=\"").append(escape(url)).append("\">\n");

        for (Dto.LocaleAlternate alt : r.alternates()) {
            String other = alt.locale();
            String segment = other.equals("en") ? "recipes" : "recettes";
            head.append("<link rel=\"alternate\" hreflang=\"").append(other)
                    .append("\" href=\"").append(escape(siteUrl + '/' + other + '/' + segment + '/' + alt.slug()))
                    .append("\">\n");
        }

        head.append(meta("property", "og:type", "article"));
        head.append(meta("property", "og:title", r.title()));
        head.append(meta("property", "og:description", r.excerpt()));
        head.append(meta("property", "og:url", url));
        head.append(meta("property", "og:locale", locale));
        head.append(meta("name", "twitter:card", "summary_large_image"));
        head.append(meta("name", "twitter:title", r.title()));
        head.append(meta("name", "twitter:description", r.excerpt()));

        if (r.image() != null && r.image().url() != null) {
            String image = siteUrl + r.image().url();
            head.append(meta("property", "og:image", image));
            head.append(meta("property", "og:image:alt", r.image().alt()));
            head.append(meta("name", "twitter:image", image));
        }

        head.append("<script type=\"application/ld+json\">").append(jsonLd(r, url)).append("</script>\n");

        // The title is a replacement rather than an addition: two <title>
        // elements are not a richer page, they are one page with a title and
        // some ignored markup.
        String withTitle = shell.replaceFirst(
                "<title>.*?</title>",
                java.util.regex.Matcher.quoteReplacement("<title>" + escape(r.title()) + " · Bon App' Hédi</title>"));

        return withTitle.replace(HEAD_END, head + HEAD_END);
    }

    private String jsonLd(Dto.RecipeDetail r, String url) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("@context", "https://schema.org");
        node.put("@type", "Recipe");
        node.put("name", r.title());
        node.put("description", r.excerpt());
        node.put("url", url);
        node.put("datePublished", r.publishedAt());
        node.put("author", Map.of("@type", "Person", "name", r.author().displayName()));
        node.put("recipeYield", String.valueOf(r.baseServings()));

        if (r.image() != null && r.image().url() != null) {
            node.put("image", List.of(siteUrl + r.image().url()));
        }
        // ISO-8601 durations, which is the only form Google accepts.
        if (r.prepMinutes() != null) node.put("prepTime", "PT" + r.prepMinutes() + "M");
        if (r.cookMinutes() != null) node.put("cookTime", "PT" + r.cookMinutes() + "M");

        node.put("recipeIngredient", r.ingredients().stream().map(IndexHtmlController::ingredient).toList());
        node.put("recipeInstructions", r.steps().stream()
                .map(s -> Map.of("@type", "HowToStep", "text", s.body()))
                .toList());

        if (r.rating() != null && r.rating().count() > 0) {
            node.put("aggregateRating", Map.of(
                    "@type", "AggregateRating",
                    "ratingValue", r.rating().average(),
                    "ratingCount", r.rating().count()));
        }

        try {
            // Escaped so a "</script>" inside any field cannot end the block and
            // turn the rest of the page into markup. The value stays valid JSON:
            // < is what a JSON parser reads as '<'.
            return json.writeValueAsString(node).replace("<", "\\u003c");
        } catch (Exception e) {
            return "{}";
        }
    }

    private static String ingredient(Dto.Ingredient i) {
        String quantity = i.baseQuantity() == null
                ? ""
                : trimTrailingZero(i.baseQuantity()) + (i.unit().isBlank() ? " " : i.unit() + " ");
        return (quantity + i.name()).trim();
    }

    private static String trimTrailingZero(double value) {
        return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
    }

    private static String meta(String keyAttr, String key, String value) {
        return "<meta " + keyAttr + "=\"" + key + "\" content=\"" + escape(value) + "\">\n";
    }

    /** Attribute-safe. These strings are author-controlled, not visitor-controlled, but they are still content. */
    private static String escape(String value) {
        return value == null
                ? ""
                : value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
