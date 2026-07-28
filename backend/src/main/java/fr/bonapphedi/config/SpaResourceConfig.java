package fr.bonapphedi.config;

import java.io.IOException;
import java.util.List;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the Angular build out of the jar, and hands unknown paths to it.
 *
 * <p>The application is one artefact: {@code -Pweb} packages {@code frontend/dist}
 * into {@code static/} and Spring serves it. Without the fallback below that
 * arrangement is broken for every URL except the site root — Angular owns the
 * routing, so {@code /fr/recettes/babka-au-chocolat} is a real page to a visitor
 * and no file on disk to the server. Typing it, reloading on it, or following a
 * link into it from anywhere would answer 404. The dev loop never shows this:
 * {@code ng serve} has its own fallback built in, so the bug appears the first
 * time the jar is deployed and not once before.
 *
 * <p>Two things must keep answering a real 404, and they are the whole reason
 * this is a resolver rather than an error-page rule:
 *
 * <ul>
 *   <li><strong>Anything under {@code /api/}.</strong> A missing endpoint has to
 *       stay a 404 the frontend can act on. Forwarding it to {@code index.html}
 *       would answer every mistyped API call with 200 and a page of HTML, which
 *       a fetch would then fail to parse somewhere far away from the cause. The
 *       e2e fixture also tells an API 404 from a broken one deliberately, and
 *       this would take that apart.
 *   <li><strong>Requests for a file that looks like a file.</strong> A missing
 *       {@code .js} or {@code .css} should 404 rather than quietly return HTML —
 *       a bundle that 200s with a page of markup produces a syntax error in the
 *       console and no clue as to which asset went missing.
 * </ul>
 */
@Component
public class SpaResourceConfig implements WebMvcConfigurer {

    /**
     * Paths the server owns. Everything else belongs to the Angular router.
     *
     * <p>{@code /oauth2} and {@code /login} are Spring Security's own filters —
     * the authorization redirect and the callback — and swallowing either would
     * break sign-in in a way that looks like the provider's fault.
     */
    private static final List<String> SERVER_OWNED = List.of("/api/", "/oauth2/", "/login/", "/logout");

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {

                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable() && isAFile(requested)) {
                            return requested;
                        }

                        // Not a file we ship. Either it is a route Angular knows
                        // — in which case index.html boots and the router takes
                        // it from there, including its own 404 page — or it is
                        // nothing, and Angular's catch-all says so in the
                        // visitor's language rather than in Tomcat's.
                        return isForTheBrowserRouter(resourcePath) ? index(location) : null;
                    }

                    private boolean isForTheBrowserRouter(String resourcePath) {
                        String path = resourcePath.startsWith("/") ? resourcePath : "/" + resourcePath;

                        if (SERVER_OWNED.stream().anyMatch(path::startsWith)) {
                            return false;
                        }

                        // A dot in the last segment means an asset was asked for
                        // by name: /main-A1B2C3.js, /favicon.ico, /i18n/fr.json.
                        // Route segments do not carry extensions, and a recipe
                        // slug cannot: they are generated from `slugify`, which
                        // strips everything but a-z, 0-9 and hyphens.
                        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
                        return !lastSegment.contains(".");
                    }

                    /**
                     * A directory is not something to serve, and asking for one
                     * is easier than it sounds: an empty resource path resolves
                     * to the static root itself, which exists and is readable.
                     * Without this the answer is 200 with an empty body, which
                     * looks like a blank page rather than a mistake.
                     *
                     * <p>The site root does not actually arrive here — Spring
                     * Boot's own welcome-page mapping claims {@code /} and
                     * forwards it to {@code index.html} before the resource
                     * chain runs — but a trailing-slash path such as
                     * {@code /i18n/} does.
                     */
                    private boolean isAFile(Resource resource) {
                        try {
                            return resource.getFile().isFile();
                        } catch (IOException fromInsideAJar) {
                            // Not addressable as a file, so it came out of the
                            // jar, where only files are entries anyway.
                            return true;
                        }
                    }

                    private Resource index(Resource location) throws IOException {
                        Resource index = location.createRelative("index.html");
                        // Null rather than an exception when the jar was built
                        // without the frontend: the API still works, which is
                        // what `mvnw spring-boot:run` during backend development
                        // is for.
                        return index.exists() ? index : null;
                    }
                });
    }
}
