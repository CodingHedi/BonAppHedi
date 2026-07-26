package fr.bonapphedi.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.function.Supplier;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.util.StringUtils;

/**
 * The CSRF handler a single-page app needs, as documented by Spring Security.
 *
 * <p>Spring Security 6 XOR-encodes the token it renders, masking it differently
 * on every request to defeat BREACH. That is what breaks the obvious
 * configuration: pairing {@code CookieCsrfTokenRepository} with the default
 * handler puts a masked token in the cookie, the SPA echoes it back verbatim in
 * a header, and the comparison fails every single time - a 403 that looks like a
 * bug in the browser rather than a mismatch in encoding.
 *
 * <p>The fix is to be asymmetric on purpose. Rendering stays XOR-encoded; a
 * value arriving in the <em>header</em> is read raw, because a header can only
 * have been set by JavaScript that already read the cookie, and that is the
 * proof CSRF is after. A value arriving as a form parameter is still decoded,
 * since that is a path an attacker could reach (ADR 0003).
 */
final class SpaCsrfTokenRequestHandler implements CsrfTokenRequestHandler {

    private final CsrfTokenRequestHandler plain = new CsrfTokenRequestAttributeHandler();
    private final CsrfTokenRequestHandler xor = new XorCsrfTokenRequestAttributeHandler();

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, Supplier<CsrfToken> csrfToken) {
        this.xor.handle(request, response, csrfToken);
    }

    @Override
    public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
        String header = request.getHeader(csrfToken.getHeaderName());
        return StringUtils.hasText(header)
                ? this.plain.resolveCsrfTokenValue(request, csrfToken)
                : this.xor.resolveCsrfTokenValue(request, csrfToken);
    }
}
