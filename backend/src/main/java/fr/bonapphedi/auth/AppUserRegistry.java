package fr.bonapphedi.auth;

import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Turns a sign-in into an {@code app_user} row.
 *
 * <p>An upsert rather than an insert, and the difference is the whole design:
 * the provider owns the name and the avatar, so both are refreshed on every
 * login instead of being frozen at first contact. The identity that must not
 * move is the primary key, because {@code comment.user_id} points at it - a
 * second row for the same person would orphan everything they had written.
 *
 * <p>Admin is recomputed here, at the same moment, from the configured
 * allowlist. That is what makes deleting an address from the configuration an
 * actual demotion rather than a note of intent (ADR 0003).
 */
@Component
public class AppUserRegistry {

    private final JdbcClient jdbc;
    private final Set<String> adminEmails;

    public AppUserRegistry(JdbcClient jdbc, @Value("${bah.admin-emails:}") Set<String> adminEmails) {
        this.jdbc = jdbc;
        // Normalised once, here, so the comparison below cannot forget to.
        this.adminEmails = adminEmails.stream()
                .filter(email -> !email.isBlank())
                .map(email -> email.trim().toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }

    public AppUser login(ProviderProfile profile) {
        boolean admin = isAdmin(profile.email());

        // ON CONFLICT against the (provider, provider_user_id) unique index, so
        // recognising a returning visitor is the database's job and not a
        // select-then-decide that two logins at once could both lose.
        jdbc.sql(
                        """
                        INSERT INTO app_user (
                            provider, provider_user_id, display_name, email, avatar_url, is_admin, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (provider, provider_user_id) DO UPDATE SET
                            display_name = excluded.display_name,
                            email        = excluded.email,
                            avatar_url   = excluded.avatar_url,
                            is_admin     = excluded.is_admin
                        """)
                .param(profile.provider())
                .param(profile.providerUserId())
                .param(profile.displayName())
                .param(profile.email())
                .param(profile.avatarUrl())
                .param(admin ? 1 : 0)
                .param(Instant.now().toString())
                .update();

        return jdbc.sql(
                        """
                        SELECT id, provider, provider_user_id, display_name, email, avatar_url, is_admin
                        FROM app_user
                        WHERE provider = ? AND provider_user_id = ?
                        """)
                .param(profile.provider())
                .param(profile.providerUserId())
                .query((rs, row) -> new AppUser(
                        rs.getLong("id"),
                        rs.getString("provider"),
                        rs.getString("provider_user_id"),
                        rs.getString("display_name"),
                        rs.getString("email"),
                        rs.getString("avatar_url"),
                        rs.getInt("is_admin") == 1))
                .single();
    }

    /**
     * An account with no email is never an admin. Facebook withholds the address
     * until app review passes, so this is an ordinary state rather than a
     * defensive check - and a blank allowlist entry matching a blank email would
     * hand the admin area to the first stranger who signs in.
     */
    private boolean isAdmin(String email) {
        return email != null && adminEmails.contains(email.trim().toLowerCase(Locale.ROOT));
    }
}
