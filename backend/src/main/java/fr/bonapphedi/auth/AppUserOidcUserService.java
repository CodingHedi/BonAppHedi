package fr.bonapphedi.auth;

import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;

/**
 * The OIDC arm of login. Google comes through here rather than through
 * {@link AppUserOAuth2UserService}, because it is asked for the {@code openid}
 * scope - configuring only the OAuth2 user service would leave this path on
 * Spring's default and the local account would never be created.
 */
@Component
public class AppUserOidcUserService extends OidcUserService {

    private final AppUserRegistry registry;

    public AppUserOidcUserService(AppUserRegistry registry) {
        this.registry = registry;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest request) {
        OidcUser user = super.loadUser(request);
        String provider = request.getClientRegistration().getRegistrationId();
        AppUser appUser = registry.login(ProviderProfile.from(provider, user.getAttributes()));

        return new AppUserOidcPrincipal(appUser, user.getIdToken(), user.getUserInfo());
    }
}
