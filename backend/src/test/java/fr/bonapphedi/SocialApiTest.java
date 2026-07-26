package fr.bonapphedi;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Everything a visitor can write about a recipe.
 *
 * <p>The rules being asserted are the ones the M1 mock enforced, because the mock
 * is the contract (ADR 0001): rating replaces rather than stacks, reacting twice
 * cannot count twice, a comment needs a session, and a pending comment is
 * visible to the person who wrote it and to nobody else.
 *
 * <p>Ratings and reactions are anonymous, so identity here is a cookie rather
 * than a user. That makes the cookie's own behaviour part of the contract and it
 * is asserted alongside: it is issued on the first write and not before, and the
 * same cookie rating the French and English slugs is one vote on one recipe.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-social.db?foreign_keys=on",
            "bah.security.fingerprint-salt=test-salt",
            "bah.security.max-visitors-per-fingerprint=3"
        })
class SocialApiTest {

    private static final String VISITOR_COOKIE = "bah-visitor";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    /** The seed's own rating and comments stay; anything a test wrote does not. */
    @BeforeEach
    void resetWrites() {
        jdbc.sql("DELETE FROM rating WHERE visitor_id <> 'seed-visitor'").update();
        jdbc.sql("DELETE FROM reaction").update();
        // Four are seeded, on two recipes; ids above that belong to a test.
        jdbc.sql("DELETE FROM comment WHERE id > 4").update();
        jdbc.sql("DELETE FROM visitor").update();

        // comment.user_id is a real foreign key, so the two people who do the
        // commenting below have to exist as accounts rather than as principals
        // invented in front of MockMvc.
        jdbc.sql("DELETE FROM app_user").update();
        jdbc.sql(
                        """
                        INSERT INTO app_user (id, provider, provider_user_id, display_name, email, is_admin, created_at)
                        VALUES (1, 'google', 'g-1', 'Camille', 'camille@example.com', 0, '2026-07-01T00:00:00Z'),
                               (2, 'google', 'g-2', 'Sam',     'sam@example.com',     0, '2026-07-01T00:00:00Z')
                        """)
                .update();
    }

    private static AppUserPrincipal user(long id, String name) {
        return new AppUserPrincipal(new AppUser(id, "google", "g-" + id, name, name + "@example.com", null, false));
    }

    // --- ratings ----------------------------------------------------------

    @Test
    void ratesAnonymously() throws Exception {
        mvc.perform(rate("babka-au-chocolat", "fr", 5).with(csrf()))
                .andExpect(status().isOk())
                // The seed holds one vote of 4, so a 5 makes it two votes at 4.5.
                .andExpect(jsonPath("$.average").value(4.5))
                .andExpect(jsonPath("$.count").value(2))
                .andExpect(jsonPath("$.yourRating").value(5));
    }

    @Test
    void issuesTheVisitorCookieOnTheFirstWriteAndNotBefore() throws Exception {
        // Nothing is stored about someone who only reads, which is what keeps the
        // cookie a functional one rather than something needing a consent banner.
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(cookie().doesNotExist(VISITOR_COOKIE));

        mvc.perform(rate("babka-au-chocolat", "fr", 5).with(csrf()))
                .andExpect(cookie().exists(VISITOR_COOKIE))
                .andExpect(cookie().httpOnly(VISITOR_COOKIE, true));
    }

    @Test
    void replacesTheVisitorsOwnScoreInsteadOfStacking() throws Exception {
        Cookie visitor = visitorFrom(mvc.perform(rate("babka-au-chocolat", "fr", 3).with(csrf())).andReturn());

        mvc.perform(rate("babka-au-chocolat", "fr", 5).cookie(visitor).with(csrf()))
                .andExpect(jsonPath("$.count").value(2))
                .andExpect(jsonPath("$.yourRating").value(5));

        // Clicking 3 then 5 leaves one vote of 5, never an average of 4.
        assertRatingRows("babka-au-chocolat", 2);
    }

    @Test
    void countsOneVoteWhenTheSameVisitorRatesBothLanguages() throws Exception {
        Cookie visitor = visitorFrom(mvc.perform(rate("babka-au-chocolat", "fr", 3).with(csrf())).andReturn());

        // Same recipe, other language. The slug differs and the vote must not.
        mvc.perform(rate("chocolate-babka", "en", 5).cookie(visitor).with(csrf()))
                .andExpect(jsonPath("$.count").value(2));

        assertRatingRows("babka-au-chocolat", 2);
    }

    @Test
    void refusesAScoreOutsideTheScale() throws Exception {
        // CHECK (stars BETWEEN 1 AND 5) would catch it too, as a 500.
        mvc.perform(rate("babka-au-chocolat", "fr", 0).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(rate("babka-au-chocolat", "fr", 6).with(csrf())).andExpect(status().isBadRequest());
    }

    @Test
    void refusesAWriteWithoutTheCsrfToken() throws Exception {
        mvc.perform(rate("babka-au-chocolat", "fr", 5)).andExpect(status().isForbidden());
    }

    @Test
    void refusesToRateARecipeThatIsNotPublic() throws Exception {
        mvc.perform(rate("jus-grenade-orange", "fr", 5).with(csrf())).andExpect(status().isNotFound());
    }

    // --- reactions --------------------------------------------------------

    @Test
    void reactsAndTogglesBackOff() throws Exception {
        MvcResult on = mvc.perform(react("babka-au-chocolat", "fr", true).with(csrf()))
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.reacted").value(true))
                .andReturn();

        mvc.perform(react("babka-au-chocolat", "fr", false).cookie(visitorFrom(on)).with(csrf()))
                .andExpect(jsonPath("$.count").value(0))
                .andExpect(jsonPath("$.reacted").value(false));
    }

    @Test
    void cannotReactTwiceAndCountTwice() throws Exception {
        MvcResult first = mvc.perform(react("babka-au-chocolat", "fr", true).with(csrf())).andReturn();

        mvc.perform(react("babka-au-chocolat", "fr", true).cookie(visitorFrom(first)).with(csrf()))
                .andExpect(jsonPath("$.count").value(1));
    }

    // --- what a read reports back to the same visitor ---------------------

    @Test
    void tellsTheVisitorWhatTheyThemselvesDid() throws Exception {
        MvcResult rated = mvc.perform(rate("babka-au-chocolat", "fr", 5).with(csrf())).andReturn();
        Cookie visitor = visitorFrom(rated);
        mvc.perform(react("babka-au-chocolat", "fr", true).cookie(visitor).with(csrf()));

        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr").cookie(visitor))
                .andExpect(jsonPath("$.rating.yourRating").value(5))
                .andExpect(jsonPath("$.reactions.reacted").value(true));

        // Someone else's browser sees the totals and none of the personal state.
        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(jsonPath("$.rating.yourRating").value(nullValue()))
                .andExpect(jsonPath("$.reactions.reacted").value(false));
    }

    // --- abuse ------------------------------------------------------------

    @Test
    void refusesMoreCookiesThanTheConfiguredLimitAllows() throws Exception {
        // Clearing cookies to vote again is the obvious way round a per-cookie
        // limit. The fingerprint is a salted hash of address and user agent -
        // no raw IP is stored anywhere, which the privacy page states.
        //
        // Three, because this class configures three. Asserting the shipped
        // default here would make the test pass whether or not the property is
        // ever read; asserting a number only this file sets cannot.
        mvc.perform(rate("babka-au-chocolat", "fr", 5).with(csrf())).andExpect(status().isOk());
        mvc.perform(rate("babka-au-chocolat", "fr", 5).with(csrf())).andExpect(status().isOk());
        mvc.perform(rate("babka-au-chocolat", "fr", 5).with(csrf())).andExpect(status().isOk());

        mvc.perform(rate("babka-au-chocolat", "fr", 5).with(csrf()))
                .andExpect(status().isTooManyRequests());
    }

    // --- comments ---------------------------------------------------------

    @Test
    void showsTheSeededThreadToAnyone() throws Exception {
        mvc.perform(get("/api/recipes/babka-au-chocolat/comments").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // Newest first in the public thread.
                .andExpect(jsonPath("$[0].createdAt").isNotEmpty())
                .andExpect(jsonPath("$[0].author.displayName").isNotEmpty())
                .andExpect(jsonPath("$[0].mine").value(false));
    }

    @Test
    void refusesACommentFromAVisitorWithNoSession() throws Exception {
        mvc.perform(comment("babka-au-chocolat", "fr", "Bonjour").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void postsACommentAndRendersItServerSide() throws Exception {
        mvc.perform(comment("babka-au-chocolat", "fr", "**Excellent** avec un peu de fleur de sel")
                        .with(oauth2Login().oauth2User(user(1, "Camille")))
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.author.displayName").value("Camille"))
                .andExpect(jsonPath("$.bodyMarkdown").value("**Excellent** avec un peu de fleur de sel"))
                // Rendered on write, unlike M1 where bodyHtml was empty and the
                // client rendered it.
                .andExpect(jsonPath("$.bodyHtml").value(
                        "<p><strong>Excellent</strong> avec un peu de fleur de sel</p>\n"))
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.mine").value(true));
    }

    @Test
    void sanitizesACommentBeforeItIsEverStored() throws Exception {
        mvc.perform(comment("babka-au-chocolat", "fr", "<img src=x onerror=alert(1)> et <script>alert(2)</script>")
                        .with(oauth2Login().oauth2User(user(1, "Camille")))
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bodyHtml").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("onerror"))))
                .andExpect(jsonPath("$.bodyHtml").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("<script"))));
    }

    @Test
    void refusesAnEmptyComment() throws Exception {
        mvc.perform(comment("babka-au-chocolat", "fr", "   ")
                        .with(oauth2Login().oauth2User(user(1, "Camille")))
                        .with(csrf()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void keepsAPendingCommentBetweenItsAuthorAndTheModerator() throws Exception {
        long id = insertPendingComment(1, "Camille");

        mvc.perform(get("/api/recipes/babka-au-chocolat/comments")
                        .param("locale", "fr")
                        .with(oauth2Login().oauth2User(user(1, "Camille"))))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].status").value("PENDING"));

        // Another signed-in visitor must not see it: a moderation queue is not
        // public reading, and silently swallowing it from its own author gets the
        // same comment posted three more times.
        mvc.perform(get("/api/recipes/babka-au-chocolat/comments")
                        .param("locale", "fr")
                        .with(oauth2Login().oauth2User(user(2, "Sam"))))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void countsOnTheRecipeWhatTheThreadActuallyShows() throws Exception {
        insertPendingComment(1, "Camille");

        mvc.perform(get("/api/recipes/babka-au-chocolat").param("locale", "fr"))
                .andExpect(jsonPath("$.commentCount").value(2));

        mvc.perform(get("/api/recipes/babka-au-chocolat")
                        .param("locale", "fr")
                        .with(oauth2Login().oauth2User(user(1, "Camille"))))
                .andExpect(jsonPath("$.commentCount").value(3));
    }

    @Test
    void deletesYourOwnCommentAndOnlyYourOwn() throws Exception {
        long id = insertPendingComment(1, "Camille");

        mvc.perform(delete("/api/comments/" + id)
                        .with(oauth2Login().oauth2User(user(2, "Sam")))
                        .with(csrf()))
                .andExpect(status().isForbidden());

        mvc.perform(delete("/api/comments/" + id)
                        .with(oauth2Login().oauth2User(user(1, "Camille")))
                        .with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void refusesToDeleteAnythingWithoutASession() throws Exception {
        mvc.perform(delete("/api/comments/1").with(csrf())).andExpect(status().isUnauthorized());
    }

    // --- helpers ----------------------------------------------------------

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder rate(
            String slug, String locale, int stars) {
        return put("/api/recipes/{slug}/rating", slug)
                .param("locale", locale)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"stars\":" + stars + "}");
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder react(
            String slug, String locale, boolean reacted) {
        return put("/api/recipes/{slug}/reaction", slug)
                .param("locale", locale)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reacted\":" + reacted + "}");
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder comment(
            String slug, String locale, String body) {
        return post("/api/recipes/{slug}/comments", slug)
                .param("locale", locale)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"bodyMarkdown\":" + quote(body) + "}");
    }

    private static String quote(String raw) {
        return "\"" + raw.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static Cookie visitorFrom(MvcResult result) {
        Cookie cookie = result.getResponse().getCookie(VISITOR_COOKIE);
        if (cookie == null) {
            throw new AssertionError("no " + VISITOR_COOKIE + " cookie was issued by that write");
        }
        return cookie;
    }

    private void assertRatingRows(String slug, int expected) {
        int rows = jdbc.sql(
                        """
                        SELECT count(*) FROM rating
                        WHERE recipe_id = (SELECT recipe_id FROM recipe_translation WHERE slug = ? AND locale = 'fr')
                        """)
                .param(slug)
                .query(Integer.class)
                .single();

        org.assertj.core.api.Assertions.assertThat(rows).isEqualTo(expected);
    }

    private long insertPendingComment(long userId, String displayName) {
        jdbc.sql(
                        """
                        INSERT INTO comment (recipe_id, user_id, display_name, body_markdown, body_html, status, created_at)
                        VALUES (1, ?, ?, 'En attente', '<p>En attente</p>', 'PENDING', '2026-07-25T10:00:00Z')
                        """)
                .param(userId)
                .param(displayName)
                .update();

        return jdbc.sql("SELECT max(id) FROM comment").query(Long.class).single();
    }
}
