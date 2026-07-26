package fr.bonapphedi.config;

import fr.bonapphedi.auth.AppUserOAuth2UserService;
import fr.bonapphedi.auth.AppUserOidcUserService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

/**
 * The one security chain.
 *
 * <p>Written from the position that this site is anonymous. Reading a recipe,
 * rating one and reacting to one all happen without an account, so the default
 * is {@code permitAll} and the exceptions are named - the opposite of the usual
 * advice, and correct here: {@code denyAll} by default on a public cookery site
 * means every new endpoint is invisible until someone notices.
 *
 * <p>The parts that are not obvious are CSRF and the entry point, both of which
 * have a comment saying why.
 */
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            ConfiguredProviders providers,
            AppUserOAuth2UserService oauth2UserService,
            AppUserOidcUserService oidcUserService)
            throws Exception {

        http.authorizeHttpRequests(auth -> auth
                        // Guarded here as well as in the Angular route guard,
                        // because anything decided in a browser is a suggestion.
                        .requestMatchers("/api/admin/**")
                        .hasRole("ADMIN")
                        .anyRequest()
                        .permitAll())

                .csrf(csrf -> csrf
                        // Readable by JavaScript on purpose: Angular's HttpClient
                        // reads XSRF-TOKEN and echoes it as X-XSRF-TOKEN, which
                        // is the double-submit this relies on. HttpOnly here
                        // would leave the SPA unable to write anything.
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
                .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)

                .exceptionHandling(ex -> ex
                        // Without this, one registered provider makes Spring's
                        // default entry point redirect to Google. A fetch() sees
                        // that as an opaque cross-origin failure rather than a
                        // status it can act on, so an API says 401 and lets the
                        // frontend decide to offer sign-in.
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))

                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler((request, response, authentication) ->
                                response.setStatus(HttpServletResponse.SC_NO_CONTENT))
                        // The session row goes with it, so a session cookie kept
                        // by a browser refers to nothing. This is the reason for
                        // cookies over JWT: logout genuinely revokes (ADR 0003).
                        .invalidateHttpSession(true)
                        .deleteCookies("SESSION"))

                // Neither is reachable and both would answer 401 in a shape the
                // frontend does not expect - a browser basic-auth dialog, or a
                // login form that does not exist.
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable);

        // Wired only when something is registered: Spring throws on an empty
        // registration repository, and no providers is a supported state
        // (ADR 0003). Left unwired, /oauth2/authorization/** is simply a 404.
        if (!providers.none()) {
            http.oauth2Login(login -> login
                    .userInfoEndpoint(userInfo -> userInfo
                            .userService(oauth2UserService)
                            .oidcUserService(oidcUserService))
                    // Back to the site root rather than to a saved request. The
                    // visitor started this from a button, not from being
                    // refused, so there is nothing they were trying to reach.
                    .defaultSuccessUrl("/", true)
                    // The default is /login?error, which does not exist here and
                    // would end a failed sign-in on the 404 page.
                    .failureUrl("/?signin=failed"));
        }

        return http.build();
    }
}
