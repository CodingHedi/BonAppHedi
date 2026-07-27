package fr.bonapphedi.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

/**
 * Which OAuth providers exist, decided at startup from configuration.
 *
 * <p>The frontend has no provider list of its own - it renders whatever
 * {@code GET /api/auth/providers} returns - so enabling Facebook is a pair of
 * environment variables and a restart, with nothing to redeploy (ADR 0003).
 */
@Configuration
@EnableConfigurationProperties(OAuthProperties.class)
public class ClientRegistrationConfig {

    /**
     * Endpoints, scopes and brand names come from {@link CommonOAuth2Provider};
     * only the credentials are ours. Facebook is the exception noted below.
     */
    @Bean
    public ConfiguredProviders configuredProviders(OAuthProperties properties) {
        List<ClientRegistration> registrations = new ArrayList<>();

        for (Map.Entry<String, OAuthProperties.Credentials> entry : properties.oauth().entrySet()) {
            if (!entry.getValue().usable()) {
                continue;
            }
            registrations.add(build(entry.getKey(), entry.getValue()));
        }

        return new ConfiguredProviders(List.copyOf(registrations));
    }

    private ClientRegistration build(String id, OAuthProperties.Credentials credentials) {
        ClientRegistration.Builder builder =
                switch (id) {
                    case "google" -> CommonOAuth2Provider.GOOGLE.getBuilder(id);
                    case "facebook" -> CommonOAuth2Provider.FACEBOOK
                            .getBuilder(id)
                            // The Graph API returns exactly the fields the URI
                            // names and nothing else, so they are named here
                            // rather than left to a default that could change
                            // under us (ADR 0003).
                            //
                            // `picture` is deliberately absent. It used to be
                            // asked for, and ADR 7 stopped anything reading it:
                            // an avatar is chosen on this site now. Continuing to
                            // request it would collect a URL to somebody's face
                            // on every Facebook sign-in and drop it on the floor,
                            // which is the thing that ADR argues against — not
                            // reading it is the whole point, and not asking is
                            // where that starts.
                            .userInfoUri("https://graph.facebook.com/me?fields=id,name,email");
                    default -> throw new IllegalStateException(
                            "bah.oauth." + id + " is configured but no such provider is supported");
                };

        return builder.clientId(credentials.clientId())
                .clientSecret(credentials.clientSecret())
                .build();
    }

    /**
     * Spring's own repository throws on an empty collection, so zero providers -
     * a fresh checkout, or a deployment that lost a secret - would be a boot
     * failure. This one simply knows nobody, and the security chain leaves
     * {@code oauth2Login} unwired to match.
     */
    @Bean
    public ClientRegistrationRepository clientRegistrationRepository(ConfiguredProviders providers) {
        return providers.none()
                ? registrationId -> null
                : new InMemoryClientRegistrationRepository(providers.registrations());
    }
}
