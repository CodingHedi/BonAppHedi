package fr.bonapphedi.auth;

import java.io.Serializable;

/**
 * A row of {@code app_user}.
 *
 * <p>Serializable because it ends up inside the {@code SecurityContext}, which
 * Spring Session writes to {@code SPRING_SESSION_ATTRIBUTES} as a blob. A field
 * added here that is not itself serializable turns every login into a 500 at the
 * moment the session is saved.
 *
 * <p>The chosen avatar is deliberately <em>not</em> here, though the column sits
 * beside these. This object is a snapshot taken at sign-in and then held in the
 * session for as long as it lasts, so a copy of the avatar would go stale the
 * moment the visitor changed it — showing the old one until the next login, in
 * the very session that just changed it. It is read from {@code app_user} where
 * it is needed instead (ADR 7).
 */
public record AppUser(
        long id, String provider, String providerUserId, String displayName, String email, boolean admin)
        implements Serializable {}
