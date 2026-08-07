package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import fr.bonapphedi.config.ClientRegistrationConfig;
import fr.bonapphedi.config.OAuthProperties;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/**
 * The guard on the endpoint overrides added for the acceptance run.
 *
 * <p>{@link AuthOverriddenEndpointsTest} proves a provider can be pointed at a
 * local issuer. This is the other half: proving it cannot be done in production,
 * where the same configuration would mean sign-in trusting a different identity
 * provider while looking entirely normal. Nobody would see it — the buttons
 * render, the round trip completes, and the accounts arriving are whoever that
 * issuer says they are.
 *
 * <p>{@code ProductionProfileTest.holdsNoSecrets} refuses any {@code bah.oauth}
 * key in {@code application-prod.yml} and would catch the case in that file. It
 * is not enough, for two reasons: it reads a file, and production takes its
 * credentials from environment variables set by the systemd unit, so
 * {@code BAH_OAUTH_GOOGLE_AUTHORIZATIONURI} never appears in any YAML. Its stated
 * reason is also credentials rather than endpoints, so narrowing that matcher to
 * client-id and client-secret would look like a tidy-up and would remove the
 * protection.
 *
 * <p>Tested against the configuration class directly rather than by starting a
 * context under the prod profile, for the reason {@code ProductionProfileTest}
 * gives: that profile writes to {@code /var/log/bonapphedi} and binds a loopback
 * port, neither of which belongs in a unit test run.
 *
 * <p>Confirmed to fail by removing the profile check once, rather than assumed:
 * a guard that has never been seen to refuse anything is indistinguishable from
 * one that does not work.
 */
class OverriddenEndpointsInProductionTest {

    private static final OAuthProperties OVERRIDDEN = new OAuthProperties(Map.of(
            "google",
            new OAuthProperties.Credentials(
                    "id",
                    "secret",
                    "http://localhost:9779",
                    "http://127.0.0.1:9779/authorize",
                    "http://127.0.0.1:9779/token",
                    "http://127.0.0.1:9779/userinfo",
                    "http://127.0.0.1:9779/jwks")));

    private static final OAuthProperties ORDINARY = new OAuthProperties(
            Map.of("google", new OAuthProperties.Credentials("id", "secret", null, null, null, null, null)));

    private final ClientRegistrationConfig config = new ClientRegistrationConfig();

    @Test
    void refusesToStartWhenProductionPointsSignInSomewhereElse() {
        assertThatThrownBy(() -> config.configuredProviders(OVERRIDDEN, profiles("prod")))
                .isInstanceOf(IllegalStateException.class)
                // The message has to say which provider and what to clear. A
                // refusal to boot that does not explain itself costs an outage's
                // worth of guessing at three in the morning.
                .hasMessageContaining("bah.oauth.google")
                .hasMessageContaining("authorization-uri");
    }

    @Test
    void allowsTheOverridesEverywhereElse() {
        // The acceptance run is the whole reason these exist, and it runs under
        // no profile at all. This is the assertion that fails if the guard is
        // ever widened from "not in production" to "never".
        assertThatCode(() -> config.configuredProviders(OVERRIDDEN, profiles()))
                .doesNotThrowAnyException();

        assertThat(config.configuredProviders(OVERRIDDEN, profiles()).registrations()).hasSize(1);
    }

    @Test
    void leavesAnOrdinaryProductionProviderAlone() {
        // The guard must not fire on the deployment that actually exists. Google
        // configured normally under prod is the live site.
        assertThatCode(() -> config.configuredProviders(ORDINARY, profiles("prod")))
                .doesNotThrowAnyException();

        assertThat(config.configuredProviders(ORDINARY, profiles("prod")).registrations()).hasSize(1);
    }

    @Test
    void saysNothingAboutAProviderWithNoCredentials() {
        // Blank credentials mean the provider is skipped entirely (ADR 0003), and
        // that has to keep happening before the guard is consulted - otherwise a
        // half-configured leftover in production becomes a boot failure instead
        // of the "sign-in is switched off" that ADR promises.
        OAuthProperties halfConfigured = new OAuthProperties(Map.of(
                "google",
                new OAuthProperties.Credentials(
                        "", "", null, "http://127.0.0.1:9779/authorize", null, null, null)));

        assertThatCode(() -> config.configuredProviders(halfConfigured, profiles("prod")))
                .doesNotThrowAnyException();

        assertThat(config.configuredProviders(halfConfigured, profiles("prod")).registrations())
                .isEmpty();
    }

    private static MockEnvironment profiles(String... active) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(active);
        return environment;
    }
}
