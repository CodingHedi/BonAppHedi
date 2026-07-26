package fr.bonapphedi.auth;

import java.io.Serializable;

/**
 * A row of {@code app_user}.
 *
 * <p>Serializable because it ends up inside the {@code SecurityContext}, which
 * Spring Session writes to {@code SPRING_SESSION_ATTRIBUTES} as a blob. A field
 * added here that is not itself serializable turns every login into a 500 at the
 * moment the session is saved.
 */
public record AppUser(
        long id,
        String provider,
        String providerUserId,
        String displayName,
        String email,
        String avatarUrl,
        boolean admin)
        implements Serializable {}
