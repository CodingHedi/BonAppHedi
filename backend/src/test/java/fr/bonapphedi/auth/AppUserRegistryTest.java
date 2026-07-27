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
 * the provider is the source of truth for the name and the address, so both are
 * refreshed on every sign-in rather than frozen at first contact. Admin is
 * recomputed from the allowlist at the same moment, which is what makes deleting
 * an address from the configuration a real demotion rather than a note to
 * self (ADR 0003).
 *
 * <p>The avatar is the exception and is tested as one: it is chosen on this site
 * rather than sent by the provider (ADR 7), so it is the one column a later login
 * must leave alone.
 */
@SpringBootTest
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:sqlite:file:./target/test-users.db?foreign_keys=on",
            "bah.admin.emails=configured@example.com"
        })
class AppUserRegistryTest {

    @Autowired
    private JdbcClient jdbc;

    /**
     * The bean as Spring built it, rather than one constructed here. Every other
     * test in this class passes its own allowlist in, which proves the logic and
     * proves nothing at all about the property it is normally read from - rename
     * that key and admin silently stops working with a green suite behind it.
     */
    @Autowired
    private AppUserRegistry configured;

    /** The seed carries no users, but the file is reused across runs. */
    @BeforeEach
    void clearUsers() {
        jdbc.sql("DELETE FROM app_user").update();
    }

    private AppUserRegistry registryFor(String... adminEmails) {
        return new AppUserRegistry(jdbc, Set.of(adminEmails));
    }

    private ProviderProfile hedi() {
        return new ProviderProfile("google", "112233", "Hédi", "hedi@example.com");
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
    void refreshesTheNameTheProviderSends() {
        registryFor().login(hedi());

        AppUser renamed =
                registryFor().login(new ProviderProfile("google", "112233", "Hédi S.", "hedi@example.com"));

        assertThat(renamed.displayName()).isEqualTo("Hédi S.");
    }

    @Test
    void keepsTheAvatarTheVisitorChoseAcrossLaterLogins() {
        AppUserRegistry registry = registryFor();
        long id = registry.login(hedi()).id();

        registry.chooseAvatar(id, "carrot/3");

        // The upsert refreshes the name, the address and admin on every sign-in,
        // because the provider owns all three. It must not touch the avatar,
        // which the provider knows nothing about: an ON CONFLICT that listed
        // every column would reset the choice to NULL on the next login and look
        // exactly like the profile page having failed to save.
        registry.login(hedi());

        assertThat(registry.avatarOf(id)).isEqualTo("carrot/3");
    }

    @Test
    void neverStoresAPictureTheProviderSent() {
        // Through `from()` rather than the constructor, so this covers the mapping
        // as well as the insert. The whole of ADR 7 is that the URL is not read,
        // so there is nothing to leak rather than a value we decline to render.
        registryFor()
                .login(ProviderProfile.from(
                        "google",
                        java.util.Map.of(
                                "sub", "112233",
                                "name", "Hédi",
                                "email", "hedi@example.com",
                                "picture", "https://lh3.googleusercontent.com/a/abc")));

        // Every column of the row as text, so this catches the URL wherever it
        // might have been put — including a column added after this was written.
        assertThat(rowAsText("112233")).doesNotContain("googleusercontent");
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
                .login(new ProviderProfile("google", "112233", "Hédi", "HEDI@example.com"));

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
        AppUser user = registryFor("").login(new ProviderProfile("facebook", "998877", "Camille", null));

        assertThat(user.admin()).isFalse();
    }

    @Test
    void readsTheAllowlistFromTheConfiguredProperty() {
        // The one test that fails if bah.admin.emails is renamed or misspelled.
        // README documents the key, so the code and the documentation disagreeing
        // has to be a failure rather than a discovery made months later.
        AppUser user =
                configured.login(new ProviderProfile("google", "445566", "Configured", "configured@example.com"));

        assertThat(user.admin()).isTrue();
    }

    @Test
    void treatsTheSameIdentifierOnTwoProvidersAsTwoPeople() {
        registryFor().login(new ProviderProfile("google", "112233", "Hédi", "hedi@example.com"));
        registryFor().login(new ProviderProfile("facebook", "112233", "Camille", "camille@example.com"));

        assertThat(countUsers()).isEqualTo(2);
    }

    private int countUsers() {
        return jdbc.sql("SELECT count(*) FROM app_user").query(Integer.class).single();
    }

    /** Every column of one row, concatenated, so an assertion can look at all of it. */
    private String rowAsText(String providerUserId) {
        return jdbc.sql("SELECT * FROM app_user WHERE provider_user_id = ?")
                .param(providerUserId)
                .query((rs, row) -> {
                    StringBuilder all = new StringBuilder();
                    for (int column = 1; column <= rs.getMetaData().getColumnCount(); column++) {
                        all.append(rs.getString(column)).append('\n');
                    }
                    return all.toString();
                })
                .single();
    }

    private boolean isAdminInDatabase(String providerUserId) {
        return jdbc.sql("SELECT is_admin FROM app_user WHERE provider_user_id = ?")
                        .param(providerUserId)
                        .query(Integer.class)
                        .single()
                == 1;
    }
}
