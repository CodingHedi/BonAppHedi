package fr.bonapphedi;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The jar serving the Angular app, and knowing when not to.
 *
 * <p>Deep links are the reason this exists. Angular owns the routing, so
 * {@code /fr/recettes/babka-au-chocolat} is a page to a visitor and no file to
 * the server; without a fallback every reload, every bookmark and every inbound
 * link answers 404. It cannot be caught in development either — {@code ng serve}
 * has its own fallback — so the failure would first appear on the deployed jar.
 *
 * <p>A stand-in {@code index.html} and a stand-in hashed bundle live in
 * {@code src/test/resources/static}, because the real ones only exist after
 * {@code -Pweb} has run the Angular build. What is under test is the routing
 * rule, not the bundle.
 *
 * <p><b>They are committed rather than written by a {@code @BeforeAll}, and that
 * is not tidiness.</b> This class used to write them into
 * {@code target/test-classes/static} at run time, which quietly made the shell a
 * shared mutable file: {@code IndexHtmlController} reads {@code index.html}
 * <em>once, at context startup</em>, so whether {@code RecipeMetadataTest} saw a
 * real shell or a one-line stub came down to which class booted its context
 * first. It failed six of its seven tests locally and passed in CI, on nothing
 * but run order.
 *
 * <p>The original reason for writing at run time still stands and is why these
 * files are under {@code src/test/resources} and not {@code src/main/resources}:
 * under {@code -Pweb} the Angular build is copied into
 * {@code target/classes/static} during {@code process-resources}, and a stand-in
 * landing there would be packaged into the jar in place of the application.
 * Surefire puts {@code test-classes} ahead of {@code classes}, so these win
 * during the run and are never part of the artefact.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-spa.db?foreign_keys=on",
            // Pinned blank, and the first draft of this class was not. Without
            // it the OAuth assertion below reads whatever `application-local.yml`
            // happens to hold: 404 on a fresh checkout and in CI, 302 to Google
            // on a machine with real credentials. A test whose expected status
            // depends on a gitignored file is a test that will fail for the next
            // person for no reason they can see.
            "bah.oauth.google.client-id=",
            "bah.oauth.google.client-secret="
        })
class SpaFallbackTest {

    /**
     * The application shell, in the one form both stand-ins and the real Angular
     * build agree on. Asserting on the element Angular boots into is what makes
     * "this is the index page" mean the same thing here and under {@code -Pweb}.
     */
    private static final String MARKER = "<bah-root>";

    @Autowired
    private MockMvc mvc;

    @Test
    void servesTheApplicationAtTheRoot() throws Exception {
        // A forward, not a body. Spring Boot's welcome-page mapping claims `/`
        // before the resource chain runs and forwards it to index.html, and
        // MockMvc does not follow forwards — so asserting on content here gets
        // an empty string and looks like the page is missing. In a real server
        // both routes end at the same HTML.
        mvc.perform(get("/")).andExpect(status().isOk()).andExpect(forwardedUrl("index.html"));
    }

    @Test
    void handsDeepLinksToTheBrowserRouter() throws Exception {
        // The actual bug. Each of these is a real page to a visitor and no file
        // on the server, and each one 404s without the fallback.
        for (String path : new String[] {
            "/fr",
            "/en",
            "/fr/recettes/babka-au-chocolat",
            "/en/recipes/chocolate-babka",
            "/fr/profil",
            "/fr/admin/recipes",
            "/fr/mentions-legales"
        }) {
            mvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(content().string(org.hamcrest.Matchers.containsString(MARKER)));
        }
    }

    @Test
    void letsAngularAnswerForARouteThatDoesNotExist() throws Exception {
        // Index rather than a 404 from Tomcat: the router has its own not-found
        // page, in the visitor's language and inside the site's chrome.
        mvc.perform(get("/fr/cette-page-nexiste-pas"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString(MARKER)));
    }

    @Test
    void servesARealAssetRatherThanTheIndex() throws Exception {
        mvc.perform(get("/main-TEST123.js"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("console.log")));
    }

    @Test
    void keepsAMissingApiEndpointA404() throws Exception {
        // The rule that must not be lost. Forwarding these to index.html would
        // answer every mistyped API call with 200 and a page of HTML, which the
        // caller then fails to parse somewhere far from the cause — and the e2e
        // fixture tells an API 404 from a broken one deliberately.
        mvc.perform(get("/api/no-such-endpoint")).andExpect(status().isNotFound());
        mvc.perform(get("/api/recipes/no-such-recipe").param("locale", "fr"))
                .andExpect(status().isNotFound());
    }

    @Test
    void stillAnswersTheApiItself() throws Exception {
        mvc.perform(get("/api/recipes").param("locale", "fr"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }

    @Test
    void keepsAMissingAssetA404() throws Exception {
        // A bundle that 200s with a page of markup is a syntax error in the
        // console and no clue which asset went missing.
        mvc.perform(get("/main-DOESNOTEXIST.js")).andExpect(status().isNotFound());
        mvc.perform(get("/i18n/de.json")).andExpect(status().isNotFound());
    }

    @Test
    void leavesSpringSecurityItsOwnPaths() throws Exception {
        // /oauth2 and /login belong to the security filters. Swallowing either
        // would break sign-in in a way that looks like the provider's fault.
        // No provider is configured here, so the authorization endpoint is not
        // mounted — the point is that it is not answered with the index page.
        mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().isNotFound())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(MARKER))));
    }
}
