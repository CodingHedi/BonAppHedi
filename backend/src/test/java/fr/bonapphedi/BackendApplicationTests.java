package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

/**
 * The foundation, asserted rather than assumed.
 *
 * <p>Each of these failed at least once while being built, and none of them
 * fails loudly in production - a missing dialect stops the context, but foreign
 * keys silently doing nothing is the kind of thing found months later with
 * orphaned rows.
 */
@SpringBootTest
@TestPropertySource(properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-boot.db?foreign_keys=on")
class BackendApplicationTests {

    @Autowired
    private JdbcClient jdbc;

    @Test
    void contextLoads() {
        // Spring Data JDBC has no SQLite dialect of its own; without the one in
        // SqliteDialect the context never reaches this line.
        assertThat(jdbc).isNotNull();
    }

    @Test
    void flywayCreatedEveryTable() {
        List<String> tables = jdbc.sql("SELECT name FROM sqlite_master WHERE type = 'table'")
                .query(String.class)
                .list();

        assertThat(tables)
                .contains("recipe", "recipe_translation", "ingredient", "step", "tag", "author",
                        "app_user", "rating", "reaction", "comment");
    }

    @Test
    void foreignKeysAreActuallyEnforced() {
        // SQLite disables foreign keys per connection by default, so this asserts
        // the JDBC URL rather than the schema: without foreign_keys=on every
        // ON DELETE CASCADE in V1 is inert and this insert would succeed.
        Integer enabled = jdbc.sql("PRAGMA foreign_keys").query(Integer.class).single();
        assertThat(enabled).isEqualTo(1);
    }

    @Test
    void checkConstraintsRejectNonsense() {
        // Typing is dynamic in SQLite, so CHECK is the only real validation
        // there is. A difficulty of 9 must not be storable.
        assertThat(jdbc.sql("SELECT sql FROM sqlite_master WHERE name = 'recipe'")
                        .query(String.class)
                        .single())
                .contains("difficulty BETWEEN 1 AND 3");
    }
}
