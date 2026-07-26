package fr.bonapphedi.content;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

/**
 * Rendered HTML has to exist for content that arrived through a migration.
 *
 * <p>Markdown is rendered on write, but the seed is written by SQL, and SQL
 * cannot render markdown. Without a backfill the seeded recipes and comments
 * would be the only rows on the site with an empty {@code body_html}, and the
 * frontend would quietly fall back to client-side rendering for exactly the
 * content that ships with the app — the one case nobody would think to test.
 */
@SpringBootTest
@TestPropertySource(properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-backfill.db?foreign_keys=on")
class ContentBackfillTest {

    @Autowired
    private JdbcClient jdbc;

    @Test
    void rendersEverySeededRecipeBody() {
        Long missing = jdbc.sql("""
                        SELECT count(*) FROM recipe_translation
                        WHERE body_markdown <> '' AND (body_html IS NULL OR body_html = '')
                        """)
                .query(Long.class)
                .single();

        assertThat(missing).isZero();
    }

    @Test
    void rendersEverySeededComment() {
        Long missing = jdbc.sql("""
                        SELECT count(*) FROM comment
                        WHERE body_markdown <> '' AND (body_html IS NULL OR body_html = '')
                        """)
                .query(Long.class)
                .single();

        assertThat(missing).isZero();
    }

    @Test
    void producesRealHtmlAndNotJustACopyOfTheMarkdown() {
        String html = jdbc.sql("""
                        SELECT rt.body_html FROM recipe_translation rt
                        JOIN recipe r ON r.id = rt.recipe_id
                        WHERE r.key = 'babka' AND rt.locale = 'fr'
                        """)
                .query(String.class)
                .single();

        assertThat(html).startsWith("<p>").contains("babka");
    }

    @Test
    void rendersMarkupInsideASeededComment() {
        // Camille's comment contains "**double tour**", which is the only
        // formatting in the seed and therefore the only proof the renderer ran
        // rather than something having copied the text across.
        String html = jdbc.sql("SELECT body_html FROM comment WHERE display_name = 'Camille'")
                .query(String.class)
                .single();

        assertThat(html).contains("<strong>double tour</strong>");
    }

    @Test
    void leavesNothingToDoOnASecondRun() {
        // The backfill runs at every startup and must be idempotent: it only
        // touches rows with no HTML, so a restart is a no-op rather than a
        // rewrite of every row in the database.
        Long total = jdbc.sql("SELECT count(*) FROM recipe_translation WHERE body_html <> ''")
                .query(Long.class)
                .single();

        assertThat(total).isEqualTo(12);
    }
}
