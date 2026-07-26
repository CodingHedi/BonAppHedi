package fr.bonapphedi.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.test.context.TestPropertySource;

/**
 * The signed-in principal surviving a round trip through the session store.
 *
 * <p>This is the one thing the MockMvc suites structurally cannot check. Every
 * test there stands a principal up in front of the request with
 * {@code oauth2Login()}, so the object is built fresh each time and never
 * written anywhere. Spring Session, by contrast, Java-serializes the whole
 * {@code SecurityContext} into {@code SPRING_SESSION_ATTRIBUTES} on every
 * request that touches a session.
 *
 * <p>So a field added to {@link AppUser} or {@link AppUserPrincipal} that is not
 * itself serializable would fail no test, pass review, and then throw on the
 * first real login - at the moment the session is saved, after the OAuth round
 * trip has already succeeded, which is about the least debuggable place it
 * could happen. The javadoc on {@code AppUser} claims this matters; this is what
 * makes the claim true.
 */
@SpringBootTest
@TestPropertySource(
        properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-session.db?foreign_keys=on")
class SessionSerializationTest {

    private static final String SECURITY_CONTEXT = "SPRING_SECURITY_CONTEXT";

    /**
     * The real repository, not a stub. A hand-rolled round trip through
     * ObjectOutputStream would prove the classes are serializable and say nothing
     * about the thing that actually stores them.
     */
    @Autowired
    private JdbcIndexedSessionRepository sessions;

    @Test
    void keepsAnAdminAnAdminAcrossTheSessionStore() {
        AppUserPrincipal principal = new AppUserPrincipal(
                new AppUser(7, "google", "112233", "Hédi", "hedi@example.com", null, true));

        AppUserPrincipal restored = (AppUserPrincipal) roundTrip(principal);

        assertThat(restored.user()).isEqualTo(principal.user());
        assertThat(restored.getName()).isEqualTo("google:112233");
        // The authority is derived from the row rather than stored beside it, so
        // this asserts the row survived and not merely that a list of strings did.
        assertThat(restored.getAuthorities())
                .extracting(Object::toString)
                .contains("ROLE_ADMIN", "ROLE_USER");
    }

    @Test
    void keepsAnOrdinaryUserOrdinary() {
        AppUserPrincipal principal = new AppUserPrincipal(
                new AppUser(8, "facebook", "998877", "Camille", null, "https://example.com/a.png", false));

        AppUserPrincipal restored = (AppUserPrincipal) roundTrip(principal);

        assertThat(restored.user().admin()).isFalse();
        assertThat(restored.user().avatarUrl()).isEqualTo("https://example.com/a.png");
        assertThat(restored.getAuthorities()).extracting(Object::toString).doesNotContain("ROLE_ADMIN");
    }

    @Test
    void survivesTheOidcPrincipalWithItsIdTokenAttached() {
        // Google logs in through the OIDC arm, so this is the principal that most
        // people will actually have. It carries an OidcIdToken, which is one more
        // object that has to be serializable for a Google login to work at all.
        AppUserOidcPrincipal principal = new AppUserOidcPrincipal(
                new AppUser(9, "google", "445566", "Sam", "sam@example.com", null, false),
                new OidcIdToken(
                        "a-token-value",
                        Instant.parse("2026-07-26T10:00:00Z"),
                        Instant.parse("2026-07-26T11:00:00Z"),
                        Map.of("sub", "445566")),
                null);

        AppUserOidcPrincipal restored = (AppUserOidcPrincipal) roundTrip(principal);

        assertThat(restored.user().displayName()).isEqualTo("Sam");
        assertThat(restored.getIdToken().getTokenValue()).isEqualTo("a-token-value");
        assertThat(restored.getClaims()).containsEntry("sub", "445566");
    }

    /**
     * Saves a session holding this principal, then reads it back by id.
     *
     * <p>Raw-typed on purpose. {@code JdbcSession} is a package-private nested
     * class, so the concrete type cannot be named or called from here - even
     * through {@code var}, which infers it and then refuses the method calls.
     * Dropping the generics lets everything resolve against the public
     * {@link Session} interface, which is all this needs.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object roundTrip(AppUserPrincipal principal) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(
                new OAuth2AuthenticationToken(principal, principal.getAuthorities(), principal.user().provider()));

        SessionRepository raw = sessions;

        Session session = (Session) raw.createSession();
        session.setAttribute(SECURITY_CONTEXT, context);
        raw.save(session);

        Session loaded = (Session) raw.findById(session.getId());
        assertThat(loaded).as("the session was not found after being saved").isNotNull();

        SecurityContext back = loaded.getAttribute(SECURITY_CONTEXT);
        return back.getAuthentication().getPrincipal();
    }
}
