package fr.bonapphedi.config;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code bah.oauth.<provider>.client-id} / {@code .client-secret}.
 *
 * <p>These exist instead of Spring's own
 * {@code spring.security.oauth2.client.registration.*} for one reason: Spring
 * rejects a blank client-id while binding, so an unset environment variable
 * would be a failure to boot rather than "sign-in is switched off". Here blank
 * means the provider is skipped, and no providers at all is a state the app
 * serves happily (ADR 0003).
 */
@ConfigurationProperties("bah")
public record OAuthProperties(Map<String, Credentials> oauth) {

    public OAuthProperties {
        oauth = oauth == null ? Map.of() : oauth;
    }

    public record Credentials(String clientId, String clientSecret) {

        /** Half-filled counts as absent: a client-id with no secret cannot work. */
        boolean usable() {
            return clientId != null
                    && !clientId.isBlank()
                    && clientSecret != null
                    && !clientSecret.isBlank();
        }
    }
}
