package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Who may call what, stated once for the whole API.
 *
 * <p>The rules were already tested where they mattered — comments need a
 * session, deletion is owner-only, {@code /api/admin/**} is role-gated — but
 * never systematically, so the gap was not a missing assertion. It was that
 * <em>a new endpoint added with no rule at all would fail nothing</em>, which is
 * the one mistake a per-feature test can never catch.
 *
 * <p>Hence {@link #everyEndpointUnderApiIsAccountedFor()}. It reads the mapped
 * handlers out of Spring and fails when one is not named in the table below, so
 * adding an endpoint forces a decision about who may reach it. The rest of this
 * class is that table, executed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-security-matrix.db?foreign_keys=on",
            "bah.security.fingerprint-salt=matrix-salt",
            "bah.oauth.google.client-id=test-client-id",
            "bah.oauth.google.client-secret=test-client-secret"
        })
class ApiSecurityMatrixTest {

    private static final String BABKA = "babka-au-chocolat";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private RequestMappingHandlerMapping handlers;

    /**
     * Reads with no rule: the whole public site, which must never start asking
     * who somebody is.
     */
    private static final Set<String> PUBLIC_READS = Set.of(
            "GET /api/recipes",
            "GET /api/recipes/featured",
            "GET /api/recipes/{slug}",
            "GET /api/recipes/{slug}/comments",
            "GET /api/tags",
            "GET /api/authors",
            "GET /api/auth/providers",
            "GET /api/auth/session");

    /** Writes an anonymous visitor may make. Both issue the visitor cookie. */
    private static final Set<String> ANONYMOUS_WRITES =
            Set.of("PUT /api/recipes/{slug}/rating", "PUT /api/recipes/{slug}/reaction");

    /** Writes that require a session and answer 401 without one. */
    private static final Set<String> SESSION_WRITES = Set.of(
            "POST /api/recipes/{slug}/comments",
            "DELETE /api/comments/{id}",
            "PUT /api/auth/avatar",
            "PUT /api/auth/name");

    /** Everything behind ROLE_ADMIN, asserted in depth by AdminApiTest. */
    private static final Set<String> ADMIN_ONLY = Set.of(
            "GET /api/admin/recipes",
            "GET /api/admin/recipes/blank",
            "GET /api/admin/recipes/{key}",
            "PUT /api/admin/recipes",
            "PUT /api/admin/recipes/{key}/status",
            "GET /api/admin/comments/pending",
            "POST /api/admin/comments/{id}/moderate",
            "GET /api/admin/stats");

    private long ownedComment;

    @BeforeEach
    void seedTwoAccountsAndAComment() {
        jdbc.sql("DELETE FROM comment WHERE id > 4").update();
        jdbc.sql("DELETE FROM rating WHERE visitor_id <> 'seed-visitor'").update();
        jdbc.sql("DELETE FROM reaction").update();
        jdbc.sql("DELETE FROM visitor").update();
        jdbc.sql("DELETE FROM app_user").update();
        jdbc.sql(
                        """
                        INSERT INTO app_user (id, provider, provider_user_id, display_name, email, is_admin, created_at)
                        VALUES (1, 'google', 'g-1', 'Camille', 'camille@example.com', 0, '2026-07-01T00:00:00Z'),
                               (2, 'google', 'g-2', 'Sam',     'sam@example.com',     0, '2026-07-01T00:00:00Z')
                        """)
                .update();
        jdbc.sql(
                        """
                        INSERT INTO comment (recipe_id, user_id, display_name, body_markdown, body_html, status, created_at)
                        VALUES (1, 1, 'Camille', 'à moi', '<p>à moi</p>', 'PUBLISHED', '2026-07-26T12:00:00Z')
                        """)
                .update();
        ownedComment = jdbc.sql("SELECT last_insert_rowid()").query(Long.class).single();
    }

    private static AppUserPrincipal user(long id, String name, boolean admin) {
        return new AppUserPrincipal(new AppUser(id, "google", "g-" + id, name, name + "@example.com", admin));
    }

    // --- the matrix -------------------------------------------------------

    @Test
    void publicReadsAskNothingOfAnybody() throws Exception {
        // The public site is the whole point and is read by people who will never
        // sign in. Spring Security denies by default, so this is the assertion
        // that the site still exists.
        mvc.perform(get("/api/recipes").param("locale", "fr")).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/featured").param("locale", "fr")).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/{slug}", BABKA).param("locale", "fr")).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/{slug}/comments", BABKA).param("locale", "fr"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/tags").param("locale", "fr")).andExpect(status().isOk());
        mvc.perform(get("/api/authors")).andExpect(status().isOk());
        mvc.perform(get("/api/auth/providers")).andExpect(status().isOk());
        mvc.perform(get("/api/auth/session")).andExpect(status().isNoContent());
    }

    @Test
    void ratingAndReactingStayAnonymous() throws Exception {
        // Deliberately open. Requiring an account to rate a recipe would put a
        // sign-in in front of the lightest interaction on the site (ADR 0002).
        mvc.perform(rate().with(csrf())).andExpect(status().isOk());
        mvc.perform(react().with(csrf())).andExpect(status().isOk());
    }

    @Test
    void theSessionWritesRefuseAnAnonymousVisitor() throws Exception {
        // 401 rather than 403 throughout: the visitor is not forbidden, they have
        // not said who they are, and the UI offers sign-in on the strength of it.
        mvc.perform(comment().with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(deleteComment(ownedComment).with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(chooseAvatar().with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test
    void deletingSomebodyElsesCommentIsForbidden() throws Exception {
        // 403 and not 404: the comment exists, and saying so is not a leak when
        // the thread it is in is public. A comment that does not exist answers
        // 404, which is what stops this confirming which ids are real.
        mvc.perform(deleteComment(ownedComment)
                        .with(oauth2Login().oauth2User(user(2, "Sam", false)))
                        .with(csrf()))
                .andExpect(status().isForbidden());

        mvc.perform(deleteComment(999_999)
                        .with(oauth2Login().oauth2User(user(2, "Sam", false)))
                        .with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void anAdminHasNoSpecialPowerOverSomebodyElsesComment() throws Exception {
        // Moderation is a status change in the admin area, so that a rejected
        // comment leaves a trace. The owner-only rule is not relaxed for an admin
        // arriving through the public endpoint — an admin is a signed-in visitor
        // like any other here.
        mvc.perform(deleteComment(ownedComment)
                        .with(oauth2Login().oauth2User(user(2, "Hédi", true)))
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void theOwnerMayDeleteTheirOwn() throws Exception {
        mvc.perform(deleteComment(ownedComment)
                        .with(oauth2Login().oauth2User(user(1, "Camille", false)))
                        .with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void everyWriteRefusesAMissingCsrfToken() throws Exception {
        // Including the ones that are otherwise open to anyone. CSRF is not about
        // who the caller is; it is about whether they meant to call at all, and
        // an anonymous rating forged from another site is still a forged rating.
        for (MockHttpServletRequestBuilder write :
                new MockHttpServletRequestBuilder[] {rate(), react(), comment(), chooseAvatar()}) {
            mvc.perform(write.with(oauth2Login().oauth2User(user(1, "Camille", false))))
                    .andExpect(status().isForbidden());
        }

        mvc.perform(deleteComment(ownedComment).with(oauth2Login().oauth2User(user(1, "Camille", false))))
                .andExpect(status().isForbidden());
    }

    @Test
    void theAdminAreaIsClosedToEveryoneWithoutTheRole() throws Exception {
        for (String path : new String[] {
            "/api/admin/recipes", "/api/admin/recipes/blank", "/api/admin/comments/pending", "/api/admin/stats"
        }) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).with(oauth2Login().oauth2User(user(1, "Camille", false))))
                    .andExpect(status().isForbidden());
        }
    }

    // --- the guard --------------------------------------------------------

    /**
     * The reason this class exists.
     *
     * <p>Every other assertion here describes a rule that somebody remembered to
     * write. This one fails when an endpoint appears that nobody decided about —
     * the failure mode a per-feature test cannot reach, because the test for a
     * feature nobody thought to secure is also the test nobody wrote.
     *
     * <p>Adding an endpoint therefore breaks this test until its line is added to
     * one of the four sets above, which is the point: the decision gets made in a
     * file that says what the decision was.
     */
    @Test
    void everyEndpointUnderApiIsAccountedFor() {
        Set<String> declared = new TreeSet<>();
        declared.addAll(PUBLIC_READS);
        declared.addAll(ANONYMOUS_WRITES);
        declared.addAll(SESSION_WRITES);
        declared.addAll(ADMIN_ONLY);

        Set<String> mapped = handlers.getHandlerMethods().keySet().stream()
                .flatMap(info -> {
                    var patterns = info.getPathPatternsCondition();
                    if (patterns == null) return java.util.stream.Stream.<String>empty();

                    var methods = info.getMethodsCondition().getMethods();
                    return patterns.getPatterns().stream()
                            .map(Object::toString)
                            .filter(path -> path.startsWith("/api/"))
                            .flatMap(path -> methods.isEmpty()
                                    ? java.util.stream.Stream.of("ANY " + path)
                                    : methods.stream().map(method -> method.name() + " " + path));
                })
                .collect(Collectors.toCollection(TreeSet::new));

        assertThat(mapped)
                .as("no handlers were found, so this test compared nothing")
                .isNotEmpty();

        assertThat(mapped)
                .as("an endpoint exists that no line of this matrix describes — decide who may call it, "
                        + "then add it to PUBLIC_READS, ANONYMOUS_WRITES, SESSION_WRITES or ADMIN_ONLY")
                .isSubsetOf(declared);

        assertThat(declared)
                .as("this matrix describes an endpoint that no longer exists")
                .isSubsetOf(mapped);
    }

    // --- request builders -------------------------------------------------

    private static MockHttpServletRequestBuilder rate() {
        return put("/api/recipes/{slug}/rating", BABKA)
                .param("locale", "fr")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"stars\":4}");
    }

    private static MockHttpServletRequestBuilder react() {
        return put("/api/recipes/{slug}/reaction", BABKA)
                .param("locale", "fr")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"reacted\":true}");
    }

    private static MockHttpServletRequestBuilder comment() {
        return post("/api/recipes/{slug}/comments", BABKA)
                .param("locale", "fr")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"bodyMarkdown\":\"bonjour\"}");
    }

    private static MockHttpServletRequestBuilder chooseAvatar() {
        return put("/api/auth/avatar")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"avatar\":\"carrot/3\"}");
    }

    private static MockHttpServletRequestBuilder deleteComment(long id) {
        return delete("/api/comments/{id}", id);
    }
}
