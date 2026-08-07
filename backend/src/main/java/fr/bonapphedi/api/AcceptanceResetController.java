package fr.bonapphedi.api;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Puts the database back to the seeded state. Acceptance run only.
 *
 * <p>The acceptance run is 154 specs against one database, and once the specs
 * that need a session could finally run, that became the limit: three admin
 * specs pass and, in doing so, publish a draft, rename the babka and create a
 * recipe. Every later spec asserting the seeded catalogue then fails - all 34 of
 * the remaining failures were this. The mocks never had the problem because
 * their store resets on every page load, so the suite was written expecting a
 * clean slate it silently stopped getting.
 *
 * <p>Called between spec files by {@code frontend/e2e/fixtures.ts}.
 *
 * <p><strong>{@code @Profile("acceptance")} is the only thing that makes this
 * safe, and it is doing all of the work.</strong> Reachable anywhere else this
 * is the entire site behind one unauthenticated POST. It is not defended by
 * authentication and deliberately so - adding a token would suggest it is
 * something that could reasonably be exposed, and it is not.
 * {@code AcceptanceResetIsNotDeployedTest} fails if the annotation is ever
 * removed, and was confirmed to fail by removing it.
 */
@RestController
@RequestMapping("/api/test")
@Profile("acceptance")
public class AcceptanceResetController {

    private final Flyway flyway;
    private final DataSource dataSource;

    public AcceptanceResetController(Flyway flyway, DataSource dataSource) {
        this.flyway = flyway;
        this.dataSource = dataSource;
    }

    /**
     * Drop everything, migrate, and throw the connection pool away.
     *
     * <p>Rebuilding rather than deleting rows: the seed is {@code V2__seed.sql},
     * so re-running the migrations is the only definition of "seeded" that
     * cannot drift from the one the application boots with. A hand-written
     * truncate would be a second copy of the seed to keep in step, and ADR 0001
     * already records what happens when the seed and its transcription disagree
     * - the suite fails somewhere unrelated and blames the wrong thing.
     *
     * <p>This takes {@code SPRING_SESSION} with it, which is intended. Every
     * signed-in spec establishes its own session through a real sign-in, and a
     * session surviving the reset would let a spec that forgot to pass anyway.
     */
    @PostMapping("/reset")
    public ResponseEntity<Void> reset() {
        dropEveryTable();
        flyway.migrate();
        return ResponseEntity.noContent().build();
    }

    /**
     * Drops every table by hand, because {@code flyway.clean()} does not.
     *
     * <p>This was the first implementation and it looked perfect: no exception,
     * a 204, and a reset that did absolutely nothing. On SQLite, Flyway's clean
     * silently drops nothing here, so the schema history survives, {@code
     * migrate()} then finds every version already applied and also does nothing,
     * and the database keeps whatever the last spec left in it.
     *
     * <p>It was only caught because the seed was half present afterwards -
     * authors and tags still there, recipes gone - which is the shape of a
     * previous test's deletions surviving, not of a rebuild. A reset that fails
     * loudly would have cost a minute; this one cost an hour, and would have
     * quietly made the isolation it exists to provide a fiction.
     *
     * <p>Dropping the history table is what makes {@code migrate()} rebuild from
     * V1 rather than shrug, so it is included deliberately rather than skipped
     * as internal.
     *
     * <p>Foreign keys are turned off for the duration, on the one connection
     * doing the work. The pragma is per connection - that is the whole reason
     * {@code foreign_keys=on} lives in the JDBC URL (ADR 0002) - so this cannot
     * leak to anything else, and without it the drop order would have to
     * reproduce the schema's dependency graph.
     */
    private void dropEveryTable() {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement()) {

            statement.execute("PRAGMA foreign_keys = OFF");

            List<String> tables = new ArrayList<>();
            try (ResultSet rows = statement.executeQuery(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")) {
                while (rows.next()) {
                    tables.add(rows.getString(1));
                }
            }

            for (String table : tables) {
                statement.execute("DROP TABLE IF EXISTS \"" + table + "\"");
            }

            statement.execute("PRAGMA foreign_keys = ON");

        } catch (SQLException e) {
            throw new IllegalStateException("could not empty the database for the acceptance run", e);
        }
    }
}
