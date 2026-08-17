package fr.bonapphedi;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.api.RecipeChanged;
import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The sitemap and the feeds, the last of what ADR 4 promised in place of SSR.
 *
 * <p>Both are for readers that never load the site: a crawler deciding what to
 * fetch, and a feed reader deciding what is new. Neither runs JavaScript, so
 * both are served from the same layer as the per-recipe metadata rather than
 * generated in the browser.
 *
 * <p>Asserted against the raw body, like {@link RecipeMetadataTest} and for the
 * same reason — what matters is what arrives on the wire.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-feeds.db?foreign_keys=on")
class SitemapAndRssTest {

    /** Five of the six seeded recipes are published; the sixth is a draft. */
    private static final int PUBLISHED = 5;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ApplicationEventPublisher events;

    /**
     * One test withdraws a recipe and another renames it, so both are put back
     * here rather than at the end of the test that did it — a failure half way
     * through would otherwise leave the next run asserting against state it did
     * not create, and the error would land on an unrelated test.
     *
     * <p>The event matters as much as the rows: these documents are cached, and
     * a write that goes round the admin endpoint does not invalidate anything by
     * itself.
     */
    @BeforeEach
    void putTheSeededRecipesBack() {
        jdbc.sql("UPDATE recipe SET status = 'PUBLISHED' WHERE key = 'shakshuka'")
                .update();
        jdbc.sql("UPDATE recipe_translation SET title = 'Chakchouka' WHERE slug = 'chakchouka'")
                .update();
        events.publishEvent(new RecipeChanged());
    }

    // --- the sitemap ------------------------------------------------------

    @Test
    void listsEveryPublishedRecipeInBothLanguages() throws Exception {
        String xml = body(get("/sitemap.xml"));

        // Both home pages, then both languages of each published recipe.
        Assertions.assertThat(count(xml, "<url>")).isEqualTo(2 + PUBLISHED * 2);
        Assertions.assertThat(xml)
                .contains("<loc>https://bonapphedi.fr/fr</loc>")
                .contains("<loc>https://bonapphedi.fr/en</loc>")
                .contains("https://bonapphedi.fr/fr/recettes/babka-au-chocolat")
                .contains("https://bonapphedi.fr/en/recipes/chocolate-babka");
    }

    @Test
    void offersEachAddressItsOtherLanguage() throws Exception {
        // The reason a sitemap is worth serving at all here rather than leaving
        // the crawler to the links: xhtml:link is how the two locales are
        // declared to be one recipe instead of two competing pages.
        String xml = body(get("/sitemap.xml"));

        Assertions.assertThat(xml)
                .contains("xmlns:xhtml=\"http://www.w3.org/1999/xhtml\"")
                .contains("<xhtml:link rel=\"alternate\" hreflang=\"en\""
                        + " href=\"https://bonapphedi.fr/en/recipes/chocolate-babka\"/>")
                .contains("<xhtml:link rel=\"alternate\" hreflang=\"fr\""
                        + " href=\"https://bonapphedi.fr/fr/recettes/babka-au-chocolat\"/>");
    }

    @Test
    void keepsDraftsOutOfTheSitemap() throws Exception {
        // A sitemap is an invitation to crawl. Naming a draft in it publishes
        // the recipe to the one audience that cannot see it is unfinished.
        Assertions.assertThat(body(get("/sitemap.xml")))
                .doesNotContain("jus-grenade-orange")
                .doesNotContain("pomegranate-orange-juice");
    }

    @Test
    void servesTheSitemapAsXml() throws Exception {
        mvc.perform(get("/sitemap.xml"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_XML));
    }

    @Test
    void tellsCrawlersWhereTheSitemapIs() throws Exception {
        // The conventional way a sitemap is found at all. Search Console is the
        // other, and it only covers the one crawler that has been told.
        mvc.perform(get("/robots.txt"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                // Absolute, which the directive requires - a relative path is
                // ignored rather than resolved.
                .andExpect(content().string(containsString("Sitemap: https://bonapphedi.fr/sitemap.xml")));
    }

    @Test
    void invitesCrawlersToTheWholeSite() throws Exception {
        // Worth asserting rather than assuming: a stray "Disallow: /" is the
        // single line that removes a site from search entirely, and nothing
        // else in the application would notice it had.
        Assertions.assertThat(body(get("/robots.txt")))
                .contains("User-agent: *")
                .doesNotContain("Disallow: /\n");
    }

    // --- the feeds --------------------------------------------------------

    @Test
    void givesEachLanguageItsOwnFeed() throws Exception {
        // Two feeds rather than one mixed: a subscriber reads in one language,
        // and an item they cannot read is indistinguishable from noise.
        Assertions.assertThat(body(get("/fr/rss.xml")))
                .contains("<title>Babka au chocolat</title>")
                .doesNotContain("Chocolate babka");

        Assertions.assertThat(body(get("/en/rss.xml")))
                .contains("<title>Chocolate babka</title>")
                .doesNotContain("Babka au chocolat");
    }

    @Test
    void carriesOneItemPerPublishedRecipe() throws Exception {
        String xml = body(get("/fr/rss.xml"));

        Assertions.assertThat(count(xml, "<item>")).isEqualTo(PUBLISHED);
        Assertions.assertThat(xml).doesNotContain("jus-grenade-orange");
    }

    @Test
    void datesEveryItemInTheOnlyFormatAReaderMustAccept() throws Exception {
        // RFC 822, which is what RSS 2.0 specifies. An ISO-8601 date is what
        // the database holds and what every other layer here passes around, so
        // this is the one place that has to convert rather than pass through -
        // and a reader that cannot parse the date sorts the feed arbitrarily.
        Assertions.assertThat(body(get("/fr/rss.xml"))).containsPattern("<pubDate>\\w{3}, \\d{2} \\w{3} \\d{4} ");
    }

    @Test
    void putsTheNewestFirst() throws Exception {
        String xml = body(get("/fr/rss.xml"));

        // Positional rather than a parsed date comparison: the order items
        // appear in is the order a reader shows them, whatever the dates say.
        Assertions.assertThat(xml.indexOf("<title>Chakchouka</title>"))
                .isLessThan(xml.indexOf("<title>Pain au levain</title>"));
    }

    @Test
    void linksEveryItemAbsolutelyAndUniquely() throws Exception {
        String xml = body(get("/fr/rss.xml"));

        Assertions.assertThat(xml)
                .contains("<link>https://bonapphedi.fr/fr/recettes/chakchouka</link>")
                // The guid is what a reader keys "already seen" on, so it has to
                // be the address rather than the title: a corrected title would
                // otherwise resurface the recipe as new.
                .contains("<guid isPermaLink=\"true\">https://bonapphedi.fr/fr/recettes/chakchouka</guid>");
    }

    @Test
    void servesTheFeedAsRss() throws Exception {
        mvc.perform(get("/fr/rss.xml"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.valueOf("application/rss+xml")))
                // The charset, asserted through the one accented string that is
                // always present. It is stated on the response rather than left
                // to the XML declaration, and getting it wrong is invisible from
                // here - the damage appears in somebody else's reader.
                .andExpect(content().string(containsString("<title>BonApp' Hedi</title>")));
    }

    // --- staying current --------------------------------------------------

    @Test
    void aWithdrawnRecipeLeavesBoth() throws Exception {
        // Both are cached for the same reason the metadata is, and both go
        // stale the same way. A crawler invited to a withdrawn recipe finds the
        // SPA's 404 and learns the sitemap lies.
        Assertions.assertThat(body(get("/sitemap.xml"))).contains("/fr/recettes/chakchouka");
        Assertions.assertThat(body(get("/fr/rss.xml"))).contains("Chakchouka");

        mvc.perform(put("/api/admin/recipes/shakshuka/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DRAFT\"}")
                        .with(oauth2Login().oauth2User(admin()))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        Assertions.assertThat(body(get("/sitemap.xml"))).doesNotContain("/fr/recettes/chakchouka");
        Assertions.assertThat(body(get("/fr/rss.xml"))).doesNotContain("Chakchouka");
    }

    @Test
    void escapesWhatWouldOtherwiseEndTheDocument() throws Exception {
        // Titles are author-controlled and go straight into markup. An
        // ampersand alone makes the whole feed unparseable, and a reader's
        // answer to malformed XML is to show nothing at all.
        jdbc.sql("UPDATE recipe_translation SET title = 'Sel & <poivre>' WHERE slug = 'chakchouka'")
                .update();
        events.publishEvent(new RecipeChanged());

        Assertions.assertThat(body(get("/fr/rss.xml")))
                .contains("Sel &amp; &lt;poivre&gt;")
                .doesNotContain("<poivre>");
    }

    private String body(org.springframework.test.web.servlet.RequestBuilder request) throws Exception {
        return mvc.perform(request)
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    private static int count(String haystack, String needle) {
        int found = 0;
        for (int at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length())) {
            found++;
        }
        return found;
    }

    private static AppUserPrincipal admin() {
        return new AppUserPrincipal(new AppUser(1, "google", "g-1", "Hédi", "hedi@example.com", true));
    }
}
