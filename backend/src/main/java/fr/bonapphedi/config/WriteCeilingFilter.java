package fr.bonapphedi.config;

import fr.bonapphedi.social.VisitorIdentity;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * A ceiling on writes (ADR 17, stage 5).
 *
 * <p><b>Not a tuned rate limit, and the distinction matters.</b> There is no
 * traffic here to tune against — Caddy logged twenty-five lines in a day, none
 * of them requests — so any carefully chosen threshold would be a guess wearing
 * a number. This is a ceiling instead: high enough that no reader will ever meet
 * it, low enough that a script cannot post a thousand comments while nobody is
 * watching. If the digest ever shows somebody bouncing off it, that is the point
 * at which there is data to tune against.
 *
 * <p>Keyed on {@link VisitorIdentity#fingerprintOf}, which is a salted HMAC of
 * address and user agent, so this recognises a source without ever holding one —
 * the same promise the privacy page makes about everything else in the
 * application. A second HMAC of the same material would be the same value
 * computed twice, and a second place handling addresses is a second place to get
 * that wrong.
 *
 * <p>In the application rather than in Caddy because {@code caddy-ratelimit} is
 * not in a standard build and this is one file. Behind Caddy, so
 * {@code X-Forwarded-For} is what identifies the caller — which
 * {@code VisitorIdentity} already reads correctly, taking only the first entry
 * because everything after it was appended by the client.
 *
 * <p><b>Reads are never limited.</b> The whole site is meant to be read by
 * strangers, including by crawlers that are supposed to take every page; a limit
 * on GET would be a limit on being found.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class WriteCeilingFilter extends OncePerRequestFilter {

    private static final Logger audit = LoggerFactory.getLogger("fr.bonapphedi.security");

    /** The window counters are kept for, and how often they are swept. */
    private static final Duration WINDOW = Duration.ofMinutes(1);

    private final VisitorIdentity visitors;
    private final int ceiling;

    private final Map<String, Counter> counters = new ConcurrentHashMap<>();

    public WriteCeilingFilter(
            VisitorIdentity visitors, @Value("${bah.security.max-writes-per-minute:300}") int ceiling) {
        this.visitors = visitors;
        this.ceiling = ceiling;
    }

    /** One source's writes inside one window. */
    private record Counter(Instant startedAt, AtomicInteger writes) {}

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        if (ceiling <= 0 || !isWrite(request) || !request.getRequestURI().startsWith("/api/")) {
            chain.doFilter(request, response);
            return;
        }

        String key = visitors.fingerprintOf(request);
        Instant now = Instant.now();

        Counter counter = counters.compute(key, (ignored, existing) -> {
            if (existing == null || existing.startedAt().plus(WINDOW).isBefore(now)) {
                return new Counter(now, new AtomicInteger());
            }
            return existing;
        });

        int used = counter.writes().incrementAndGet();

        if (used > ceiling) {
            // Logged once at the boundary rather than on every refusal, so a
            // script hammering the door produces one line to notice rather than
            // a thousand to scroll past - which is the same thing as none.
            if (used == ceiling + 1) {
                audit.warn(
                        "write ceiling reached method={} path={} limit={}",
                        request.getMethod(),
                        request.getRequestURI(),
                        ceiling);
            }

            // 429 with Retry-After, because this is a temporary refusal of a
            // legitimate-looking request and the caller deserves to be told when
            // to come back. It is the same status the visitor-cookie guard uses.
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(WINDOW.toSeconds()));
            return;
        }

        sweep(now);
        chain.doFilter(request, response);
    }

    /**
     * Drops windows that have expired.
     *
     * <p>Done here rather than on a schedule because the map only grows when
     * somebody writes, so the moment a write happens is exactly when it is worth
     * looking — and a site with no writers needs no sweeper running all night.
     * Bounded work: it only walks the map when it has grown past a size no
     * honest traffic reaches.
     */
    private void sweep(Instant now) {
        if (counters.size() < 1000) return;
        counters.values().removeIf(counter -> counter.startedAt().plus(WINDOW).isBefore(now));
    }

    private static boolean isWrite(HttpServletRequest request) {
        String method = request.getMethod();
        return "POST".equals(method) || "PUT".equals(method) || "DELETE".equals(method) || "PATCH".equals(method);
    }
}
