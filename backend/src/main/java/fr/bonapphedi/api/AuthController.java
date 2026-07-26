package fr.bonapphedi.api;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import fr.bonapphedi.config.ConfiguredProviders;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The two things the frontend asks about identity.
 *
 * <p>Signing in is not here and cannot be: it is a browser navigation to
 * {@code /oauth2/authorization/{id}}, handled by a Spring Security filter, and
 * the promise the frontend's {@code signIn()} returns never settles because the
 * page is being torn down. Signing out is not here either - it is the logout
 * filter, so that invalidating the session and clearing the cookie are one thing
 * that cannot half-happen.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final ConfiguredProviders providers;

    public AuthController(ConfiguredProviders providers) {
        this.providers = providers;
    }

    /**
     * Whatever this instance holds credentials for, possibly nothing. An empty
     * list is a real answer and the sign-in row renders an unavailable notice
     * rather than buttons that cannot work (ADR 0003).
     */
    @GetMapping("/providers")
    public List<Dto.AuthProvider> providers() {
        return providers.registrations().stream()
                // getClientName() is the brand name Spring's own provider
                // definitions carry - "Google", "Facebook" - so the label is
                // never invented here and never translated.
                .map(registration ->
                        new Dto.AuthProvider(registration.getRegistrationId(), registration.getClientName()))
                .toList();
    }

    /**
     * Who this request is, if anyone.
     *
     * <p>204 for a visitor who has not signed in: that is the ordinary state of
     * almost every request to this site, not a failure, and a 401 here would
     * make the browser console of a perfectly healthy page look broken. Angular
     * reads an empty body as {@code null}, which is exactly what
     * {@code AuthApi.session()} promises.
     */
    @GetMapping("/session")
    public ResponseEntity<Dto.AuthUser> session(@AuthenticationPrincipal AppUserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.noContent().build();
        }

        AppUser user = principal.user();
        return ResponseEntity.ok(new Dto.AuthUser(
                // A string on the wire because models.ts says so, even though the
                // column is an integer.
                String.valueOf(user.id()), user.displayName(), user.avatarUrl(), user.admin()));
    }
}
