package fr.bonapphedi;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * That {@code XSRF-TOKEN} is actually written, in a context where nothing has
 * interfered with how it is written.
 *
 * <p>A class of its own, and it has to be one. This assertion lived in
 * {@link AuthApiTest} and passed there for months by luck: Spring Security's
 * {@code csrf()} request post-processor installs a {@code TestCsrfTokenRepository}
 * at <em>servlet-context</em> scope, not per request, so from the first test in a
 * class that uses {@code csrf()} onwards the application's real
 * {@code CookieCsrfTokenRepository} is bypassed and no cookie is ever written
 * again. Whether this passed therefore depended on JUnit happening to run it
 * before those tests — which is not a property anyone chose, and it broke the
 * moment unrelated methods were added to that class and the order shuffled.
 *
 * <p>So the one assertion that has to see the real repository gets a context with
 * no {@code csrf()} in it. Adding a test here that uses {@code csrf()} would put
 * the trap straight back.
 *
 * <p>What it protects is worth the class: Spring Security 6 defers generating the
 * token until something reads its value, nothing on an API ever does, and without
 * {@code CsrfCookieFilter} forcing it the cookie is never written and the SPA's
 * first POST is rejected forever (ADR 0003). Angular reads the cookie by name.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-csrf.db?foreign_keys=on")
class CsrfCookieTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void issuesTheCsrfCookieOnAnOrdinaryGet() throws Exception {
        mvc.perform(get("/api/auth/session")).andExpect(cookie().exists("XSRF-TOKEN"));
    }

    @Test
    void issuesItOnAPublicReadToo() throws Exception {
        // The first page a visitor loads is a recipe list, not the session
        // endpoint, and it is that response which has to carry the token — a
        // visitor who never signs in still rates and reacts.
        mvc.perform(get("/api/recipes").param("locale", "fr")).andExpect(cookie().exists("XSRF-TOKEN"));
    }
}
