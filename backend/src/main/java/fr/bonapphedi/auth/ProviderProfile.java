package fr.bonapphedi.auth;

import java.util.Map;

/**
 * One person as a provider describes them, flattened to the four fields
 * {@code app_user} keeps.
 *
 * <p>Google and Facebook agree on none of it. The identifier is {@code sub} on
 * one and {@code id} on the other, and Facebook returns the avatar as
 * {@code picture.data.url} rather than a string. None of that fails loudly if
 * read wrongly - it produces an account called {@code null} - so the mapping is
 * explicit per provider instead of a hopeful list of candidate keys.
 */
public record ProviderProfile(
        String provider, String providerUserId, String displayName, String email, String avatarUrl) {

    public static ProviderProfile from(String registrationId, Map<String, Object> attributes) {
        return switch (registrationId) {
            case "google" -> new ProviderProfile(
                    "google",
                    text(attributes, "sub"),
                    name(attributes, text(attributes, "email"), text(attributes, "sub")),
                    text(attributes, "email"),
                    text(attributes, "picture"));
            case "facebook" -> new ProviderProfile(
                    "facebook",
                    text(attributes, "id"),
                    name(attributes, text(attributes, "email"), text(attributes, "id")),
                    text(attributes, "email"),
                    facebookAvatar(attributes));
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

    /** {@code ?fields=...,picture} answers with an object, never a URL. */
    private static String facebookAvatar(Map<String, Object> attributes) {
        if (attributes.get("picture") instanceof Map<?, ?> picture
                && picture.get("data") instanceof Map<?, ?> data
                && data.get("url") instanceof String url
                && !url.isBlank()) {
            return url;
        }
        return null;
    }

    /** Blank and absent are the same thing here: nothing worth storing. */
    private static String text(Map<String, Object> attributes, String key) {
        return attributes.get(key) instanceof String value && !value.isBlank() ? value : null;
    }
}
