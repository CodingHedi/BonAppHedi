package fr.bonapphedi.social;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who an anonymous visitor is, for the two things that are one-per-person and
 * need no account: a rating and a reaction.
 *
 * <p>Identity is a cookie, and the cookie is issued on the first <em>write</em>
 * rather than on arrival. That ordering is the point. Nothing is stored about
 * somebody who only reads a recipe, which is what keeps this a functional cookie
 * — it exists to make their own rating theirs — rather than one that would need
 * a consent banner in front of it.
 *
 * <p>A cookie alone is a weak claim, because clearing it is one keystroke. So
 * each cookie is recorded against a fingerprint: an HMAC of the address and the
 * user agent under a configured salt. The address itself is never written
 * anywhere, which the privacy page states plainly and this class has to honour.
 * Two cookies from one fingerprint is a household or a shared browser; the third
 * is somebody voting twice, and is refused.
 */
@Component
public class VisitorIdentity {

    /** Two, so a couple sharing a laptop are not mistaken for ballot-stuffing. */
    private static final int MAX_COOKIES_PER_FINGERPRINT = 2;

    static final String COOKIE = "bah-visitor";
    private static final Duration COOKIE_LIFE = Duration.ofDays(365);

    private static final Logger log = LoggerFactory.getLogger(VisitorIdentity.class);

    private final JdbcClient jdbc;
    private final byte[] salt;

    public VisitorIdentity(JdbcClient jdbc, @Value("${bah.security.fingerprint-salt:}") String salt) {
        this.jdbc = jdbc;
        this.salt = keyFrom(salt);
    }

    /**
     * A blank salt is a supported state and must not be an empty HMAC key.
     *
     * <p>The property defaults to blank so the app runs from a fresh clone with
     * nothing configured, exactly as the OAuth credentials do. Passing that
     * straight to {@link SecretKeySpec} throws {@code IllegalArgumentException:
     * Empty key}, which made every rating and every reaction answer 500 on a
     * default install - a whole feature dead in the one configuration nobody had
     * a test for.
     *
     * <p>The fallback is random rather than a constant, because a hardcoded salt
     * is no salt at all: anyone with the source could recompute a fingerprint
     * from an address. Random means dedupe still works, and works for as long as
     * the process lives, which is the honest cost of not configuring one.
     */
    private static byte[] keyFrom(String configured) {
        if (configured != null && !configured.isBlank()) {
            return configured.getBytes(StandardCharsets.UTF_8);
        }

        byte[] generated = new byte[32];
        new SecureRandom().nextBytes(generated);

        log.warn(
                "bah.security.fingerprint-salt is not set; using a random salt for this run. "
                        + "Rating and reaction dedupe will reset when the application restarts. "
                        + "Set it in application-local.yml for anything long-lived.");

        return generated;
    }

    /**
     * The visitor this request already is, if any.
     *
     * <p>Used by reads, which must never create one: asking a recipe page who you
     * are cannot be the thing that starts identifying you.
     */
    public Optional<String> existing(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return Optional.empty();
        }

        for (Cookie cookie : request.getCookies()) {
            if (COOKIE.equals(cookie.getName()) && cookie.getValue() != null && !cookie.getValue().isBlank()) {
                return Optional.of(cookie.getValue());
            }
        }
        return Optional.empty();
    }

    /**
     * The visitor this request is, creating and issuing one if needed.
     *
     * @throws ResponseStatusException 429 when this fingerprint has already been
     *     given as many cookies as it is allowed
     */
    public String require(HttpServletRequest request, HttpServletResponse response) {
        Optional<String> known = existing(request);
        if (known.isPresent() && isKnown(known.get())) {
            return known.get();
        }

        String fingerprint = fingerprint(request);
        if (cookiesIssuedTo(fingerprint) >= MAX_COOKIES_PER_FINGERPRINT) {
            // Deliberately the same answer whether they cleared cookies once or a
            // hundred times. Explaining the rule would only describe how to work
            // around it.
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
        }

        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO visitor (id, fingerprint, created_at) VALUES (?, ?, ?)")
                .param(id)
                .param(fingerprint)
                .param(Instant.now().toString())
                .update();

        response.addCookie(cookie(id));
        return id;
    }

    private boolean isKnown(String id) {
        return jdbc.sql("SELECT count(*) FROM visitor WHERE id = ?").param(id).query(Integer.class).single() > 0;
    }

    private int cookiesIssuedTo(String fingerprint) {
        return jdbc.sql("SELECT count(*) FROM visitor WHERE fingerprint = ?")
                .param(fingerprint)
                .query(Integer.class)
                .single();
    }

    private Cookie cookie(String id) {
        Cookie cookie = new Cookie(COOKIE, id);
        // Nothing in the browser needs to read this, and not being readable means
        // an XSS cannot lift it to vote as somebody else.
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge((int) COOKIE_LIFE.toSeconds());
        // Lax rather than Strict: the visitor arrives back from Google's consent
        // screen on a cross-site redirect, and Strict would drop the cookie there.
        cookie.setAttribute("SameSite", "Lax");
        return cookie;
    }

    /**
     * A salted HMAC, never the address. Two properties matter: it cannot be
     * reversed into an IP, and it cannot be recomputed by anyone who does not
     * hold the salt - so the table is useless to whoever ends up with a copy.
     */
    private String fingerprint(HttpServletRequest request) {
        String material = clientAddress(request) + "|" + String.valueOf(request.getHeader("User-Agent"));

        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(salt, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(material.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            // HmacSHA256 is required of every JVM; if it is missing, failing the
            // request beats silently dropping the only abuse control there is.
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    /**
     * Behind the nginx that terminates TLS in production, so the socket address is
     * the proxy's and the real one arrives in a header. Only the first entry is
     * read: everything after it was appended by the client and is worth nothing.
     */
    private String clientAddress(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return String.valueOf(request.getRemoteAddr());
    }
}
