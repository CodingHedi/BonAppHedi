package fr.bonapphedi.config;

import java.util.List;
import org.springframework.security.oauth2.client.registration.ClientRegistration;

/**
 * The providers this instance actually holds credentials for.
 *
 * <p>A named type rather than a bare list because three places need the same
 * answer and have to agree: the security chain wires {@code oauth2Login} only if
 * it is non-empty, the registration repository is built from it, and
 * {@code GET /api/auth/providers} reports it to the sign-in row.
 */
public record ConfiguredProviders(List<ClientRegistration> registrations) {

    public boolean none() {
        return registrations.isEmpty();
    }
}
