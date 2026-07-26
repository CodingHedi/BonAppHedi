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
                            // The default user-info URI asks for nothing in
                            // particular, and the Graph API answers with nothing
                            // in particular: no name, no email, no picture. The
                            // fields have to be named (ADR 0003).
                            .userInfoUri("https://graph.facebook.com/me?fields=id,name,email,picture");
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
