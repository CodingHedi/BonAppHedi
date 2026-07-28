package fr.bonapphedi.social;

import fr.bonapphedi.api.Dto;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The write side of ratings, reactions and comments.
 *
 * <p>Everything here is keyed by the recipe's own id rather than by slug, because
 * rating {@code /fr/recettes/babka-au-chocolat} and rating
 * {@code /en/recipes/chocolate-babka} are the same act on the same recipe. The
 * slug belongs to a translation and the editor can change it; the vote must not
 * move when that happens.
 *
 * <p>Idempotence is enforced by the unique constraints in V1, not here. Rating
 * again is an upsert onto {@code (recipe_id, visitor_id)} and reacting twice
 * cannot insert twice, which is a rule the database keeps even when a future
 * caller forgets it exists.
 */
@Repository
public class SocialDao {

    private final JdbcClient jdbc;

    public SocialDao(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The recipe behind a public slug, or empty.
     *
     * <p>Same rule as every read: published, and translated into the language
     * asked for. A draft cannot be rated, and neither can a slug belonging to the
     * other language - otherwise the two language trees stop being distinct.
     */
    public Optional<Long> publicRecipeId(String slug, String locale) {
        return jdbc.sql(
                        """
                        SELECT r.id FROM recipe r
                        JOIN recipe_translation rt ON rt.recipe_id = r.id AND rt.locale = :locale
                        WHERE rt.slug = :slug AND r.status = 'PUBLISHED' AND rt.title <> ''
                        """)
                .param("locale", locale)
                .param("slug", slug)
                .query(Long.class)
                .optional();
    }

    // --- ratings ----------------------------------------------------------

    public void rate(long recipeId, String visitorId, int stars) {
        jdbc.sql(
                        """
                        INSERT INTO rating (recipe_id, visitor_id, stars, created_at)
                        VALUES (:recipe, :visitor, :stars, :now)
                        ON CONFLICT (recipe_id, visitor_id) DO UPDATE SET stars = excluded.stars
                        """)
                .param("recipe", recipeId)
                .param("visitor", visitorId)
                .param("stars", stars)
                .param("now", Instant.now().toString())
                .update();
    }

    public Dto.RatingSummary ratingFor(long recipeId, String visitorId) {
        double average = jdbc.sql("SELECT coalesce(avg(stars), 0) FROM rating WHERE recipe_id = ?")
                .param(recipeId)
                .query(Double.class)
                .single();

        int count = jdbc.sql("SELECT count(*) FROM rating WHERE recipe_id = ?")
                .param(recipeId)
                .query(Integer.class)
                .single();

        return new Dto.RatingSummary(average, count, yourRating(recipeId, visitorId).orElse(null));
    }

    public Optional<Integer> yourRating(long recipeId, String visitorId) {
        if (visitorId == null) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT stars FROM rating WHERE recipe_id = ? AND visitor_id = ?")
                .param(recipeId)
                .param(visitorId)
                .query(Integer.class)
                .optional();
    }

    // --- reactions --------------------------------------------------------

    /**
     * Toggling off is the same call with {@code reacted=false}, so a double click
     * or a second tab cannot drive the count past one in either direction.
     */
    public void react(long recipeId, String visitorId, boolean reacted) {
        if (reacted) {
            jdbc.sql(
                            """
                            INSERT INTO reaction (recipe_id, visitor_id, created_at)
                            VALUES (:recipe, :visitor, :now)
                            ON CONFLICT (recipe_id, visitor_id) DO NOTHING
                            """)
                    .param("recipe", recipeId)
                    .param("visitor", visitorId)
                    .param("now", Instant.now().toString())
                    .update();
        } else {
            jdbc.sql("DELETE FROM reaction WHERE recipe_id = ? AND visitor_id = ?")
                    .param(recipeId)
                    .param(visitorId)
                    .update();
        }
    }

    public Dto.Reactions reactionsFor(long recipeId, String visitorId) {
        int count = jdbc.sql("SELECT count(*) FROM reaction WHERE recipe_id = ?")
                .param(recipeId)
                .query(Integer.class)
                .single();

        return new Dto.Reactions(count, hasReacted(recipeId, visitorId));
    }

    public boolean hasReacted(long recipeId, String visitorId) {
        if (visitorId == null) {
            return false;
        }
        return jdbc.sql("SELECT count(*) FROM reaction WHERE recipe_id = ? AND visitor_id = ?")
                        .param(recipeId)
                        .param(visitorId)
                        .query(Integer.class)
                        .single()
                > 0;
    }

    // --- comments ---------------------------------------------------------

    /**
     * Published comments, plus this reader's own comments awaiting moderation.
     *
     * <p>Rejected ones are gone entirely and pending ones belong to their author
     * alone: a queue is not public reading, but hiding somebody's own comment from
     * them reads as a broken form and gets the same thing posted three more times.
     *
     * <p>Newest first, unlike the moderation queue, which is worked oldest first.
     */
    public List<Dto.Comment> commentsFor(long recipeId, Long userId) {
        return jdbc.sql(
                        """
                        SELECT c.id, c.user_id, c.display_name, u.avatar,
                               c.body_markdown, c.body_html, c.status, c.created_at
                        FROM comment c
                        LEFT JOIN app_user u ON u.id = c.user_id
                        WHERE c.recipe_id = :recipe
                          AND (c.status = 'PUBLISHED'
                               OR (c.status = 'PENDING' AND c.user_id IS NOT NULL AND c.user_id = :user))
                        ORDER BY c.created_at DESC, c.id DESC
                        """)
                .param("recipe", recipeId)
                .param("user", userId)
                .query((rs, row) -> toComment(rs, userId))
                .list();
    }

    /**
     * {@code user_id} is nullable - a comment outlives the account that wrote it -
     * and is read first, with {@code wasNull()} asked immediately after.
     *
     * <p>That ordering is not style. JDBC reports {@code wasNull()} for the column
     * read <em>last</em>, so checking it after reading the display name would
     * answer a question about the display name and quietly attribute every
     * anonymous comment to whoever happens to be reading. The same mistake has
     * already been made once in this codebase, on the ingredient mapper.
     *
     * <p>{@code avatar} arrives from the joined account rather than from the
     * comment, so a comment whose author deleted their account, and every seeded
     * comment, has none - and the frontend draws its placeholder. That is the
     * trade ADR 7 takes on purpose: the name is copied because it attributes the
     * comment, the avatar is not because a chosen one has to be able to change.
     */
    private static Dto.Comment toComment(java.sql.ResultSet rs, Long userId) throws java.sql.SQLException {
        long author = rs.getLong("user_id");
        boolean orphaned = rs.wasNull();

        return new Dto.Comment(
                rs.getLong("id"),
                new Dto.CommentAuthor(rs.getString("display_name"), rs.getString("avatar")),
                rs.getString("body_markdown"),
                rs.getString("body_html"),
                rs.getString("created_at"),
                rs.getString("status"),
                !orphaned && userId != null && author == userId);
    }

    /** What the heading counts, which has to be what the thread below it shows. */
    public int commentCountFor(long recipeId, Long userId) {
        return jdbc.sql(
                        """
                        SELECT count(*) FROM comment
                        WHERE recipe_id = :recipe
                          AND (status = 'PUBLISHED' OR (status = 'PENDING' AND user_id IS NOT NULL AND user_id = :user))
                        """)
                .param("recipe", recipeId)
                .param("user", userId)
                .query(Integer.class)
                .single();
    }

    /**
     * No avatar argument, and the omission is deliberate (ADR 7).
     *
     * <p>{@code display_name} is still copied onto the row, because a comment
     * outlives the account and something has to attribute it. The avatar is read
     * through {@code user_id} instead, so that changing it on the profile page
     * changes the comments already posted.
     */
    public long addComment(long recipeId, long userId, String displayName, String markdown, String html) {

        jdbc.sql(
                        """
                        INSERT INTO comment (
                            recipe_id, user_id, display_name, body_markdown, body_html, status, created_at)
                        VALUES (:recipe, :user, :name, :markdown, :html, 'PUBLISHED', :now)
                        """)
                .param("recipe", recipeId)
                .param("user", userId)
                .param("name", displayName)
                .param("markdown", markdown)
                .param("html", html)
                .param("now", Instant.now().toString())
                .update();

        return jdbc.sql("SELECT last_insert_rowid()").query(Long.class).single();
    }

    /**
     * Rewrites the copied byline on every comment this account has posted.
     *
     * <p>Called when the account chooses a name, and the reason the feature is not
     * merely cosmetic. {@code display_name} is a copy taken at posting time, so
     * without this the real name stays on every comment already published and
     * "choose the name you are shown under" would apply only to the next one.
     *
     * <p>A join at read time would have looked cheaper and is wrong here. A comment
     * outlives its account — {@code user_id} is {@code ON DELETE SET NULL} — so a
     * join falls back to the copy the moment the account goes away, resurrecting
     * the name the person chose to hide. The copies have to be correct rather than
     * overridden.
     *
     * @return how many comments were rewritten, which the caller has no use for and
     *     a test does.
     */
    public int renameAuthor(long userId, String shownName) {
        return jdbc.sql("UPDATE comment SET display_name = ? WHERE user_id = ?")
                .param(shownName)
                .param(userId)
                .update();
    }

    public Optional<Dto.Comment> commentById(long id, Long userId) {
        return jdbc.sql(
                        """
                        SELECT c.id, c.user_id, c.display_name, u.avatar,
                               c.body_markdown, c.body_html, c.status, c.created_at
                        FROM comment c
                        LEFT JOIN app_user u ON u.id = c.user_id
                        WHERE c.id = :id
                        """)
                .param("id", id)
                .query((rs, row) -> toComment(rs, userId))
                .optional();
    }

    /** Scoped to the author in SQL, so a wrong id cannot delete somebody else's. */
    public int deleteOwnComment(long id, long userId) {
        return jdbc.sql("DELETE FROM comment WHERE id = ? AND user_id = ?")
                .param(id)
                .param(userId)
                .update();
    }

    public boolean commentExists(long id) {
        return jdbc.sql("SELECT count(*) FROM comment WHERE id = ?").param(id).query(Integer.class).single() > 0;
    }
}
