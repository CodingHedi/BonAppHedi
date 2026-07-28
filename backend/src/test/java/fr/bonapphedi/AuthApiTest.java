package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Sign-in as the frontend meets it, with one provider configured.
 *
 * <p>The site is anonymous by default and authenticated in three places, so most
 * of what matters here is what auth does <em>not</em> do: adding the security
 * starter denies every request until told otherwise, and the read API silently
 * becoming a 401 would take the whole public site with it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-auth.db?foreign_keys=on",
            // Facebook is deliberately left unconfigured: the provider list is
            // built from whatever has credentials, and one of two proves it.
            "bah.oauth.google.client-id=test-client-id",
            "bah.oauth.google.client-secret=test-client-secret",
            "bah.admin.emails=hedi@example.com"
        })
class AuthApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcIndexedSessionRepository sessions;

    @Autowired
    private JdbcClient jdbc;

    private static AppUserPrincipal signedIn(boolean admin) {
        return new AppUserPrincipal(new AppUser(7, "google", "112233", "Hédi", "hedi@example.com", admin));
    }

    /**
     * The account the principal above refers to.
     *
     * <p>{@code oauth2Login()} invents a principal in front of the request without
     * touching the database, which is fine for everything that only reads the
     * session. Choosing an avatar writes to {@code app_user}, so for that the row
     * has to exist — and it is the same gap CLAUDE.md warns about, where a test
     * exercises real logic against wiring that is not there.
     */
    @BeforeEach
    void standUpTheAccount() {
        // Comments first: comment.user_id is ON DELETE SET NULL, so dropping the
        // accounts first would leave orphaned rows behind that the name tests then
        // count as somebody else's.
        jdbc.sql("DELETE FROM comment WHERE id > 4").update();
        jdbc.sql("DELETE FROM app_user WHERE id IN (7, 8)").update();
        jdbc.sql(
                        """
                        INSERT INTO app_user (id, provider, provider_user_id, display_name, email, is_admin, created_at)
                        VALUES (7, 'google', '112233', 'Hédi', 'hedi@example.com', 1, '2026-07-01T00:00:00Z')
                        """)
                .update();
    }

    // --- what stays anonymous ---------------------------------------------

    @Test
    void leavesTheReadApiOpenToEveryone() {
        // Reading a recipe requires no account and never will. Spring Security
        // denies everything by default, so this is the assertion that the whole
        // public site still exists.
        assertOk("/api/recipes");
        assertOk("/api/recipes/featured");
        assertOk("/api/tags");
        assertOk("/api/authors");
    }

    private void assertOk(String path) {
        try {
            mvc.perform(get(path).param("locale", "fr")).andExpect(status().isOk());
        } catch (Exception e) {
            throw new AssertionError(path + " is no longer publicly readable", e);
        }
    }

    // --- providers --------------------------------------------------------

    @Test
    void listsOnlyTheProvidersItHoldsCredentialsFor() throws Exception {
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value("google"))
                // A brand name, never translated - the frontend renders it as-is.
                .andExpect(jsonPath("$[0].label").value("Google"));
    }

    @Test
    void startsSignInByRedirectingToTheProvider() throws Exception {
        // The frontend's signIn() is a browser navigation to exactly this path,
        // so the path is part of the contract.
        mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", startsWith("https://accounts.google.com/")));
    }

    @Test
    void remembersThePageSignInWasStartedFrom() throws Exception {
        // The request that knows where the visitor was does not survive the trip
        // to Google and back, so the session is what carries it across.
        assertThat(rememberedFrom("/fr/recettes/babka-au-chocolat"))
                .isEqualTo("/fr/recettes/babka-au-chocolat");
    }

    @Test
    void refusesToRememberSomewhereOffThisSite() throws Exception {
        // Sanitized before being stored rather than checked on the way out, so
        // nothing unchecked is ever in the session to begin with.
        assertThat(rememberedFrom("https://evil.example/login")).isEqualTo("/");
        assertThat(rememberedFrom("//evil.example")).isEqualTo("/");
    }

    /**
     * Starts sign-in and reads back what the session kept.
     *
     * <p>Read from the session store rather than from the MockMvc request,
     * because Spring Session wraps the request and the attribute never lands on
     * the raw one. Going the long way round is what makes this a test of the
     * filter being <em>wired into the chain</em> rather than of the filter class
     * in isolation — the distinction that has already caught two things here.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object rememberedFrom(String returnTo) throws Exception {
        MvcResult result = mvc.perform(get("/oauth2/authorization/google").param("returnTo", returnTo))
                .andExpect(status().is3xxRedirection())
                .andReturn();

        Cookie cookie = result.getResponse().getCookie("SESSION");
        assertThat(cookie).as("no session was created to remember anything in").isNotNull();

        // Spring Session base64-encodes the id into the cookie.
        String id = new String(Base64.getDecoder().decode(cookie.getValue()), StandardCharsets.UTF_8);

        SessionRepository raw = sessions;
        Session stored = (Session) raw.findById(id);
        assertThat(stored).as("the session cookie refers to nothing").isNotNull();

        return stored.getAttribute("bah.sign-in.return-to");
    }

    // --- session ----------------------------------------------------------

    @Test
    void reportsNoSessionForAVisitorWhoHasNotSignedIn() throws Exception {
        // Not an error and not a 401: being anonymous is the normal state here,
        // and the frontend reads an empty body as `null` (AuthApi.session).
        mvc.perform(get("/api/auth/session")).andExpect(status().isNoContent());
    }

    @Test
    void describesTheSignedInUserInTheShapeTheContractDeclares() throws Exception {
        mvc.perform(get("/api/auth/session").with(oauth2Login().oauth2User(signedIn(true))))
                .andExpect(status().isOk())
                // `id` is a string in models.ts even though the column is an
                // integer, so it is serialized as one rather than left to drift.
                .andExpect(jsonPath("$.id").value("7"))
                .andExpect(jsonPath("$.displayName").value("Hédi"))
                // A chosen-avatar token, null until one has been chosen — never a
                // URL, and no longer a field called avatarUrl (ADR 7).
                .andExpect(jsonPath("$.avatar").value(nullValue()))
                .andExpect(jsonPath("$.avatarUrl").doesNotExist())
                .andExpect(jsonPath("$.isAdmin").value(true))
                // The address is nobody's business but the server's; it decides
                // admin and is never needed by the UI.
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    // --- choosing an avatar -----------------------------------------------

    @Test
    void storesTheAvatarTheVisitorChose() throws Exception {
        mvc.perform(chooseAvatar("carrot/3").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar").value("carrot/3"));

        // Read back through the session endpoint rather than from the row, because
        // that is where the frontend will look for it — and because the principal
        // in the session was built before the choice was made. If the session
        // answered from its own copy, the avatar would appear to revert until the
        // next sign-in.
        mvc.perform(get("/api/auth/session").with(oauth2Login().oauth2User(signedIn(false))))
                .andExpect(jsonPath("$.avatar").value("carrot/3"));
    }

    @Test
    void replacesAnEarlierChoiceRatherThanAccumulating() throws Exception {
        mvc.perform(chooseAvatar("carrot/3").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk());
        mvc.perform(chooseAvatar("mug/5").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar").value("mug/5"));
    }

    @Test
    void refusesAnAvatarThatIsNotOneOfTheOnesOffered() throws Exception {
        // The set is closed and enforced here, not in the browser. Without this the
        // column takes any string of any length from any signed-in visitor.
        for (String rejected : new String[] {"pineapple/2", "carrot/9", "carrot", "", "  "}) {
            mvc.perform(chooseAvatar(rejected)
                            .with(oauth2Login().oauth2User(signedIn(false)))
                            .with(csrf()))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void refusesToChooseAnAvatarForAVisitorWithNoSession() throws Exception {
        mvc.perform(chooseAvatar("carrot/3").with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test
    void refusesAnAvatarChoiceThatCarriesNoCsrfToken() throws Exception {
        mvc.perform(chooseAvatar("carrot/3").with(oauth2Login().oauth2User(signedIn(false))))
                .andExpect(status().isForbidden());
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder chooseAvatar(
            String token) {
        return put("/api/auth/avatar")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"avatar\":\"" + token + "\"}");
    }

    // --- choosing a name --------------------------------------------------

    @Test
    void storesTheNameTheVisitorChose() throws Exception {
        mvc.perform(chooseName("Chef Hédi").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk())
                // displayName is what to show; chosenName is the choice itself, and
                // the profile page needs both to tell "no choice" from "chose this".
                .andExpect(jsonPath("$.displayName").value("Chef Hédi"))
                .andExpect(jsonPath("$.chosenName").value("Chef Hédi"));

        mvc.perform(get("/api/auth/session").with(oauth2Login().oauth2User(signedIn(false))))
                .andExpect(jsonPath("$.displayName").value("Chef Hédi"));
    }

    @Test
    void showsTheProvidersNameUntilOneIsChosen() throws Exception {
        mvc.perform(get("/api/auth/session").with(oauth2Login().oauth2User(signedIn(false))))
                .andExpect(jsonPath("$.displayName").value("Hédi"))
                .andExpect(jsonPath("$.chosenName").value(nullValue()));
    }

    /**
     * The assertion the whole feature rests on.
     *
     * <p>{@code comment.display_name} is a copy taken when the comment was posted,
     * so choosing a name has to rewrite those copies. Without it somebody who sets a
     * pseudonym precisely because they do not want their real name public keeps it on
     * every comment they have already written — and every other test here would still
     * pass.
     */
    @Test
    void rewritesTheNameOnCommentsAlreadyPosted() throws Exception {
        long comment = givenACommentBy(7, "Hédi");

        mvc.perform(chooseName("Chef Hédi").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk());

        assertThat(nameOn(comment)).isEqualTo("Chef Hédi");
    }

    @Test
    void leavesOtherPeoplesCommentsAlone() throws Exception {
        // The rewrite is scoped by user_id in SQL. An UPDATE that forgot the WHERE
        // would rename the whole thread and pass the test above.
        long mine = givenACommentBy(7, "Hédi");
        long theirs = givenACommentBy(8, "Camille");

        mvc.perform(chooseName("Chef Hédi").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk());

        assertThat(nameOn(mine)).isEqualTo("Chef Hédi");
        assertThat(nameOn(theirs)).isEqualTo("Camille");
    }

    @Test
    void copiesTheChosenNameOntoNewCommentsToo() throws Exception {
        mvc.perform(chooseName("Chef Hédi").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk());

        // Posted after the choice, so nothing rewrites it: the copy has to be right
        // when it is made or the real name sits there until the next rename.
        mvc.perform(post("/api/recipes/babka-au-chocolat/comments")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"bodyMarkdown\":\"Très bon.\"}")
                        .with(oauth2Login().oauth2User(signedIn(false)))
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.author.displayName").value("Chef Hédi"));
    }

    @Test
    void clearingTheChoiceGoesBackToTheProvidersNameEverywhere() throws Exception {
        long comment = givenACommentBy(7, "Hédi");

        mvc.perform(chooseName("Chef Hédi").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk());

        // Blank is a clear, not a bad request — otherwise a pseudonym could be set
        // and never undone.
        mvc.perform(chooseName("").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Hédi"))
                .andExpect(jsonPath("$.chosenName").value(nullValue()));

        assertThat(nameOn(comment)).isEqualTo("Hédi");
    }

    @Test
    void storesTheNameTrimmedAndCollapsed() throws Exception {
        // Validated *and stored* through the same normalisation, or the column ends
        // up holding the raw string that merely passed the check.
        mvc.perform(chooseName("  Chef    Hédi  ")
                        .with(oauth2Login().oauth2User(signedIn(false)))
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chosenName").value("Chef Hédi"));
    }

    @Test
    void refusesANameThisSiteDoesNotAccept() throws Exception {
        // One character, over thirty, and a right-to-left override that would make
        // the rest of the byline read backwards. DisplayNameTest covers the rules;
        // this asserts the endpoint actually applies them.
        for (String rejected : new String[] {"x", "y".repeat(31), "He‮di", "Hé\ndi"}) {
            mvc.perform(chooseName(rejected)
                            .with(oauth2Login().oauth2User(signedIn(false)))
                            .with(csrf()))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void refusesToChooseANameForAVisitorWithNoSession() throws Exception {
        mvc.perform(chooseName("Chef Hédi").with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test
    void refusesANameChoiceThatCarriesNoCsrfToken() throws Exception {
        mvc.perform(chooseName("Chef Hédi").with(oauth2Login().oauth2User(signedIn(false))))
                .andExpect(status().isForbidden());
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder chooseName(
            String name) {
        return put("/api/auth/name")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                // Escaped, because two of the rejection cases above are a newline
                // and a bidi override and both would otherwise break the JSON
                // rather than reaching the validator.
                .content("{\"displayName\":\"" + escapeJson(name) + "\"}");
    }

    private static String escapeJson(String raw) {
        StringBuilder out = new StringBuilder();
        raw.codePoints().forEach(point -> {
            if (point == '"' || point == '\\') out.append('\\').append((char) point);
            else if (point < 0x20 || point == 0x202E || point == 0xFEFF)
                out.append(String.format("\\u%04x", point));
            else out.appendCodePoint(point);
        });
        return out.toString();
    }

    /** A comment attributed to an account, so the rewrite has something to rewrite. */
    private long givenACommentBy(long userId, String name) {
        if (userId != 7) {
            jdbc.sql(
                            """
                            INSERT OR IGNORE INTO app_user (
                                id, provider, provider_user_id, display_name, email, is_admin, created_at)
                            VALUES (?, 'google', ?, ?, NULL, 0, '2026-07-01T00:00:00Z')
                            """)
                    .param(userId)
                    .param("other-" + userId)
                    .param(name)
                    .update();
        }

        jdbc.sql(
                        """
                        INSERT INTO comment (
                            recipe_id, user_id, display_name, body_markdown, body_html, status, created_at)
                        VALUES (1, ?, ?, 'x', '<p>x</p>', 'PUBLISHED', '2026-07-01T00:00:00Z')
                        """)
                .param(userId)
                .param(name)
                .update();

        return jdbc.sql("SELECT last_insert_rowid()").query(Long.class).single();
    }

    private String nameOn(long commentId) {
        return jdbc.sql("SELECT display_name FROM comment WHERE id = ?")
                .param(commentId)
                .query(String.class)
                .single();
    }

    // --- CSRF -------------------------------------------------------------

    // That XSRF-TOKEN is written at all is asserted in CsrfCookieTest, which
    // exists because it cannot be asserted here: `csrf()` below replaces the
    // token repository for the whole servlet context, so any such assertion in
    // this class passes or fails on JUnit's method order.

    @Test
    void refusesAWriteThatCarriesNoCsrfToken() throws Exception {
        // The test that stops anyone "fixing" a 403 with csrf().disable().
        mvc.perform(post("/api/auth/logout")).andExpect(status().isForbidden());
    }

    @Test
    void signsOutWhenTheTokenIsPresent() throws Exception {
        mvc.perform(post("/api/auth/logout").with(oauth2Login().oauth2User(signedIn(false))).with(csrf()))
                .andExpect(status().isNoContent());
    }

    // --- the admin area ---------------------------------------------------

    @Test
    void answersAnApiCallWithUnauthorizedRatherThanARedirect() throws Exception {
        // With a single provider registered, Spring's default entry point sends
        // a 302 to Google. For an XHR that arrives as an opaque CORS failure
        // instead of a status the frontend can act on.
        mvc.perform(get("/api/admin/recipes")).andExpect(status().isUnauthorized());
    }

    @Test
    void refusesTheAdminAreaToAnOrdinarySignedInUser() throws Exception {
        mvc.perform(get("/api/admin/recipes").with(oauth2Login().oauth2User(signedIn(false))))
                .andExpect(status().isForbidden());
    }

    @Test
    void letsAnAdminPastTheGuard() throws Exception {
        // This asserted 404 while nothing was mounted under /api/admin, which
        // proved the request reached routing and found no handler. Now that the
        // admin area exists it can say the stronger thing directly, and the two
        // cases above are what stop it passing with the rule missing entirely.
        mvc.perform(get("/api/admin/recipes").with(oauth2Login().oauth2User(signedIn(true))))
                .andExpect(status().isOk());
    }
}
