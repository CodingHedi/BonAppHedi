package fr.bonapphedi.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Where a visitor is sent after signing in.
 *
 * <p>The value arrives as a query parameter, which means it arrives from
 * whoever wrote the link — so it is an open-redirect hole unless it is checked.
 * The attack is worth stating plainly because the fix looks like paranoia
 * otherwise: a mail saying "sign in to BonApp' Hedi" links to this app's own
 * authorization endpoint with {@code returnTo=https://evil.example}, the visitor
 * really does sign in to the real site, and is then handed to a copy of it that
 * asks for their password. The redirect is what lends the attacker credibility.
 *
 * <p>So: same-site paths only, and everything else quietly becomes the home page
 * rather than an error. A visitor who followed a rewritten link should end up
 * somewhere harmless, not looking at a stack trace.
 */
class ReturnPathTest {

    @Test
    void keepsAnOrdinaryPageOnThisSite() {
        assertThat(ReturnPath.sanitize("/fr/recettes/babka-au-chocolat"))
                .isEqualTo("/fr/recettes/babka-au-chocolat");
        assertThat(ReturnPath.sanitize("/en/recipes/chocolate-babka#comments"))
                .isEqualTo("/en/recipes/chocolate-babka#comments");
        assertThat(ReturnPath.sanitize("/fr?tag=dessert")).isEqualTo("/fr?tag=dessert");
    }

    @Test
    void refusesAnAbsoluteUrl() {
        assertThat(ReturnPath.sanitize("https://evil.example/login")).isEqualTo("/");
        assertThat(ReturnPath.sanitize("http://evil.example")).isEqualTo("/");
    }

    @Test
    void refusesAProtocolRelativeUrl() {
        // The one people forget. "//evil.example" is not a path: a browser reads
        // it as a URL on the current scheme and leaves the site.
        assertThat(ReturnPath.sanitize("//evil.example/login")).isEqualTo("/");
        assertThat(ReturnPath.sanitize("//evil.example")).isEqualTo("/");
    }

    @Test
    void refusesTheBackslashSpellingOfTheSameTrick() {
        // Some browsers normalise backslashes to forward slashes in URLs, so
        // this is the protocol-relative case wearing a different hat.
        assertThat(ReturnPath.sanitize("\\\\evil.example")).isEqualTo("/");
        assertThat(ReturnPath.sanitize("/\\evil.example")).isEqualTo("/");
    }

    @Test
    void refusesAnythingThatIsNotARootedPath() {
        assertThat(ReturnPath.sanitize("fr/recettes")).isEqualTo("/");
        assertThat(ReturnPath.sanitize("javascript:alert(1)")).isEqualTo("/");
    }

    @Test
    void treatsNothingAtAllAsTheHomePage() {
        // The ordinary case for anyone who signed in from the home page itself.
        assertThat(ReturnPath.sanitize(null)).isEqualTo("/");
        assertThat(ReturnPath.sanitize("")).isEqualTo("/");
        assertThat(ReturnPath.sanitize("   ")).isEqualTo("/");
    }

    @Test
    void refusesSomethingImplausiblyLong() {
        // Nothing legitimate is this long, and a session attribute is not a
        // place to let a stranger store a kilobyte of whatever they like.
        assertThat(ReturnPath.sanitize("/" + "a".repeat(2000))).isEqualTo("/");
    }
}
