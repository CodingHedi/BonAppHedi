package fr.bonapphedi.api;

import java.util.Objects;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What is actually running here.
 *
 * <p>Answering that used to need ssh. The jar carries no identity of its own, so
 * "did the fix I merged an hour ago go out?" could only be answered by poking
 * the site until it behaved differently - which is guesswork, and it is
 * guesswork about the one question a deploy is supposed to settle. Now it is
 * {@code curl https://bonapphedi.fr/api/version}.
 *
 * <p>The commit arrives through {@code -Dbah.commit} at package time and is
 * written into {@code META-INF/build-info.properties} by the
 * {@code build-info} goal in the pom. Both the deploy script and CI pass it;
 * anything else gets {@code unknown}, which is the truthful answer rather than
 * a broken one.
 *
 * <p>The response record lives here rather than in {@link Dto} on purpose. That
 * class mirrors {@code models.ts} field for field and nothing in the frontend
 * reads this endpoint, so a record in there would be the first one with no
 * counterpart and would quietly weaken the rule.
 */
@RestController
public class VersionController {

    /**
     * Null only when {@code build-info.properties} is absent, which happens when
     * the application is started from an IDE that compiled the classes itself
     * rather than through Maven. Tolerated at runtime and not in the suite:
     * {@code VersionEndpointTest} fails if the build stops producing the file,
     * because that is a pom edit nobody would otherwise notice.
     */
    private final BuildProperties build;

    public VersionController(ObjectProvider<BuildProperties> build) {
        this.build = build.getIfAvailable();
    }

    @GetMapping("/api/version")
    public Version version() {
        if (build == null) {
            return new Version("unknown", null);
        }
        var time = build.getTime();
        return new Version(
                Objects.requireNonNullElse(build.get("commit"), "unknown"), time == null ? null : time.toString());
    }

    /** {@code builtAt} is ISO-8601 UTC, or null when this was not a Maven build. */
    public record Version(String commit, String builtAt) {}
}
