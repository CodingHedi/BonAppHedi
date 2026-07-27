package fr.bonapphedi.auth;

import java.util.List;
import java.util.Set;

/**
 * What may be stored in {@code app_user.avatar}.
 *
 * <p>An avatar is a token — {@code carrot/3} — naming an icon and a tint slot,
 * chosen on the site from a closed set (ADR 7). It replaced the picture URL the
 * identity provider returned, which the comment thread rendered directly and
 * which therefore made reading a recipe disclose the reader's IP address to
 * Google.
 *
 * <p>The drawings live in the frontend's icon registry, because they are SVG
 * paths and nothing here renders anything. What lives here is the guard: choosing
 * an avatar is a write from a browser, so without a closed set the column takes
 * any string of any length. {@code AvatarTest} reads the frontend's list and
 * fails if the two disagree — the drift is silent otherwise, and one-directional:
 * an icon offered by the picker and missing here is a 400 on the one avatar
 * nobody thought to click.
 */
public final class Avatar {

    /**
     * The twelve icons the profile page offers.
     *
     * <p>A persisted vocabulary, not an enum. These strings are in the database
     * against real accounts, so a name may be added but never renamed or pointed
     * at a different drawing.
     */
    public static final List<String> ICONS = List.of(
            "carrot",
            "citrus",
            "cherry",
            "herb",
            "egg",
            "bread",
            "cupcake",
            "mushroom",
            "pot",
            "pan",
            "rolling-pin",
            "mug");

    /** Slots {@code 0} to {@code TINTS - 1}; the hues themselves are a stylesheet's business. */
    public static final int TINTS = 6;

    private static final Set<String> KNOWN = Set.copyOf(ICONS);

    private Avatar() {}

    /**
     * Whether this is a token the site could have written.
     *
     * <p>Strict about the spelling as well as the values, because the column is
     * compared as text and read back by a parser that is equally strict: accepting
     * {@code carrot/01} would store a row that renders as no avatar at all.
     */
    public static boolean isValid(String token) {
        if (token == null) {
            return false;
        }

        int slash = token.indexOf('/');
        if (slash < 0 || token.indexOf('/', slash + 1) >= 0) {
            return false;
        }

        String tint = token.substring(slash + 1);
        // Exactly one digit, so a leading zero, a sign, a space or an exponent is
        // rejected before the value is ever looked at.
        if (tint.length() != 1 || tint.charAt(0) < '0' || tint.charAt(0) >= '0' + TINTS) {
            return false;
        }

        return KNOWN.contains(token.substring(0, slash));
    }
}
