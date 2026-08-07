package fr.bonapphedi.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
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
    public ConfiguredProviders configuredProviders(OAuthProperties properties, Environment environment) {
        List<ClientRegistration> registrations = new ArrayList<>();

        for (Map.Entry<String, OAuthProperties.Credentials> entry : properties.oauth().entrySet()) {
            if (!entry.getValue().usable()) {
                continue;
            }
            rejectOverridesInProduction(entry.getKey(), entry.getValue(), environment);
            registrations.add(build(entry.getKey(), entry.getValue()));
        }

        return new ConfiguredProviders(List.copyOf(registrations));
    }

    /**
     * Endpoint overrides exist for the acceptance run and must never be live.
     *
     * <p>{@code ProductionProfileTest} already refuses any {@code bah.oauth} key
     * in {@code application-prod.yml}, but that reads a file and production does
     * not get its credentials from one — they arrive as environment variables out
     * of the systemd unit, so {@code BAH_OAUTH_GOOGLE_AUTHORIZATIONURI} would go
     * straight past it. This is the check that sees them.
     *
     * <p>Refusing to start is the point. Sign-in silently pointed at a different
     * issuer is the one failure here worth being loud about: everything would
     * appear to work, and the accounts arriving would be whatever that issuer
     * said they were.
     */
    private void rejectOverridesInProduction(
            String id, OAuthProperties.Credentials credentials, Environment environment) {
        if (credentials.hasEndpointOverrides() && environment.matchesProfiles("prod")) {
            throw new IllegalStateException(
                    "bah.oauth." + id + " overrides its OAuth endpoints, which is for the acceptance run only. "
                            + "Under the prod profile the provider's real endpoints are the only ones allowed. "
                            + "Clear the authorization-uri, token-uri, user-info-uri and jwk-set-uri.");
        }
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

        builder.clientId(credentials.clientId()).clientSecret(credentials.clientSecret());

        // Normally nothing below applies. The acceptance run is the exception:
        // it points `google` at a local OIDC issuer so the specs that need a
        // signed-in session can run against the real backend, which they cannot
        // otherwise do - a click on the provider button leaves for Google and
        // never comes back.
        //
        // Applied one at a time, and on top of the provider's own definition
        // rather than instead of it, so the scopes and the brand name survive.
        // Rebuilding from nothing here would silently drop `openid` and the flow
        // would stop being OIDC - a failure that surfaces at the id_token,
        // nowhere near this line.
        // The issuer first, because it is the one that is not an address. It is
        // the identifier the id_token's `iss` claim is compared against, and
        // leaving Google's in place while pointing everywhere else at a local
        // issuer fails at the very last step of an otherwise perfect sign-in:
        // "The ID Token contains invalid claims: {iss=...}". Nothing ever
        // connects to it, so it does not have to be reachable and does not have
        // to agree with the host in the URIs below.
        apply(credentials.issuerUri(), builder::issuerUri);
        apply(credentials.authorizationUri(), builder::authorizationUri);
        apply(credentials.tokenUri(), builder::tokenUri);
        apply(credentials.userInfoUri(), builder::userInfoUri);
        apply(credentials.jwkSetUri(), builder::jwkSetUri);

        return builder.build();
    }

    private void apply(String uri, java.util.function.Consumer<String> to) {
        if (uri != null && !uri.isBlank()) {
            to.accept(uri);
        }
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
