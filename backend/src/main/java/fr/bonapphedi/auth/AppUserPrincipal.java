package fr.bonapphedi.auth;

import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

/**
 * Who the request is, as Spring Security sees it.
 *
 * <p>Wraps the local {@code app_user} row rather than the provider's attribute
 * map, because everything downstream cares about the local id - a comment is
 * written against it - and nothing cares what Google called the field.
 *
 * <p>{@code ROLE_ADMIN} is derived from the row, which was itself recomputed
 * from the allowlist at login. Being an admin is therefore never older than the
 * last sign-in.
 */
public class AppUserPrincipal implements OAuth2User, Serializable {

    private final AppUser user;

    public AppUserPrincipal(AppUser user) {
        this.user = user;
    }

    public AppUser user() {
        return user;
    }

    @Override
    public Map<String, Object> getAttributes() {
        return Map.of("id", user.id(), "provider", user.provider());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return user.admin()
                ? List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_ADMIN"))
                : List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    /**
     * Stored in {@code SPRING_SESSION.PRINCIPAL_NAME}, so it has to be stable for
     * the life of the account. The provider pair is; the display name is not.
     */
    @Override
    public String getName() {
        return user.provider() + ":" + user.providerUserId();
    }
}
