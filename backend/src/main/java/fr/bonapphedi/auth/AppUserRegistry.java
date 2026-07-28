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
 * the provider owns the name and the address, so both are refreshed on every
 * login instead of being frozen at first contact. The identity that must not
 * move is the primary key, because {@code comment.user_id} points at it - a
 * second row for the same person would orphan everything they had written.
 *
 * <p>Admin is recomputed here, at the same moment, from the configured
 * allowlist. That is what makes deleting an address from the configuration an
 * actual demotion rather than a note of intent (ADR 0003).
 *
 * <p>{@code avatar} and {@code nickname} are the columns the upsert leaves alone.
 * The provider used to own the picture and no longer does: it is chosen on this
 * site (ADR 7), so listing it in the {@code ON CONFLICT} clause would silently
 * reset the choice on the next sign-in and read exactly like the profile page
 * having failed to save. The chosen name is the same story, and is why it is a
 * column of its own rather than an overwrite of {@code display_name} — the
 * provider still owns that one and it is still refreshed on every login.
 */
@Component
public class AppUserRegistry {

    private final JdbcClient jdbc;
    private final Set<String> adminEmails;

    public AppUserRegistry(JdbcClient jdbc, @Value("${bah.admin.emails:}") Set<String> adminEmails) {
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
                            provider, provider_user_id, display_name, email, is_admin, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT (provider, provider_user_id) DO UPDATE SET
                            display_name = excluded.display_name,
                            email        = excluded.email,
                            is_admin     = excluded.is_admin
                        """)
                .param(profile.provider())
                .param(profile.providerUserId())
                .param(profile.displayName())
                .param(profile.email())
                .param(admin ? 1 : 0)
                .param(Instant.now().toString())
                .update();

        return jdbc.sql(
                        """
                        SELECT id, provider, provider_user_id, display_name, email, is_admin
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
                        rs.getInt("is_admin") == 1))
                .single();
    }

    /**
     * Records the avatar this account chose.
     *
     * <p>Validated by the caller, which is the controller: reaching the column
     * with an unchecked string would put anything a signed-in browser sends into
     * the row. This method trusts its argument and says so.
     */
    public void chooseAvatar(long userId, String token) {
        jdbc.sql("UPDATE app_user SET avatar = ? WHERE id = ?")
                .param(token)
                .param(userId)
                .update();
    }

    /**
     * The avatar this account currently holds, or null if it has never chosen one.
     *
     * <p>Read on demand rather than carried in the session, so that changing it
     * takes effect at once — including on the comments already posted, which is
     * the behaviour a profile page has to have to make any sense. Empty rather
     * than throwing for an id with no row: {@code oauth2Login()} in the test
     * suites stands up principals that were never inserted.
     */
    public String avatarOf(long userId) {
        return jdbc.sql("SELECT avatar FROM app_user WHERE id = ?")
                .param(userId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /**
     * Records the name this account chose to be shown under, or clears it.
     *
     * <p>Normalised by the caller, for the same reason the avatar is validated
     * there: this method trusts its argument and says so. {@code null} clears the
     * choice, after which the byline shows what the provider said again.
     */
    public void chooseNickname(long userId, String nickname) {
        jdbc.sql("UPDATE app_user SET nickname = ? WHERE id = ?")
                .param(nickname)
                .param(userId)
                .update();
    }

    /**
     * The chosen name, or null if this account has never chosen one.
     *
     * <p>Read on demand rather than carried in the session, exactly as the avatar
     * is: {@link AppUser} is a snapshot held for the life of the session, so a copy
     * here would show the old name until the next login — in the very session that
     * had just changed it.
     */
    public String nicknameOf(long userId) {
        return jdbc.sql("SELECT nickname FROM app_user WHERE id = ?")
                .param(userId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    /**
     * What this account should be shown as: the chosen name if there is one, and
     * the provider's otherwise.
     *
     * <p>One method rather than the {@code ?:} written at each call site, because
     * there are three of them — the session response, the byline copied onto a new
     * comment, and the rewrite of the copies on the ones already posted — and a
     * fallback forgotten at any one of them shows a blank name or the real one.
     */
    public String shownNameOf(AppUser user) {
        String chosen = nicknameOf(user.id());
        return chosen == null ? user.displayName() : chosen;
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
