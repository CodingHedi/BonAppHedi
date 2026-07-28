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
     * <p>Two forms, both current: {@code carrot/3} is the disc tint with the
     * accent ink, and {@code carrot/3/5} adds a chosen ink. The two-segment form
     * is not a legacy spelling to be migrated — it is how the neutral ink is
     * written, and every avatar chosen before inks existed is already spelled
     * that way. The frontend's {@code formatAvatar} writes exactly one of the two
     * for any given choice, so the column never holds two spellings of one
     * avatar.
     *
     * <p>Strict about the spelling as well as the values, because the column is
     * compared as text and read back by a parser that is equally strict: accepting
     * {@code carrot/01} would store a row that renders as no avatar at all.
     */
    public static boolean isValid(String token) {
        if (token == null) {
            return false;
        }

        int firstSlash = token.indexOf('/');
        if (firstSlash < 0 || !KNOWN.contains(token.substring(0, firstSlash))) {
            return false;
        }

        int secondSlash = token.indexOf('/', firstSlash + 1);
        if (secondSlash < 0) {
            return isSlot(token.substring(firstSlash + 1));
        }

        // A fourth segment is not something the picker can produce.
        if (token.indexOf('/', secondSlash + 1) >= 0) {
            return false;
        }

        return isSlot(token.substring(firstSlash + 1, secondSlash)) && isSlot(token.substring(secondSlash + 1));
    }

    /**
     * Exactly one digit inside the ramp.
     *
     * <p>The length check is what rejects a leading zero, a sign, a space and an
     * exponent, all before the value is looked at — {@code Integer.parseInt} would
     * accept several of them and store a row the frontend then renders as nothing.
     */
    private static boolean isSlot(String slot) {
        return slot.length() == 1 && slot.charAt(0) >= '0' && slot.charAt(0) < '0' + TINTS;
    }
}
