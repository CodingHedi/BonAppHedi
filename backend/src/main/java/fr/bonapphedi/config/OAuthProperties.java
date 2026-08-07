package fr.bonapphedi.config;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code bah.oauth.<provider>.client-id} / {@code .client-secret}, and
 * optionally the endpoints to reach that provider at.
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

    /**
     * Credentials, plus four endpoints that are normally left alone.
     *
     * <p>The endpoints exist for the acceptance run, which points {@code google}
     * at a local OIDC issuer so the 40 specs needing a signed-in session can run
     * against the real backend at all. Left unset — which is every deployment —
     * the provider's own endpoints are used and nothing here has any effect.
     *
     * <p>The endpoints are named one by one rather than discovered from an
     * issuer, because {@code ClientRegistrations.fromIssuerLocation} fetches the
     * discovery document while the bean is being built — the application would
     * then refuse to start whenever the issuer was not already listening, which
     * is a boot-ordering trap the harness does not need. {@code issuerUri} below
     * is only the value the id_token's {@code iss} claim is checked against; it
     * is never dialled, and setting it triggers no discovery.
     */
    public record Credentials(
            String clientId,
            String clientSecret,
            String issuerUri,
            String authorizationUri,
            String tokenUri,
            String userInfoUri,
            String jwkSetUri) {

        /** Half-filled counts as absent: a client-id with no secret cannot work. */
        boolean usable() {
            return clientId != null
                    && !clientId.isBlank()
                    && clientSecret != null
                    && !clientSecret.isBlank();
        }

        /**
         * True when this provider has been pointed somewhere other than its real
         * endpoints — the acceptance run, and nothing else. Read by
         * {@code ProductionProfileTest}, which fails if production ever says yes.
         */
        public boolean hasEndpointOverrides() {
            return set(issuerUri)
                    || set(authorizationUri)
                    || set(tokenUri)
                    || set(userInfoUri)
                    || set(jwkSetUri);
        }

        private static boolean set(String value) {
            return value != null && !value.isBlank();
        }
    }
}
