package fr.bonapphedi.auth;

import java.util.Optional;

/**
 * What may be stored in {@code app_user.nickname}.
 *
 * <p>The provider tells us a real name and some people do not want it on a public
 * comment. So an account may choose the name it is shown under, and this is the
 * guard on that choice: unlike the avatar it is free text, which makes it the
 * least constrained thing this site stores.
 *
 * <p>The rules are about what a name can do to the page it appears in, not about
 * taste. A byline is one line beside other people's names, so:
 *
 * <ul>
 *   <li><b>Whitespace is collapsed</b>, not merely trimmed. A run of spaces in the
 *       middle of a byline is indistinguishable from a layout bug.
 *   <li><b>Control and formatting characters are refused.</b> A right-to-left
 *       override makes the rest of the byline read backwards; a zero-width space
 *       makes two accounts identical on screen while the database sees two rows.
 *       Both are invisible in the stored value, which is what makes them worth a
 *       check rather than a review.
 *   <li><b>Length is counted in code points.</b> An emoji is two {@code char}s and
 *       one character to whoever typed it, so a limit written against
 *       {@code length()} silently halves the allowance for anyone outside the
 *       Basic Multilingual Plane.
 * </ul>
 *
 * <p>Nothing here concerns itself with impersonation. Names are not unique on this
 * site and making them unique would not help — the guard against somebody
 * appearing to be the author is that the author's own comments are the only ones
 * that carry the admin's account, which is not something a name can borrow.
 */
public final class DisplayName {

    /** Two, so that a name is at least pronounceable and not a stray keystroke. */
    public static final int MIN = 2;

    /** Thirty, which is longer than every name in the seed and fits one byline. */
    public static final int MAX = 30;

    private DisplayName() {}

    /**
     * The name as it should be stored, or empty if this is not one.
     *
     * <p>Returns the normalised form rather than a boolean because the caller must
     * store what was checked: validating the raw string and then writing it would
     * put the untrimmed version in the column and pass every test here.
     *
     * <p>Idempotent, so a name read back out of the database and saved again does
     * not drift.
     */
    public static Optional<String> normalise(String raw) {
        if (raw == null) {
            return Optional.empty();
        }

        // Collapsed first, so the length is measured on what will actually be
        // stored. `\s` covers the tab and the newline; the newline is refused
        // below regardless, but a name is not rejected for having been pasted
        // with an ordinary run of spaces in it.
        String collapsed = raw.strip().replaceAll("[ \t]+", " ");
        if (collapsed.isEmpty()) {
            return Optional.empty();
        }

        int length = collapsed.codePointCount(0, collapsed.length());
        if (length < MIN || length > MAX) {
            return Optional.empty();
        }

        if (collapsed.codePoints().anyMatch(DisplayName::isForbidden)) {
            return Optional.empty();
        }

        return Optional.of(collapsed);
    }

    /**
     * Characters that do something rather than say something.
     *
     * <p>{@code FORMAT} is the interesting category and the reason this is not a
     * simple {@code isISOControl} check: it holds the bidirectional overrides, the
     * zero-width space and joiner, and the byte-order mark, none of which are
     * control characters and all of which change how the line around them reads.
     *
     * <p>Refusing {@code FORMAT} also refuses the zero-width joiner that composes
     * multi-person emoji, which is a real if small cost and the right side of the
     * trade for a name in a byline.
     */
    private static boolean isForbidden(int codePoint) {
        return switch (Character.getType(codePoint)) {
            case Character.CONTROL,
                    Character.FORMAT,
                    Character.PRIVATE_USE,
                    Character.SURROGATE,
                    Character.UNASSIGNED,
                    Character.LINE_SEPARATOR,
                    Character.PARAGRAPH_SEPARATOR ->
                true;
            default -> false;
        };
    }
}
