package fr.bonapphedi.config;

import fr.bonapphedi.auth.ReturnPath;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Remembers the page sign-in was started from, before the visitor leaves for the
 * provider.
 *
 * <p>It has to happen here rather than at the end, because by the time they come
 * back the request that knew where they were is long gone — the browser has been
 * to Google and returned on a fresh navigation. The session is the only thing
 * that spans the two.
 *
 * <p>Registered ahead of Spring's authorization-request filter, which answers
 * 302 immediately and would otherwise never let this run.
 */
final class ReturnPathFilter extends OncePerRequestFilter {

    private static final String AUTHORIZATION_PREFIX = "/oauth2/authorization/";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        if (request.getRequestURI().startsWith(AUTHORIZATION_PREFIX)) {
            // Sanitized on the way in rather than on the way out, so nothing
            // unchecked is ever stored - a session attribute read months later
            // by different code should not be a thing to be careful with.
            request.getSession(true)
                    .setAttribute(ReturnPath.SESSION_KEY, ReturnPath.sanitize(request.getParameter("returnTo")));
        }

        chain.doFilter(request, response);
    }
}
