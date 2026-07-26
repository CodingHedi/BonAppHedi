package fr.bonapphedi.content;

import java.util.List;
import java.util.Set;
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.springframework.stereotype.Component;

/**
 * Markdown in, safe HTML out. The one place stored content is rendered.
 *
 * <p>Runs on write rather than on read, so the database holds only HTML that has
 * already been through the policy below. The read-time saving the contract cites
 * is negligible at this size; the reason that matters is that a comment body is
 * untrusted input from a stranger, and neutralising it once at the boundary is
 * stronger than storing it raw and trusting every client to clean it on the way
 * out.
 *
 * <p><strong>The allowlist mirrors the DOMPurify configuration in
 * {@code shared/ui/markdown/markdown.ts}.</strong> The frontend keeps its own
 * renderer for live previews — the admin editor and the comment preview tab have
 * no server to ask — so the same markdown is rendered in two places. If the two
 * allowlists drift, the same text renders differently depending on which path
 * produced it, and the looser of the two silently becomes the real policy. Any
 * change here needs the same change there.
 */
@Component
public class MarkdownRenderer {

    private static final List<org.commonmark.Extension> EXTENSIONS =
            List.of(TablesExtension.create(), StrikethroughExtension.create());

    private static final Parser PARSER = Parser.builder().extensions(EXTENSIONS).build();

    private static final HtmlRenderer RENDERER = HtmlRenderer.builder()
            .extensions(EXTENSIONS)
            /*
             * Raw HTML is passed through to the sanitizer rather than escaped
             * here, and that is a deliberate choice between two safe options.
             *
             * Escaping would be belt-and-braces, but it would also diverge from
             * the frontend: `marked` passes inline HTML through and DOMPurify
             * then strips what is not allowed, so <b>bold</b> renders bold in
             * the comment preview. Escaping here would store it as the literal
             * text "<b>bold</b>" — the same comment looking different before and
             * after posting, which reads as a bug and is the exact divergence
             * this class exists to avoid.
             *
             * Letting it through means the sanitizer below is the boundary,
             * which is what it is built to be. Angular's own sanitizer still
             * sits behind it on the binding.
             */
            .escapeHtml(false)
            .build();

    /**
     * Deliberately narrow, and identical to the frontend's list.
     *
     * <p>Notable omissions, none accidental:
     * <ul>
     *   <li>{@code h1} — a body must not plant a second page heading. h2-h4 only.
     *   <li>{@code iframe} — the recipe video is a first-party facade component.
     *       Allowing frames would let any commenter load a third party onto
     *       somebody else's page, which is the exact thing that facade exists to
     *       prevent.
     *   <li>{@code style} and {@code data-*} — {@code position:fixed;inset:0} is
     *       a clickjacking primitive, not formatting.
     * </ul>
     */
    private static final PolicyFactory POLICY = new HtmlPolicyBuilder()
            .allowElements(
                    "p", "br", "strong", "em", "del", "code", "pre", "blockquote",
                    "ul", "ol", "li", "a", "h2", "h3", "h4", "hr", "img",
                    "table", "thead", "tbody", "tr", "th", "td")
            .allowAttributes("title").globally()
            .allowAttributes("href").onElements("a")
            .allowAttributes("src", "alt").onElements("img")
            // http and https only. Without this, javascript: and data: URLs are
            // both spellable in a plain markdown link.
            .allowUrlProtocols("http", "https")
            // Anything a stranger links to opens away from the page, and
            // rel=noopener is what stops the opened document reaching back
            // through window.opener.
            .requireRelNofollowOnLinks()
            .allowStandardUrlProtocols()
            .toFactory();

    /** Empty for empty input: a recipe with no body is normal, not an error. */
    public String render(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return "";
        }

        String unsafe = RENDERER.render(PARSER.parse(markdown));
        String safe = POLICY.sanitize(unsafe);

        return withNoopener(safe);
    }

    /**
     * The OWASP builder adds {@code rel="nofollow"} but leaves the tab-napping
     * half to the caller, and {@code target} is not in the allowlist, so links
     * open in place unless told otherwise. Adding both here keeps the two facts
     * — where a link opens, and what it may do once open — in one place rather
     * than split between a policy and a template.
     */
    private static String withNoopener(String html) {
        return html.replace("rel=\"nofollow\"", "rel=\"nofollow noopener noreferrer\" target=\"_blank\"");
    }

    /** Kept so the policy can be asserted directly rather than inferred. */
    static Set<String> allowedElements() {
        return Set.of(
                "p", "br", "strong", "em", "del", "code", "pre", "blockquote",
                "ul", "ol", "li", "a", "h2", "h3", "h4", "hr", "img",
                "table", "thead", "tbody", "tr", "th", "td");
    }
}
