package fr.bonapphedi.web;

/**
 * Escaping for the three documents this package writes by hand.
 *
 * <p>One implementation rather than one per document, because the failure is
 * not gradual. A recipe titled "Sel &amp; poivre" makes a feed unparseable, and
 * a reader's answer to malformed XML is to show nothing at all — not the item,
 * the whole feed. The same escaping serves the HTML attributes spliced into the
 * shell, where the characters and the rules are identical.
 *
 * <p>Titles and excerpts are author-controlled rather than visitor-controlled,
 * which lowers the stakes and changes nothing about the requirement.
 */
final class Xml {

    private Xml() {}

    /**
     * Ampersand first, or the escapes introduced after it are escaped again.
     * The single quote is left alone: every attribute written here is delimited
     * with double quotes, and {@code &apos;} is the one entity XML 1.0 defines
     * that HTML 4 does not, so emitting it into the shell would be the only
     * character here that renders differently in the two documents.
     */
    static String escape(String value) {
        return value == null
                ? ""
                : value.replace("&", "&amp;")
                        .replace("<", "&lt;")
                        .replace(">", "&gt;")
                        .replace("\"", "&quot;");
    }
}
