package fr.bonapphedi.auth;

/**
 * Where to send a visitor once they have signed in.
 *
 * <p>Sign-in is a full-page redirect away from the site and back, so the page
 * they were reading is lost unless it is carried across deliberately. It arrives
 * as a query parameter on the authorization request, which means it arrives from
 * whoever wrote the link — and an unchecked redirect target is a phishing
 * primitive, not a convenience: a link to <em>this</em> site's real sign-in,
 * carrying {@code returnTo=https://evil.example}, signs the visitor in for real
 * and then hands them to a copy of the site that asks for their password. The
 * redirect is what lends the copy its credibility.
 *
 * <p>So only rooted, same-site paths survive, and anything else quietly becomes
 * the home page. Quietly on purpose: someone who followed a rewritten link
 * should land somewhere harmless rather than on an error that tells the person
 * who rewrote it what to try next.
 */
public final class ReturnPath {

    /** Where the path waits while the visitor is away at the provider. */
    public static final String SESSION_KEY = "bah.sign-in.return-to";

    private static final String HOME = "/";

    /** Nothing legitimate is longer, and a session is not a stranger's scratchpad. */
    private static final int MAX_LENGTH = 512;

    private ReturnPath() {}

    public static String sanitize(String candidate) {
        if (candidate == null) {
            return HOME;
        }

        String path = candidate.trim();

        if (path.isEmpty() || path.length() > MAX_LENGTH) {
            return HOME;
        }
        // Must be a path on this site, so an absolute URL and a bare "fr/..."
        // are both out.
        if (!path.startsWith("/")) {
            return HOME;
        }
        // "//evil.example" is not a path. A browser reads it as a URL on the
        // current scheme and leaves the site - the case people forget.
        if (path.startsWith("//")) {
            return HOME;
        }
        // Some browsers normalise backslashes to forward slashes, which makes
        // "/\evil.example" the same trick wearing a different hat.
        if (path.contains("\\")) {
            return HOME;
        }

        return path;
    }
}
