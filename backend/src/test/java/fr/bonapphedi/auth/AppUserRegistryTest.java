package fr.bonapphedi.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

/**
 * What happens to the {@code app_user} row each time somebody signs in.
 *
 * <p>Login is an upsert, not an insert, and that is the whole point of these:
 * the provider is the source of truth for the name and the avatar, so both are
 * refreshed on every sign-in rather than frozen at first contact. Admin is
 * recomputed from the allowlist at the same moment, which is what makes deleting
 * an address from the configuration a real demotion rather than a note to
 * self (ADR 0003).
 */
@SpringBootTest
@TestPropertySource(properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-users.db?foreign_keys=on")
class AppUserRegistryTest {

    @Autowired
    private JdbcClient jdbc;

    /** The seed carries no users, but the file is reused across runs. */
    @BeforeEach
    void clearUsers() {
        jdbc.sql("DELETE FROM app_user").update();
    }

    private AppUserRegistry registryFor(String... adminEmails) {
        return new AppUserRegistry(jdbc, Set.of(adminEmails));
    }

    private ProviderProfile hedi() {
        return new ProviderProfile("google", "112233", "Hédi", "hedi@example.com", null);
    }

    @Test
    void createsTheAccountOnFirstSignIn() {
        AppUser user = registryFor().login(hedi());

        assertThat(user.id()).isPositive();
        assertThat(user.displayName()).isEqualTo("Hédi");
        assertThat(user.admin()).isFalse();
        assertThat(countUsers()).isEqualTo(1);
    }

    @Test
    void recognisesTheSameAccountOnEveryLaterSignIn() {
        long first = registryFor().login(hedi()).id();
        long second = registryFor().login(hedi()).id();

        // A second row would orphan every comment already written under the
        // first, since comment.user_id points at the id and not at the provider.
        assertThat(second).isEqualTo(first);
        assertThat(countUsers()).isEqualTo(1);
    }

    @Test
    void refreshesTheProfileTheProviderSends() {
        registryFor().login(hedi());

        AppUser renamed = registryFor()
                .login(new ProviderProfile(
                        "google", "112233", "Hédi S.", "hedi@example.com", "https://example.com/a.png"));

        assertThat(renamed.displayName()).isEqualTo("Hédi S.");
        assertThat(renamed.avatarUrl()).isEqualTo("https://example.com/a.png");
    }

    @Test
    void grantsAdminToAnAddressOnTheAllowlist() {
        AppUser user = registryFor("hedi@example.com").login(hedi());

        assertThat(user.admin()).isTrue();
        assertThat(isAdminInDatabase("112233")).isTrue();
    }

    @Test
    void matchesTheAllowlistWithoutRegardToCase() {
        // Providers are not consistent about the case they send an address in,
        // and an allowlist that misses because of it locks the owner out of the
        // admin area with no visible reason.
        AppUser user = registryFor("Hedi@Example.com")
                .login(new ProviderProfile("google", "112233", "Hédi", "HEDI@example.com", null));

        assertThat(user.admin()).isTrue();
    }

    @Test
    void demotesAnAccountRemovedFromTheAllowlist() {
        assertThat(registryFor("hedi@example.com").login(hedi()).admin()).isTrue();

        // Same account, next login, address no longer configured.
        AppUser after = registryFor().login(hedi());

        assertThat(after.admin()).isFalse();
        assertThat(isAdminInDatabase("112233")).isFalse();
    }

    @Test
    void neverGrantsAdminToAnAccountWithNoEmail() {
        // Facebook withholds the address until app review passes. An empty
        // allowlist entry must not match an empty email and hand over the site.
        AppUser user = registryFor("").login(new ProviderProfile("facebook", "998877", "Camille", null, null));

        assertThat(user.admin()).isFalse();
    }

    @Test
    void treatsTheSameIdentifierOnTwoProvidersAsTwoPeople() {
        registryFor().login(new ProviderProfile("google", "112233", "Hédi", "hedi@example.com", null));
        registryFor().login(new ProviderProfile("facebook", "112233", "Camille", "camille@example.com", null));

        assertThat(countUsers()).isEqualTo(2);
    }

    private int countUsers() {
        return jdbc.sql("SELECT count(*) FROM app_user").query(Integer.class).single();
    }

    private boolean isAdminInDatabase(String providerUserId) {
        return jdbc.sql("SELECT is_admin FROM app_user WHERE provider_user_id = ?")
                        .param(providerUserId)
                        .query(Integer.class)
                        .single()
                == 1;
    }
}
