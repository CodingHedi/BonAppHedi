package fr.bonapphedi;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

    /** Matches the default in application.yml. */
    private static final String DEFAULT_DB = "./data/bonapphedi.db";

    public static void main(String[] args) {
        ensureDatabaseDirectory();
        SpringApplication.run(BackendApplication.class, args);
    }

    /**
     * SQLite creates the database file on first connection but never its parent
     * directory, so a fresh clone fails at startup with a bare SQLITE_CANTOPEN
     * that says nothing about the actual cause.
     *
     * <p>Done here rather than in a bean because Flyway runs before almost
     * everything, and anything late enough to be convenient is already too late.
     */
    private static void ensureDatabaseDirectory() {
        String configured = System.getenv("BAH_DB");
        Path database = Paths.get(configured == null || configured.isBlank() ? DEFAULT_DB : configured);
        Path parent = database.toAbsolutePath().getParent();

        if (parent == null) {
            return;
        }

        try {
            Files.createDirectories(parent);
        } catch (Exception e) {
            throw new IllegalStateException("cannot create the database directory at " + parent, e);
        }
    }
}
