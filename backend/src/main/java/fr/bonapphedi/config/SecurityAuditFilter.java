package fr.bonapphedi.config;

import fr.bonapphedi.auth.AppUserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Writes down the requests worth looking at afterwards (ADR 17).
 *
 * <p>Before this the application logged two things about security: a warning
 * when the fingerprint salt was unset, and nothing else. A refused admin
 * request, a session that had expired, a moderation decision — none of them
 * left a trace, so "read the logs regularly" had nothing to read and looked
 * fine because nothing was being written rather than because nothing was
 * happening.
 *
 * <p><b>No addresses, deliberately.</b> The privacy page says this application
 * stores no raw IP — {@code VisitorIdentity} HMACs one and keeps only the
 * digest — and a security log that quietly broke that promise would be a worse
 * problem than the one it solves. What identifies a source here is Caddy's
 * access log, which does keep addresses because fail2ban needs them and is
 * erased every day, as the privacy page states. The split is the point: the
 * thing that must know an address is the thing that forgets it.
 *
 * <p>Its own logger name, {@code fr.bonapphedi.security}, so the nightly digest
 * and a human reading by hand can both select these lines without a regex over
 * everything the JVM says.
 *
 * <p><b>{@code HIGHEST_PRECEDENCE} is load-bearing.</b> A {@code Filter} bean is
 * registered with the servlet container at {@code LOWEST_PRECEDENCE}, which puts
 * it <em>after</em> {@code springSecurityFilterChain}: security then refuses the
 * request and returns without ever calling through, so this filter is not merely
 * late — it does not run at all, and every refusal goes unrecorded while the code
 * reads correctly. That is how it was written first, and the test caught it.
 * Running first means {@code chain.doFilter} enters the security chain and
 * control returns here with the status it decided on.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SecurityAuditFilter extends OncePerRequestFilter {

    /**
     * Not this class's own logger. The name is the interface — the digest greps
     * for it — so it is stated rather than derived from wherever this code
     * happens to live.
     */
    private static final Logger audit = LoggerFactory.getLogger("fr.bonapphedi.security");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        chain.doFilter(request, response);

        int status = response.getStatus();

        // 401 and 403 only, and the distinction between them is the interesting
        // part rather than noise: 401 is somebody who has not said who they are,
        // which is ordinary and happens whenever a session expires, while 403 is
        // somebody who has and is not allowed - which on this site means an
        // account that is not an admin asking for the admin area.
        if (status != 401 && status != 403) return;

        audit.warn(
                "refused status={} method={} path={} user={}",
                status,
                request.getMethod(),
                // getRequestURI, never the query string: a bookmarks share link
                // carries somebody's saved recipes in `?r=`, and this log has no
                // use for them.
                request.getRequestURI(),
                describeUser());
    }

    /**
     * Who was refused, when that is knowable.
     *
     * <p>The account id and not the display name or the address: the id is
     * enough to recognise a pattern across lines and means nothing to anybody
     * reading the log without the database.
     */
    private static String describeUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) return "anonymous";

        if (authentication.getPrincipal() instanceof AppUserPrincipal principal) {
            return "id:" + principal.user().id();
        }
        return "anonymous";
    }
}
