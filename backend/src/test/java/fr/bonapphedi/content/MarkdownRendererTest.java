package fr.bonapphedi.content;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The write-boundary sanitizer.
 *
 * <p>This is the primary defence for stored content, not a convenience. The
 * frontend renders the {@code [html]} input through {@code innerHTML} without
 * running DOMPurify over it — it only sanitizes the markdown path — so whatever
 * survives here is what reaches a reader's browser. Angular's own sanitizer sits
 * behind it as a backstop, which makes this defence in depth rather than a
 * single point of trust, but the first line is here.
 *
 * <p>The allowlist deliberately mirrors the DOMPurify configuration in
 * {@code shared/ui/markdown/markdown.ts}. Where the two disagree, the same
 * comment would render differently depending on which path produced it, and the
 * looser of the two becomes the real policy.
 */
class MarkdownRendererTest {

    private final MarkdownRenderer renderer = new MarkdownRenderer();

    // --- rendering --------------------------------------------------------

    @Test
    void rendersBasicMarkdown() {
        assertThat(renderer.render("**Excellente** recette."))
                .contains("<strong>Excellente</strong>");
    }

    @Test
    void rendersListsAndQuotes() {
        assertThat(renderer.render("- one\n- two")).contains("<ul>").contains("<li>one</li>");
        assertThat(renderer.render("> quoted")).contains("<blockquote>");
    }

    @Test
    void rendersGfmTablesAndStrikethrough() {
        // The allowlist admits table markup and <del>, so the parser has to be
        // able to produce them or those entries are decoration.
        assertThat(renderer.render("| a | b |\n|---|---|\n| 1 | 2 |")).contains("<table>");
        assertThat(renderer.render("~~gone~~")).contains("<del>");
    }

    @Test
    void rendersEveryMarkTheCommentToolbarCanProduce() {
        // The comment composer has a formatting toolbar, and its six buttons emit
        // exactly this syntax. The failure being guarded is silent and one-sided:
        // the Preview tab renders in the browser and the stored comment is
        // rendered here, so a mark the two disagree about looks correct right up
        // until it is posted, and then quietly loses its formatting.
        //
        // Anything added to MARKS in comment-section.ts belongs here too.
        assertThat(renderer.render("**gras**")).contains("<strong>gras</strong>");
        assertThat(renderer.render("*penché*")).contains("<em>penché</em>");
        assertThat(renderer.render("~~barré~~")).contains("<del>barré</del>");
        assertThat(renderer.render("[texte](https://example.com)")).contains("href=\"https://example.com\"");
        assertThat(renderer.render("- une puce")).contains("<ul>").contains("<li>une puce</li>");
        assertThat(renderer.render("> une citation")).contains("<blockquote>");
    }

    @Test
    void keepsAccentedFrenchIntact() {
        String html = renderer.render("Pétrir jusqu'à obtenir une pâte souple.");

        // Accented characters survive as themselves — the seed is full of them,
        // and an encoder that mangled é would be obvious on every recipe.
        assertThat(html).contains("Pétrir").contains("à obtenir une pâte souple.");
        // The apostrophe comes back as a character reference. That is the
        // sanitizer being conservative, not a defect: it renders as ' in a
        // browser, and the alternative is trusting quote handling everywhere.
        assertThat(html).contains("jusqu&#39;");
    }

    @Test
    void returnsEmptyForNothing() {
        assertThat(renderer.render(null)).isEmpty();
        assertThat(renderer.render("   ")).isEmpty();
    }

    // --- sanitizing -------------------------------------------------------

    @Test
    void stripsScriptTagsAndTheirContents() {
        String html = renderer.render("Hello <script>alert(1)</script> world");

        // Removed outright, not escaped into visible text: the element is not on
        // the allowlist, and the sanitizer drops a script's body with it.
        assertThat(html).doesNotContain("<script").doesNotContain("alert(1)");
        assertThat(html).contains("Hello");
    }

    @Test
    void stripsEventHandlerAttributes() {
        String html = renderer.render("<p onclick=\"steal()\">click me</p>");

        // The paragraph survives because <p> is allowed; the handler does not,
        // because no attribute is allowed unless it is named.
        assertThat(html).doesNotContain("onclick").doesNotContain("steal()");
        assertThat(html).contains("click me");
    }

    @Test
    void refusesJavascriptUrls() {
        // The classic one. A link is allowed; a link that executes is not.
        String html = renderer.render("[tap](javascript:alert(1))");

        assertThat(html).doesNotContain("javascript:");
    }

    @Test
    void refusesIframesEvenThoughTheSiteEmbedsVideo() {
        // The recipe video is a first-party facade component, not something a
        // comment author may summon. Allowing frames here would let any
        // commenter load a third party on someone else's page.
        assertThat(renderer.render("<iframe src=\"https://example.com\"></iframe>"))
                .doesNotContain("<iframe");
    }

    @Test
    void refusesStyleAndDataAttributes() {
        String html = renderer.render("<p style=\"position:fixed;inset:0\" data-x=\"1\">hi</p>");

        // Absolute positioning over the whole viewport is a clickjacking
        // primitive, not formatting.
        assertThat(html).doesNotContain("style=").doesNotContain("data-x");
    }

    @Test
    void doesNotAllowH1() {
        // h2/h3/h4 only, matching the frontend allowlist: a comment or a recipe
        // body must not be able to plant a second page heading.
        String html = renderer.render("# Shouting\n\n## Reasonable");

        assertThat(html).doesNotContain("<h1").contains("<h2");
    }

    @Test
    void keepsLinksButMakesThemSafeToOpen() {
        String html = renderer.render("[a link](https://example.com)");

        assertThat(html).contains("href=\"https://example.com\"");
        // A link the sanitizer produces opens in a new tab, and rel is what
        // stops the opened page reaching back through window.opener.
        assertThat(html).contains("noopener");
    }

    @Test
    void survivesUnbalancedMarkupWithoutLeakingIt() {
        // Comments are written by strangers, and a stray "<" must not become a
        // way to reopen a tag the sanitizer thought it had closed.
        String html = renderer.render("<b>bold <i>both</b> only italic");

        assertThat(html).doesNotContain("<script");
        assertThat(html).contains("bold");
    }
}
