package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

/**
 * What {@code application-prod.yml} promises.
 *
 * <p>Read as a file rather than by starting a context under the profile, on
 * purpose: the profile writes to {@code /var/log/bonapphedi} and binds a
 * loopback port, neither of which is a thing to do on a developer's machine to
 * find out whether a flag is set. What is worth pinning is the handful of values
 * whose absence is invisible until it matters, and those are all statements the
 * file makes.
 *
 * <p>Every assertion here has a failure it prevents, named in its comment. None
 * of them would be noticed in review of a diff that removed them, because a
 * missing line looks like nothing at all.
 */
class ProductionProfileTest {

    private static final Properties PROD = load("application-prod.yml");

    private static Properties load(String file) {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource(file));
        Properties properties = yaml.getObject();

        if (properties == null || properties.isEmpty()) {
            throw new AssertionError(file + " is missing or empty, so this test compared nothing");
        }
        return properties;
    }

    @Test
    void keepsTheSessionCookieOffThePlainWire() {
        // Without `secure`, one http:// request carries a live session id in
        // clear text. Caddy redirects to https, but the first request of the day
        // is often the plain one.
        assertThat(PROD.getProperty("server.servlet.session.cookie.secure")).isEqualTo("true");
        assertThat(PROD.getProperty("server.servlet.session.cookie.http-only")).isEqualTo("true");
    }

    @Test
    void keepsSameSiteLaxRatherThanStrict() {
        // Strict looks safer and breaks sign-in: the browser withholds the
        // cookie on the return leg from Google, so the callback lands without a
        // session and the visitor is bounced back to where they started, having
        // apparently signed in successfully.
        assertThat(PROD.getProperty("server.servlet.session.cookie.same-site")).isEqualTo("lax");
    }

    @Test
    void listensOnLoopbackOnly() {
        // Caddy terminates TLS and proxies in. Bound to 0.0.0.0 the application
        // also answers on http://<vps-ip>:8080 in plaintext, which bypasses the
        // certificate and every header Caddy adds.
        assertThat(PROD.getProperty("server.address")).isEqualTo("127.0.0.1");
    }

    @Test
    void trustsTheProxyForSchemeAndHost() {
        // The one that breaks OAuth. Without it Spring builds every redirect as
        // http:// on the internal host, Google receives a redirect_uri that does
        // not match what is registered, and the error reads as the provider's
        // fault rather than a missing line of configuration.
        assertThat(PROD.getProperty("server.forward-headers-strategy")).isEqualTo("framework");
    }

    @Test
    void putsTheDatabaseSomewhereDeliberate() {
        // Not the working directory: for a systemd unit that is wherever
        // WorkingDirectory points, which is not a place anybody thinks to back
        // up. Overridable by BAH_DB, as everywhere else.
        assertThat(PROD.getProperty("spring.datasource.url"))
                .contains("/var/lib/bonapphedi/")
                .contains("${BAH_DB:")
                // The two SQLite flags that are load-bearing everywhere else
                // must not be dropped in the one profile that matters (ADR 0002).
                .contains("foreign_keys=on")
                .contains("busy_timeout=");
    }

    @Test
    void putsThePhotographsSomewhereTheServiceMayActuallyWrite() {
        // The same trap as the database above, and it had already been sprung
        // once: the systemd unit sets ProtectSystem=strict with
        // ReadWritePaths=/var/lib/bonapphedi /var/log/bonapphedi, so everything
        // else on the disk - including WorkingDirectory - is read-only to the
        // service.
        //
        // bah.media.dir defaulted to ./data/images and was declared nowhere but
        // a @Value in MediaStorage, so it resolved under /opt/bonapphedi and
        // could not be created at all. That failure is silent by design:
        // installSeedImages logs and carries on, and because image_file is
        // populated in the database the site then serves <img> tags whose
        // requests 404. Broken pictures, not placeholders.
        assertThat(PROD.getProperty("bah.media.dir"))
                .as("must sit inside the unit's ReadWritePaths")
                .startsWith("${BAH_MEDIA_DIR:/var/lib/bonapphedi/");
    }

    @Test
    void holdsNoSecrets() {
        // Credentials come from the environment through the systemd unit, so a
        // copy of the jar carries none. This fails if somebody ever pastes a
        // real value in here to get a deploy working.
        assertThat(PROD.stringPropertyNames())
                .as("a credential key has appeared in a file that ships inside the jar")
                .noneMatch(key -> key.startsWith("bah.oauth")
                        || key.equals("bah.admin.emails")
                        || key.equals("bah.security.fingerprint-salt"));
    }

    @Test
    void stopsGracefullySoADeployDoesNotDropAComment() {
        assertThat(PROD.getProperty("server.shutdown")).isEqualTo("graceful");
        assertThat(PROD.getProperty("spring.lifecycle.timeout-per-shutdown-phase")).isNotBlank();
    }
}
