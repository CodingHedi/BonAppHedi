package fr.bonapphedi.social;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saved recipes, per account (ADR 16).
 *
 * <p>Speaks recipe <em>keys</em> at its edges and stores {@code recipe_id}
 * underneath, because a foreign key should point at a primary key and nothing
 * outside this database needs to know that it does. The key is what a reader's
 * browser holds and what a shared link carries, and it is safe to hold because
 * it cannot be renamed — see {@code AdminKeyIsImmutableTest}.
 *
 * <p>Every write here is idempotent, and that is not a nicety: the sync in
 * {@link #merge} is a union, so it runs again on the next load after a failure
 * and has to be safe to repeat. {@code UNIQUE (recipe_id, user_id)} is what
 * makes it so, in the schema rather than in this class, for the reason V1
 * already gives about ratings — it is the one place the rule cannot be
 * forgotten.
 */
@Repository
public class BookmarkDao {

    private final JdbcClient jdbc;

    public BookmarkDao(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The reader's keys, newest first.
     *
     * <p>Keys and not summaries: the bookmarks page filters a catalogue it has
     * already fetched (ADR 16), so sending recipes here would be a second copy
     * of data the browser is holding, and one that could disagree with it.
     */
    public List<String> keysFor(long userId) {
        return jdbc.sql(
                        """
                        SELECT r.key
                        FROM bookmark b
                        JOIN recipe r ON r.id = b.recipe_id
                        WHERE b.user_id = :user
                        ORDER BY b.created_at DESC, r.key
                        """)
                .param("user", userId)
                .query(String.class)
                .list();
    }

    /** True when the reader has this recipe saved. */
    public boolean has(long userId, long recipeId) {
        return jdbc.sql("SELECT count(*) FROM bookmark WHERE user_id = :user AND recipe_id = :recipe")
                        .param("user", userId)
                        .param("recipe", recipeId)
                        .query(Integer.class)
                        .single()
                > 0;
    }

    /**
     * Saves or unsaves, and answers the same either way if asked twice.
     *
     * <p>{@code ON CONFLICT DO NOTHING} rather than a read followed by a write:
     * the check and the insert would otherwise be two statements with a gap in
     * between, and the second press of a button that was pressed twice would
     * fail on the unique constraint rather than doing nothing.
     */
    public void set(long userId, long recipeId, boolean bookmarked) {
        if (!bookmarked) {
            jdbc.sql("DELETE FROM bookmark WHERE user_id = :user AND recipe_id = :recipe")
                    .param("user", userId)
                    .param("recipe", recipeId)
                    .update();
            return;
        }

        jdbc.sql(
                        """
                        INSERT INTO bookmark (recipe_id, user_id, created_at)
                        VALUES (:recipe, :user, :now)
                        ON CONFLICT (recipe_id, user_id) DO NOTHING
                        """)
                .param("recipe", recipeId)
                .param("user", userId)
                .param("now", Instant.now().toString())
                .update();
    }

    /**
     * Adds what the browser was holding, and answers with everything.
     *
     * <p>A union and never a replacement. Signing in on a second device must not
     * make an empty local list delete what is stored, and the reader has asked
     * for neither list to lose anything — so this only ever adds. Unsaving is a
     * deliberate act through {@link #set}, one recipe at a time.
     *
     * <p>Unknown keys are ignored rather than refused. A list can outlive a
     * recipe that was deleted, and a reader whose stored list contains one
     * should get the rest of their bookmarks rather than an error.
     */
    @Transactional
    public List<String> merge(long userId, Collection<String> keys) {
        String now = Instant.now().toString();

        for (String key : keys) {
            jdbc.sql(
                            """
                            INSERT INTO bookmark (recipe_id, user_id, created_at)
                            SELECT r.id, :user, :now FROM recipe r WHERE r.key = :key
                            ON CONFLICT (recipe_id, user_id) DO NOTHING
                            """)
                    .param("user", userId)
                    .param("now", now)
                    .param("key", key)
                    .update();
        }

        return keysFor(userId);
    }
}
