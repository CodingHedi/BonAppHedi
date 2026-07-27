package fr.bonapphedi.auth;

import java.util.Map;

/**
 * One person as a provider describes them, flattened to the three fields
 * {@code app_user} takes from them.
 *
 * <p>Google and Facebook agree on none of it. The identifier is {@code sub} on
 * one and {@code id} on the other. None of that fails loudly if read wrongly - it
 * produces an account called {@code null} - so the mapping is explicit per
 * provider instead of a hopeful list of candidate keys.
 *
 * <p>The picture each provider sends is <em>not read at all</em>, which is the
 * point rather than an omission (ADR 7). It used to be mapped here — including
 * Facebook's {@code picture.data.url}, which is an object rather than a string —
 * stored on the account, copied onto every comment, and rendered straight into
 * the thread, so reading a recipe disclosed the reader's address to Google.
 * Declining to render a URL still held would leave the personal data in the
 * database and the leak one template away; not reading it means there is nothing
 * to leak. An avatar is chosen on the site instead, and is a token rather than an
 * address — see {@link Avatar}.
 */
public record ProviderProfile(String provider, String providerUserId, String displayName, String email) {

    public static ProviderProfile from(String registrationId, Map<String, Object> attributes) {
        return switch (registrationId) {
            case "google" -> new ProviderProfile(
                    "google",
                    text(attributes, "sub"),
                    name(attributes, text(attributes, "email"), text(attributes, "sub")),
                    text(attributes, "email"));
            case "facebook" -> new ProviderProfile(
                    "facebook",
                    text(attributes, "id"),
                    name(attributes, text(attributes, "email"), text(attributes, "id")),
                    text(attributes, "email"));
            // app_user.provider carries a CHECK constraint listing these two.
            // Refusing here names the problem; letting it through names a
            // constraint violation three layers away.
            default -> throw new IllegalArgumentException("unsupported provider: " + registrationId);
        };
    }

    /**
     * {@code display_name} is NOT NULL and is shown against every comment the
     * account ever leaves, so an absent name falls back rather than propagating.
     * The local part of the address is a poor name but a printable one.
     */
    private static String name(Map<String, Object> attributes, String email, String id) {
        String name = text(attributes, "name");
        if (name != null) {
            return name;
        }
        if (email != null) {
            int at = email.indexOf('@');
            return at > 0 ? email.substring(0, at) : email;
        }
        return id;
    }

    /** Blank and absent are the same thing here: nothing worth storing. */
    private static String text(Map<String, Object> attributes, String key) {
        return attributes.get(key) instanceof String value && !value.isBlank() ? value : null;
    }
}
