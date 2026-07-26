package fr.bonapphedi.auth;

import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;

/**
 * The non-OIDC arm of login: fetch the profile, then make it a local account.
 *
 * <p>Facebook comes through here. {@code super.loadUser} does the HTTP call and
 * everything after it is ours, which is the point at which a stranger becomes a
 * row and an admin decision gets made.
 */
@Component
public class AppUserOAuth2UserService extends DefaultOAuth2UserService {

    private final AppUserRegistry registry;

    public AppUserOAuth2UserService(AppUserRegistry registry) {
        this.registry = registry;
    }

    @Override
    public OAuth2User loadUser(OAuth2UserRequest request) {
        OAuth2User user = super.loadUser(request);
        String provider = request.getClientRegistration().getRegistrationId();

        return new AppUserPrincipal(registry.login(ProviderProfile.from(provider, user.getAttributes())));
    }
}
