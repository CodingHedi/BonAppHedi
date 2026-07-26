package fr.bonapphedi.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Forces the CSRF token to actually exist on every request.
 *
 * <p>Spring Security 6 defers generating the token until something asks for its
 * value, which for a server-rendered form is the moment it is written into the
 * HTML. Nothing on an API ever asks - so without this the token is never
 * created, {@code CookieCsrfTokenRepository} never writes {@code XSRF-TOKEN},
 * and the SPA's first POST is rejected with no way to ever recover.
 *
 * <p>Calling {@code getToken()} is the whole filter. It looks like a no-op and
 * deleting it breaks every write in the application (ADR 0003).
 */
final class CsrfCookieFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (token != null) {
            token.getToken();
        }
        chain.doFilter(request, response);
    }
}
