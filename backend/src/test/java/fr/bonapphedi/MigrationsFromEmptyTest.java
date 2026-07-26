package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Every migration, in order, against a database that has never existed.
 *
 * <p>Nothing else here does that. Every other test class points at a file under
 * {@code target/} that survives between runs, so by the time they open it the
 * schema is usually already there and Flyway has nothing to do — which means a
 * migration could work only on a database that has already been migrated once
 * and no test would notice. That failure is invisible in development and total
 * on a first deploy, when the one database that matters is empty.
 *
 * <p>Deliberately without a Spring context. Booting the application would prove
 * the migrations run <em>as part of booting the application</em>; running Flyway
 * directly proves they run, which is the narrower claim actually wanted here and
 * takes milliseconds.
 */
class MigrationsFromEmptyTest {

    @Test
    void appliesEveryMigrationInOrderToAnEmptyFile(@TempDir Path directory) {
        MigrateResult result = flywayFor(directory, "in-order.db").migrate();

        assertThat(result.success).isTrue();
        assertThat(result.migrationsExecuted)
                .as("nothing ran, so this test proved nothing")
                .isPositive();

        List<MigrationInfo> applied =
                Arrays.asList(flywayFor(directory, "in-order.db").info().applied());

        assertThat(applied).allSatisfy(migration -> assertThat(migration.getState())
                .isEqualTo(MigrationState.SUCCESS));

        // Ascending, and checked rather than assumed: Flyway orders by version,
        // so a migration numbered out of sequence runs at a point its author did
        // not intend rather than failing.
        assertThat(applied.stream().map(migration -> migration.getVersion().toString()))
                .isSorted();
    }

    @Test
    void buildsTheWholeSchema(@TempDir Path directory) {
        JdbcClient jdbc = migrated(directory, "schema.db");

        List<String> tables = jdbc.sql("SELECT name FROM sqlite_master WHERE type = 'table'")
                .query(String.class)
                .list();

        // One table from each migration that creates any, so a chain that stops
        // halfway cannot pass.
        assertThat(tables)
                .contains("recipe", "app_user", "comment") // V1
                .contains("SPRING_SESSION") // V3
                .contains("visitor"); // V4
    }

    @Test
    void appliesAdditiveColumnsFromLaterMigrations(@TempDir Path directory) {
        JdbcClient jdbc = migrated(directory, "columns.db");

        // V5 adds this to a table V1 created. It is the case most likely to be
        // got wrong on an empty database, because ALTER TABLE ... ADD COLUMN
        // needs the table from four migrations earlier to already be there.
        String comment = jdbc.sql("SELECT sql FROM sqlite_master WHERE name = 'comment'")
                .query(String.class)
                .single();

        assertThat(comment).contains("avatar_url");
    }

    @Test
    void seedsTheContentTheEndToEndSuiteAssertsOn(@TempDir Path directory) {
        JdbcClient jdbc = migrated(directory, "seed.db");

        // Proves V2 ran after V1 rather than merely being present: a seed that
        // ran first would have inserted nothing into tables that did not exist.
        assertThat(count(jdbc, "recipe")).isEqualTo(6);
        assertThat(count(jdbc, "comment")).isEqualTo(4);
        assertThat(count(jdbc, "rating")).isEqualTo(1);
    }

    @Test
    void migratingTwiceChangesNothing(@TempDir Path directory) {
        Flyway flyway = flywayFor(directory, "twice.db");
        flyway.migrate();

        // Every start-up runs this. If it were not a no-op, the seed would be
        // inserted again on each restart and the site would slowly fill with
        // duplicate recipes.
        assertThat(flywayFor(directory, "twice.db").migrate().migrationsExecuted)
                .isZero();
    }

    @Test
    void agreesWithTheMigrationsOnDisk(@TempDir Path directory) {
        Flyway flyway = flywayFor(directory, "validate.db");
        flyway.migrate();

        // Throws if a file's checksum has moved since it was applied. Editing an
        // applied migration instead of adding a new one is the single easiest
        // way to break every existing deployment while every test stays green.
        flywayFor(directory, "validate.db").validate();
    }

    // --- helpers ----------------------------------------------------------

    private static Flyway flywayFor(Path directory, String file) {
        return Flyway.configure()
                .dataSource(dataSource(directory, file))
                .locations("classpath:db/migration")
                .load();
    }

    private static DataSource dataSource(Path directory, String file) {
        // foreign_keys=on for the same reason the application sets it: SQLite
        // disables them per connection, and the schema leans on them.
        return new DriverManagerDataSource(
                "jdbc:sqlite:file:" + directory.resolve(file).toAbsolutePath() + "?foreign_keys=on");
    }

    private static JdbcClient migrated(Path directory, String file) {
        flywayFor(directory, file).migrate();
        return JdbcClient.create(dataSource(directory, file));
    }

    private static int count(JdbcClient jdbc, String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Integer.class).single();
    }
}
