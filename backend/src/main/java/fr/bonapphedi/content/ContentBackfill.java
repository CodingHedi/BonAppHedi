package fr.bonapphedi.content;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Renders markdown that arrived without HTML.
 *
 * <p>Content is normally rendered on write, but the seed is written by a Flyway
 * migration and SQL cannot render markdown. Without this the recipes and
 * comments that ship with the app would be the only rows on the site with an
 * empty {@code body_html}, and the frontend would silently fall back to
 * client-side rendering for precisely the content everybody sees first.
 *
 * <p>Runs on every startup and touches only rows that have markdown and no HTML,
 * so a restart is a no-op rather than a rewrite. That also makes it the
 * migration path for any future seed: add rows in SQL, and the HTML appears the
 * next time the app boots.
 *
 * <p>Deliberately not a Flyway Java migration. Rendering is application
 * behaviour that will change as the allowlist changes, and a versioned migration
 * is a checksum that must never change — the two would be in permanent conflict.
 */
@Component
public class ContentBackfill implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ContentBackfill.class);

    private final JdbcClient jdbc;
    private final MarkdownRenderer renderer;

    public ContentBackfill(JdbcClient jdbc, MarkdownRenderer renderer) {
        this.jdbc = jdbc;
        this.renderer = renderer;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int recipes = backfillRecipeBodies();
        int comments = backfillComments();

        if (recipes + comments > 0) {
            log.info("Rendered markdown for {} recipe bodies and {} comments", recipes, comments);
        }
    }

    private int backfillRecipeBodies() {
        record Pending(long recipeId, String locale, String markdown) {}

        List<Pending> pending = jdbc.sql("""
                        SELECT recipe_id, locale, body_markdown
                        FROM recipe_translation
                        WHERE body_markdown <> '' AND (body_html IS NULL OR body_html = '')
                        """)
                .query((rs, n) -> new Pending(
                        rs.getLong("recipe_id"), rs.getString("locale"), rs.getString("body_markdown")))
                .list();

        for (Pending row : pending) {
            jdbc.sql("UPDATE recipe_translation SET body_html = :html WHERE recipe_id = :id AND locale = :locale")
                    .param("html", renderer.render(row.markdown()))
                    .param("id", row.recipeId())
                    .param("locale", row.locale())
                    .update();
        }

        return pending.size();
    }

    private int backfillComments() {
        record Pending(long id, String markdown) {}

        List<Pending> pending = jdbc.sql("""
                        SELECT id, body_markdown
                        FROM comment
                        WHERE body_markdown <> '' AND (body_html IS NULL OR body_html = '')
                        """)
                .query((rs, n) -> new Pending(rs.getLong("id"), rs.getString("body_markdown")))
                .list();

        for (Pending row : pending) {
            jdbc.sql("UPDATE comment SET body_html = :html WHERE id = :id")
                    .param("html", renderer.render(row.markdown()))
                    .param("id", row.id())
                    .update();
        }

        return pending.size();
    }
}
