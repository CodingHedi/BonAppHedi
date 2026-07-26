package fr.bonapphedi;

import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

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

    private static AppUserPrincipal signedIn(boolean admin) {
        return new AppUserPrincipal(
                new AppUser(7, "google", "112233", "Hédi", "hedi@example.com", null, admin));
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
        // The frontend's signIn() is a browser navigation to exactly this path
        // and nothing else, so the path is part of the contract.
        mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", startsWith("https://accounts.google.com/")));
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
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()))
                .andExpect(jsonPath("$.isAdmin").value(true))
                // The address is nobody's business but the server's; it decides
                // admin and is never needed by the UI.
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    // --- CSRF -------------------------------------------------------------

    @Test
    void issuesTheCsrfCookieOnAnOrdinaryGet() throws Exception {
        // Spring Security 6 defers token generation, so without the filter that
        // forces it the cookie is never written and the SPA's first POST is
        // rejected forever (ADR 0003). Angular reads XSRF-TOKEN by name.
        mvc.perform(get("/api/auth/session")).andExpect(cookie().exists("XSRF-TOKEN"));
    }

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
