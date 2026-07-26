package fr.bonapphedi.auth;

import java.util.Map;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.OidcUserInfo;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

/**
 * The same principal, for providers that speak OpenID Connect.
 *
 * <p>This exists only because Google does. Requesting the {@code openid} scope
 * routes login through {@code OidcAuthorizationCodeAuthenticationProvider},
 * which will not accept a user service returning a plain {@code OAuth2User} -
 * so the Google path needs a principal that is also an {@link OidcUser}, while
 * Facebook's stays the base type.
 *
 * <p>Both extend {@link AppUserPrincipal}, which is what lets the rest of the
 * application ask for one type and never learn which provider was used.
 */
public class AppUserOidcPrincipal extends AppUserPrincipal implements OidcUser {

    private final OidcIdToken idToken;
    private final OidcUserInfo userInfo;

    public AppUserOidcPrincipal(AppUser user, OidcIdToken idToken, OidcUserInfo userInfo) {
        super(user);
        this.idToken = idToken;
        this.userInfo = userInfo;
    }

    @Override
    public Map<String, Object> getClaims() {
        return idToken == null ? Map.of() : idToken.getClaims();
    }

    @Override
    public OidcUserInfo getUserInfo() {
        return userInfo;
    }

    @Override
    public OidcIdToken getIdToken() {
        return idToken;
    }
}
