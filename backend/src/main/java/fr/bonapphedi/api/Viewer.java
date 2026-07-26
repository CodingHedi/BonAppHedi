package fr.bonapphedi.api;

/**
 * Who is asking, for the parts of a read that differ per person.
 *
 * <p>Two independent identities, and a request can carry either, both or
 * neither: the visitor cookie says whose rating and reaction to report back, and
 * the account says whose pending comment is visible. Someone can have rated a
 * recipe years before ever signing in, so collapsing these into one would lose a
 * vote the moment they did.
 */
public record Viewer(String visitorId, Long userId) {

    private static final Viewer ANONYMOUS = new Viewer(null, null);

    /** A first-time reader: no cookie, no account, and nothing personal to report. */
    public static Viewer anonymous() {
        return ANONYMOUS;
    }
}
