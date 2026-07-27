package fr.bonapphedi.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Reading a profile out of what a provider actually sends.
 *
 * <p>Pure mapping, so it is tested without a context: the interesting part is
 * that Google and Facebook agree on nothing — different key for the identifier,
 * and Facebook nests where Google is flat. Getting this wrong does not throw - it
 * produces a signed-in user called {@code null} - so each provider gets its own
 * assertion against the shape its documentation promises.
 *
 * <p>The picture each provider sends is deliberately not read (ADR 7). There is
 * no field here to assert about; what asserts it is
 * {@code AppUserRegistryTest.neverStoresAPictureTheProviderSent}, which follows a
 * profile carrying one all the way into the database and looks for it there.
 */
class ProviderProfileTest {

    @Test
    void readsAGoogleProfile() {
        ProviderProfile profile = ProviderProfile.from(
                "google",
                Map.of(
                        "sub", "112233",
                        "name", "Hédi",
                        "email", "hedi@example.com",
                        "picture", "https://lh3.googleusercontent.com/a/abc"));

        assertThat(profile.provider()).isEqualTo("google");
        assertThat(profile.providerUserId()).isEqualTo("112233");
        assertThat(profile.displayName()).isEqualTo("Hédi");
        assertThat(profile.email()).isEqualTo("hedi@example.com");
    }

    @Test
    void readsAFacebookProfile() {
        // graph.facebook.com/me?fields=id,name,email,picture returns the picture as
        // { "picture": { "data": { "url": ... } } }. It is still passed in here,
        // because that is what arrives and the mapping has to survive it.
        ProviderProfile profile = ProviderProfile.from(
                "facebook",
                Map.of(
                        "id", "998877",
                        "name", "Camille",
                        "email", "camille@example.com",
                        "picture", Map.of("data", Map.of("url", "https://graph.facebook.com/998877/picture"))));

        assertThat(profile.providerUserId()).isEqualTo("998877");
        assertThat(profile.displayName()).isEqualTo("Camille");
        assertThat(profile.email()).isEqualTo("camille@example.com");
    }

    @Test
    void survivesAProviderThatWithholdsTheEmail() {
        // Facebook only releases `email` once the app has passed review, so this
        // is the state every non-admin tester arrives in (ADR 0003). It has to be
        // a user with no email, not a failed login.
        ProviderProfile profile =
                ProviderProfile.from("facebook", Map.of("id", "998877", "name", "Camille"));

        assertThat(profile.email()).isNull();
        assertThat(profile.displayName()).isEqualTo("Camille");
    }

    @Test
    void fallsBackToSomethingPrintableWhenThereIsNoName() {
        // display_name is NOT NULL in the schema and the name is shown against
        // every comment, so an absent one cannot be allowed to become "null".
        ProviderProfile profile =
                ProviderProfile.from("google", Map.of("sub", "112233", "email", "hedi@example.com"));

        assertThat(profile.displayName()).isEqualTo("hedi");
    }

    @Test
    void rejectsAProviderItDoesNotKnow() {
        // The provider set is closed by a CHECK constraint on app_user. Failing
        // here beats failing on the insert with a constraint violation.
        assertThat(
                        org.assertj.core.api.Assertions.catchThrowable(
                                () -> ProviderProfile.from("github", Map.of("id", "1"))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
