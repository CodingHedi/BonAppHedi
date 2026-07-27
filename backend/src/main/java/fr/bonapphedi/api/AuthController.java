package fr.bonapphedi.api;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import fr.bonapphedi.auth.AppUserRegistry;
import fr.bonapphedi.auth.Avatar;
import fr.bonapphedi.config.ConfiguredProviders;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * What the frontend asks and tells this server about identity.
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
    private final AppUserRegistry users;

    public AuthController(ConfiguredProviders providers, AppUserRegistry users) {
        this.providers = providers;
        this.users = users;
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

        return ResponseEntity.ok(describe(principal.user()));
    }

    /**
     * Records the avatar this visitor chose on the profile page.
     *
     * <p>PUT rather than POST: choosing again replaces the choice, and doing it
     * twice leaves the account exactly as doing it once did.
     *
     * <p>The token is validated against {@link Avatar}, not trusted. This is a
     * write from a browser, so without the check the column takes any string of
     * any length from anyone who has signed in — and it is a closed set precisely
     * so that it can be checked.
     */
    @PutMapping("/avatar")
    public ResponseEntity<Dto.AuthUser> chooseAvatar(
            @RequestBody Dto.AvatarChoice choice, @AuthenticationPrincipal AppUserPrincipal principal) {

        // 401 rather than 403, as with posting a comment: the visitor is not
        // forbidden from having an avatar, they have not said who they are.
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        if (!Avatar.isValid(choice.avatar())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "not an avatar this site offers");
        }

        users.chooseAvatar(principal.user().id(), choice.avatar());

        // Described from the database, so the response carries what was actually
        // stored rather than what was asked for.
        return ResponseEntity.ok(describe(principal.user()));
    }

    /**
     * The signed-in user as the contract declares them.
     *
     * <p>The avatar is read from {@code app_user} on every call rather than taken
     * from the principal. The principal is a snapshot held in the session for as
     * long as it lasts, so a copy would show the old avatar until the next sign-in
     * — in the very session that had just changed it.
     */
    private Dto.AuthUser describe(AppUser user) {
        return new Dto.AuthUser(
                // A string on the wire because models.ts says so, even though the
                // column is an integer.
                String.valueOf(user.id()), user.displayName(), users.avatarOf(user.id()), user.admin());
    }
}
