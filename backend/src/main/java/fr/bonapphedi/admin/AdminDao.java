package fr.bonapphedi.admin;

import fr.bonapphedi.api.Dto;
import fr.bonapphedi.content.MarkdownRenderer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Authoring, moderation and the numbers behind them.
 *
 * <p>Its real job is translation in both directions between how a recipe is
 * <em>stored</em> - one language-neutral row with per-locale children, shaped
 * like the database - and how it is <em>edited</em>, which is the same thing
 * minus everything an author does not own.
 *
 * <p>That asymmetry is the whole of {@link #save}, and getting it wrong is
 * silent: a draft carries no publication date, no featured rank, no hero copy
 * and no scores, so writing one straight over a recipe resets all four the first
 * time somebody fixes a typo.
 */
@Repository
public class AdminDao {

    /** Both languages, in a fixed order, so a draft always has the same shape. */
    private static final List<String> LOCALES = List.of("fr", "en");

    private final JdbcClient jdbc;
    private final MarkdownRenderer markdown;

    public AdminDao(JdbcClient jdbc, MarkdownRenderer markdown) {
        this.jdbc = jdbc;
        this.markdown = markdown;
    }

    // --- the recipe table -------------------------------------------------

    /**
     * Every recipe, whatever its status and whatever it is translated into.
     *
     * <p>{@code locale} picks which language a title is shown in and never which
     * rows come back. The public list hides drafts and untranslated recipes;
     * finding exactly those is half of what this screen is for.
     */
    public List<Dto.AdminRecipeRow> recipes(String locale) {
        return jdbc.sql(
                        """
                        SELECT r.id, r.key, r.status, r.published_at,
                               (SELECT count(*) FROM rating x WHERE x.recipe_id = r.id)  AS rating_count,
                               (SELECT count(*) FROM comment c WHERE c.recipe_id = r.id
                                 AND c.status = 'PUBLISHED')                             AS comment_count
                        FROM recipe r
                        ORDER BY r.published_at DESC
                        """)
                .query((rs, n) -> {
                    long id = rs.getLong("id");
                    return new Dto.AdminRecipeRow(
                            rs.getString("key"),
                            title(id, locale),
                            rs.getString("status"),
                            rs.getString("published_at"),
                            translatedInto(id),
                            rs.getInt("rating_count"),
                            rs.getInt("comment_count"));
                })
                .list();
    }

    /**
     * Falls back across languages rather than returning blank.
     *
     * <p>A row with no label is not clickable and not recognisable, and the
     * untranslated recipes are precisely the ones the author came here to find.
     */
    private String title(long recipeId, String locale) {
        return jdbc
                .sql("SELECT title FROM recipe_translation WHERE recipe_id = ? AND locale = ? AND title <> ''")
                .param(recipeId)
                .param(locale)
                .query(String.class)
                .optional()
                .or(() -> jdbc.sql(
                                "SELECT title FROM recipe_translation WHERE recipe_id = ? AND title <> '' LIMIT 1")
                        .param(recipeId)
                        .query(String.class)
                        .optional())
                .orElseGet(() -> jdbc.sql("SELECT key FROM recipe WHERE id = ?")
                        .param(recipeId)
                        .query(String.class)
                        .single());
    }

    private List<String> translatedInto(long recipeId) {
        return jdbc.sql("SELECT locale FROM recipe_translation WHERE recipe_id = ? AND title <> '' ORDER BY locale")
                .param(recipeId)
                .query(String.class)
                .list();
    }

    // --- the editor -------------------------------------------------------

    public Optional<Dto.RecipeDraft> draft(String key) {
        return recipeIdFor(key).map(this::draftOf);
    }

    private Dto.RecipeDraft draftOf(long id) {
        record Head(String key, String status, Integer prep, Integer cook, int difficulty, int servings, String video) {}

        Head head = jdbc.sql(
                        """
                        SELECT key, status, prep_minutes, cook_minutes, difficulty, base_servings, youtube_video_id
                        FROM recipe WHERE id = ?
                        """)
                .param(id)
                .query((rs, n) -> new Head(
                        rs.getString("key"),
                        rs.getString("status"),
                        nullableInt(rs, "prep_minutes"),
                        nullableInt(rs, "cook_minutes"),
                        rs.getInt("difficulty"),
                        rs.getInt("base_servings"),
                        rs.getString("youtube_video_id")))
                .single();

        List<String> tagKeys = jdbc.sql(
                        "SELECT t.key FROM recipe_tag rt JOIN tag t ON t.id = rt.tag_id WHERE rt.recipe_id = ? ORDER BY t.key")
                .param(id)
                .query(String.class)
                .list();

        Map<String, Dto.TranslationDraft> translations = new LinkedHashMap<>();
        for (String locale : LOCALES) {
            translations.put(
                    locale,
                    jdbc.sql(
                                    """
                                    SELECT slug, title, excerpt, body_markdown
                                    FROM recipe_translation WHERE recipe_id = ? AND locale = ?
                                    """)
                            .param(id)
                            .param(locale)
                            .query((rs, n) -> new Dto.TranslationDraft(
                                    rs.getString("slug"),
                                    rs.getString("title"),
                                    rs.getString("excerpt"),
                                    rs.getString("body_markdown")))
                            .optional()
                            // A locale the recipe has never been written in is
                            // still present and blank, so the editor's tabs do
                            // not have to cope with a missing language.
                            .orElse(new Dto.TranslationDraft("", "", "", "")));
        }

        return new Dto.RecipeDraft(
                head.key(),
                head.status(),
                tagKeys,
                head.prep(),
                head.cook(),
                head.difficulty(),
                head.servings(),
                head.video(),
                ingredientDrafts(id),
                stepDrafts(id),
                translations);
    }

    private List<Dto.IngredientDraft> ingredientDrafts(long recipeId) {
        record Row(long id, Double quantity, String unit, boolean scalable) {}

        List<Row> rows = jdbc.sql(
                        "SELECT id, base_quantity, unit, scalable FROM ingredient WHERE recipe_id = ? ORDER BY position")
                .param(recipeId)
                .query((rs, n) -> {
                    // base_quantity read first, wasNull() asked immediately: JDBC
                    // reports on the column read last, and getting this backwards
                    // once already gave "salt and pepper" a quantity.
                    double quantity = rs.getDouble("base_quantity");
                    Double baseQuantity = rs.wasNull() ? null : quantity;

                    return new Row(rs.getLong("id"), baseQuantity, rs.getString("unit"), rs.getInt("scalable") == 1);
                })
                .list();

        List<Dto.IngredientDraft> drafts = new ArrayList<>();
        for (Row row : rows) {
            Map<String, Dto.IngredientText> t = new LinkedHashMap<>();
            for (String locale : LOCALES) {
                t.put(
                        locale,
                        jdbc.sql("SELECT name, note FROM ingredient_translation WHERE ingredient_id = ? AND locale = ?")
                                .param(row.id())
                                .param(locale)
                                .query((rs, n) -> new Dto.IngredientText(rs.getString("name"), rs.getString("note")))
                                .optional()
                                .orElse(new Dto.IngredientText("", null)));
            }
            drafts.add(new Dto.IngredientDraft(row.quantity(), row.unit(), row.scalable(), t));
        }
        return drafts;
    }

    private List<Dto.StepDraft> stepDrafts(long recipeId) {
        record Row(long id, Integer duration, Integer offset) {}

        List<Row> rows = jdbc.sql(
                        "SELECT id, duration_minutes, video_offset_seconds FROM step WHERE recipe_id = ? ORDER BY position")
                .param(recipeId)
                .query((rs, n) -> new Row(
                        rs.getLong("id"), nullableInt(rs, "duration_minutes"), nullableInt(rs, "video_offset_seconds")))
                .list();

        List<Dto.StepDraft> drafts = new ArrayList<>();
        for (Row row : rows) {
            Map<String, Dto.StepText> t = new LinkedHashMap<>();
            for (String locale : LOCALES) {
                t.put(
                        locale,
                        jdbc.sql("SELECT body FROM step_translation WHERE step_id = ? AND locale = ?")
                                .param(row.id())
                                .param(locale)
                                .query((rs, n) -> new Dto.StepText(rs.getString("body")))
                                .optional()
                                .orElse(new Dto.StepText("")));
            }
            drafts.add(new Dto.StepDraft(row.duration(), row.offset(), t));
        }
        return drafts;
    }

    /**
     * An empty recipe, already shaped.
     *
     * <p>Built here rather than in the browser so there is one definition of what
     * "empty" means. One blank ingredient and one blank step, because starting
     * from nothing would make the editor's first job "add a row" instead of
     * "write something".
     */
    public Dto.RecipeDraft blank() {
        Map<String, Dto.TranslationDraft> translations = new LinkedHashMap<>();
        Map<String, Dto.IngredientText> ingredientText = new LinkedHashMap<>();
        Map<String, Dto.StepText> stepText = new LinkedHashMap<>();

        for (String locale : LOCALES) {
            translations.put(locale, new Dto.TranslationDraft("", "", "", ""));
            ingredientText.put(locale, new Dto.IngredientText("", null));
            stepText.put(locale, new Dto.StepText(""));
        }

        return new Dto.RecipeDraft(
                "",
                "DRAFT",
                List.of(),
                null,
                null,
                1,
                2,
                null,
                List.of(new Dto.IngredientDraft(null, "g", true, ingredientText)),
                List.of(new Dto.StepDraft(null, null, stepText)),
                translations);
    }

    // --- saving -----------------------------------------------------------

    /**
     * Creates when the key is new, replaces when it is not.
     *
     * <p>Transactional because it is one change made of eight statements. A
     * failure halfway through would otherwise leave a recipe with its old
     * translations and none of its ingredients, which is worse than either
     * version of it.
     */
    @Transactional
    public void save(Dto.RecipeDraft draft) {
        String key = draft.key().trim();
        Optional<Long> existing = recipeIdFor(key);

        long id = existing.orElseGet(() -> insertRecipe(key));
        updateRecipe(id, draft);
        replaceTranslations(id, draft);
        replaceTags(id, draft);
        replaceIngredients(id, draft);
        replaceSteps(id, draft);
        deriveSearchText(id);
    }

    private long insertRecipe(String key) {
        jdbc.sql(
                        """
                        INSERT INTO recipe (key, author_id, status, published_at, difficulty, base_servings)
                        VALUES (:key, (SELECT min(id) FROM author), 'DRAFT', :now, 1, 2)
                        """)
                .param("key", key)
                .param("now", Instant.now().toString())
                .update();

        return jdbc.sql("SELECT last_insert_rowid()").query(Long.class).single();
    }

    /**
     * Note what is absent: {@code published_at} and {@code featured_rank} are
     * never written here. They are not in the draft because an author does not
     * own them, so a save leaves them exactly as they were.
     */
    private void updateRecipe(long id, Dto.RecipeDraft draft) {
        jdbc.sql(
                        """
                        UPDATE recipe SET status = :status, prep_minutes = :prep, cook_minutes = :cook,
                                          difficulty = :difficulty, base_servings = :servings,
                                          youtube_video_id = :video
                        WHERE id = :id
                        """)
                .param("status", draft.status())
                .param("prep", draft.prepMinutes())
                .param("cook", draft.cookMinutes())
                .param("difficulty", draft.difficulty())
                .param("servings", draft.baseServings())
                .param("video", draft.youtubeVideoId())
                .param("id", id)
                .update();
    }

    /**
     * Upserted rather than deleted and re-inserted, so that {@code hero_kicker}
     * and {@code hero_excerpt} survive. The hero copy is written elsewhere and is
     * not in the editor; replacing the row wholesale would blank it on every save
     * and quietly empty the home page carousel.
     */
    private void replaceTranslations(long id, Dto.RecipeDraft draft) {
        for (String locale : LOCALES) {
            Dto.TranslationDraft t = draft.t().getOrDefault(locale, new Dto.TranslationDraft("", "", "", ""));

            jdbc.sql(
                            """
                            INSERT INTO recipe_translation (
                                recipe_id, locale, slug, title, excerpt, body_markdown, body_html, search_text)
                            VALUES (:id, :locale, :slug, :title, :excerpt, :markdown, :html, '')
                            ON CONFLICT (recipe_id, locale) DO UPDATE SET
                                slug          = excluded.slug,
                                title         = excluded.title,
                                excerpt       = excluded.excerpt,
                                body_markdown = excluded.body_markdown,
                                body_html     = excluded.body_html
                            """)
                    .param("id", id)
                    .param("locale", locale)
                    .param("slug", t.slug())
                    .param("title", t.title())
                    .param("excerpt", t.excerpt())
                    .param("markdown", t.bodyMarkdown())
                    // Rendered on write like every other body on the site, so a
                    // recipe saved through the editor is not the one row the
                    // frontend has to render for itself.
                    .param("html", markdown.render(t.bodyMarkdown()))
                    .update();
        }
    }

    private void replaceTags(long id, Dto.RecipeDraft draft) {
        jdbc.sql("DELETE FROM recipe_tag WHERE recipe_id = ?").param(id).update();

        for (String tagKey : draft.tagKeys()) {
            // Ignores a key that names no tag rather than failing the save: tags
            // are a fixed vocabulary and a stale one in a draft is not a reason
            // to lose the recipe someone just wrote.
            jdbc.sql("INSERT INTO recipe_tag (recipe_id, tag_id) SELECT ?, id FROM tag WHERE key = ?")
                    .param(id)
                    .param(tagKey)
                    .update();
        }
    }

    /**
     * Deleted and re-inserted, unlike the translations.
     *
     * <p>These are genuinely owned by the draft - there is nothing on an
     * ingredient that is not in the editor - and they are ordered, so matching
     * old rows to new ones would mean inventing identities the editor never sent.
     * ON DELETE CASCADE takes the translations with them.
     */
    private void replaceIngredients(long id, Dto.RecipeDraft draft) {
        jdbc.sql("DELETE FROM ingredient WHERE recipe_id = ?").param(id).update();

        int position = 0;
        for (Dto.IngredientDraft ingredient : draft.ingredients()) {
            jdbc.sql(
                            """
                            INSERT INTO ingredient (recipe_id, position, base_quantity, unit, scalable)
                            VALUES (:id, :position, :quantity, :unit, :scalable)
                            """)
                    .param("id", id)
                    .param("position", position++)
                    .param("quantity", ingredient.baseQuantity())
                    .param("unit", ingredient.unit() == null ? "" : ingredient.unit())
                    .param("scalable", ingredient.scalable() ? 1 : 0)
                    .update();

            long ingredientId = jdbc.sql("SELECT last_insert_rowid()").query(Long.class).single();

            for (String locale : LOCALES) {
                Dto.IngredientText text =
                        ingredient.t().getOrDefault(locale, new Dto.IngredientText("", null));

                jdbc.sql(
                                """
                                INSERT INTO ingredient_translation (ingredient_id, locale, name, note)
                                VALUES (?, ?, ?, ?)
                                """)
                        .param(ingredientId)
                        .param(locale)
                        .param(text.name() == null ? "" : text.name())
                        .param(text.note())
                        .update();
            }
        }
    }

    private void replaceSteps(long id, Dto.RecipeDraft draft) {
        jdbc.sql("DELETE FROM step WHERE recipe_id = ?").param(id).update();

        int position = 0;
        for (Dto.StepDraft step : draft.steps()) {
            jdbc.sql(
                            """
                            INSERT INTO step (recipe_id, position, duration_minutes, video_offset_seconds)
                            VALUES (:id, :position, :duration, :offset)
                            """)
                    .param("id", id)
                    .param("position", position++)
                    .param("duration", step.durationMinutes())
                    .param("offset", step.videoOffsetSeconds())
                    .update();

            long stepId = jdbc.sql("SELECT last_insert_rowid()").query(Long.class).single();

            for (String locale : LOCALES) {
                Dto.StepText text = step.t().getOrDefault(locale, new Dto.StepText(""));

                jdbc.sql("INSERT INTO step_translation (step_id, locale, body) VALUES (?, ?, ?)")
                        .param(stepId)
                        .param(locale)
                        .param(text.body() == null ? "" : text.body())
                        .update();
            }
        }
    }

    /**
     * Title, excerpt, tag labels and ingredient names, in one column per locale.
     *
     * <p>The same statement V2 uses on the seed, scoped to one recipe. Sharing the
     * derivation is the point: if the editor built this differently, a recipe
     * saved here would be findable by different words than a seeded one, and
     * nothing would ever report it.
     */
    private void deriveSearchText(long id) {
        jdbc.sql(
                        """
                        UPDATE recipe_translation
                        SET search_text = title || ' ' || excerpt
                            || COALESCE((SELECT ' ' || group_concat(tt.label, ' ')
                                         FROM recipe_tag rt
                                         JOIN tag_translation tt ON tt.tag_id = rt.tag_id
                                                                AND tt.locale = recipe_translation.locale
                                         WHERE rt.recipe_id = recipe_translation.recipe_id), '')
                            || COALESCE((SELECT ' ' || group_concat(it.name, ' ')
                                         FROM ingredient i
                                         JOIN ingredient_translation it ON it.ingredient_id = i.id
                                                                       AND it.locale = recipe_translation.locale
                                         WHERE i.recipe_id = recipe_translation.recipe_id), '')
                        WHERE recipe_id = ?
                        """)
                .param(id)
                .update();
    }

    public boolean setStatus(String key, String status) {
        return jdbc.sql("UPDATE recipe SET status = ? WHERE key = ?")
                        .param(status)
                        .param(key)
                        .update()
                > 0;
    }

    // --- moderation -------------------------------------------------------

    /** Oldest first: a queue is worked through, unlike a thread, which is read. */
    public List<Dto.ModerationItem> pending(String locale) {
        record Row(long id, long recipeId, String name, String avatar, String markdown, String html, String created) {}

        // The avatar comes from the joined account, not the comment row (ADR 7),
        // so the queue shows the moderator the same avatar the thread will.
        List<Row> rows = jdbc.sql(
                        """
                        SELECT c.id, c.recipe_id, c.display_name, u.avatar,
                               c.body_markdown, c.body_html, c.created_at
                        FROM comment c
                        LEFT JOIN app_user u ON u.id = c.user_id
                        WHERE c.status = 'PENDING' ORDER BY c.created_at, c.id
                        """)
                .query((rs, n) -> new Row(
                        rs.getLong("id"),
                        rs.getLong("recipe_id"),
                        rs.getString("display_name"),
                        rs.getString("avatar"),
                        rs.getString("body_markdown"),
                        rs.getString("body_html"),
                        rs.getString("created_at")))
                .list();

        List<Dto.ModerationItem> items = new ArrayList<>();
        for (Row row : rows) {
            Dto.Comment comment = new Dto.Comment(
                    row.id(),
                    new Dto.CommentAuthor(row.name(), row.avatar()),
                    row.markdown(),
                    row.html(),
                    row.created(),
                    "PENDING",
                    // Never the moderator's own, as far as this screen is
                    // concerned: it offers approve and reject, not delete.
                    false);

            items.add(new Dto.ModerationItem(
                    comment,
                    jdbc.sql("SELECT key FROM recipe WHERE id = ?")
                            .param(row.recipeId())
                            .query(String.class)
                            .single(),
                    title(row.recipeId(), locale)));
        }
        return items;
    }

    /**
     * Approving publishes; rejecting deletes.
     *
     * <p>The schema permits a REJECTED status and this deliberately does not use
     * it. No screen would ever show one, and keeping a stranger's rejected remark
     * on file is a data-retention question with nothing on the other side of it.
     */
    public boolean moderate(long id, boolean approve) {
        if (approve) {
            return jdbc.sql("UPDATE comment SET status = 'PUBLISHED' WHERE id = ?")
                            .param(id)
                            .update()
                    > 0;
        }
        return jdbc.sql("DELETE FROM comment WHERE id = ?").param(id).update() > 0;
    }

    // --- the dashboard ----------------------------------------------------

    public Dto.AdminStats stats(String locale) {
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        // Every status present at zero rather than only the ones in use: the
        // dashboard renders a fixed set of tiles and a missing key is a gap in
        // the UI rather than a recipe count of none.
        for (String status : List.of("DRAFT", "PUBLISHED", "ARCHIVED")) {
            byStatus.put(
                    status,
                    jdbc.sql("SELECT count(*) FROM recipe WHERE status = ?")
                            .param(status)
                            .query(Integer.class)
                            .single());
        }

        int published = count("SELECT count(*) FROM comment WHERE status = 'PUBLISHED'");
        int awaiting = count("SELECT count(*) FROM comment WHERE status = 'PENDING'");
        int ratings = count("SELECT count(*) FROM rating");
        double average = jdbc.sql("SELECT coalesce(avg(stars), 0) FROM rating").query(Double.class).single();
        int reactions = count("SELECT count(*) FROM reaction");

        return new Dto.AdminStats(
                byStatus,
                new Dto.CommentTotals(published, awaiting),
                new Dto.RatingTotals(ratings, average),
                reactions,
                top(locale));
    }

    /**
     * The five best-rated, and only recipes anyone has actually rated.
     *
     * <p>Unrated ones are excluded rather than sorted last at zero: "no score yet"
     * and "scored badly" are different facts, and a table that ties them is
     * telling the author something untrue.
     */
    private List<Dto.AdminTopRecipe> top(String locale) {
        record Row(long id, String key, double average, int count) {}

        List<Row> rows = jdbc.sql(
                        """
                        SELECT r.id, r.key,
                               avg(x.stars) AS average,
                               count(x.id)  AS votes
                        FROM recipe r
                        JOIN rating x ON x.recipe_id = r.id
                        GROUP BY r.id, r.key
                        ORDER BY average DESC, votes DESC
                        LIMIT 5
                        """)
                .query((rs, n) -> new Row(
                        rs.getLong("id"), rs.getString("key"), rs.getDouble("average"), rs.getInt("votes")))
                .list();

        List<Dto.AdminTopRecipe> top = new ArrayList<>();
        for (Row row : rows) {
            top.add(new Dto.AdminTopRecipe(
                    row.key(),
                    title(row.id(), locale),
                    row.average(),
                    row.count(),
                    count("SELECT count(*) FROM comment WHERE recipe_id = " + row.id() + " AND status = 'PUBLISHED'")));
        }
        return top;
    }

    // --- shared -----------------------------------------------------------

    public Optional<Long> recipeIdFor(String key) {
        return jdbc.sql("SELECT id FROM recipe WHERE key = ?").param(key).query(Long.class).optional();
    }

    private int count(String sql) {
        return jdbc.sql(sql).query(Integer.class).single();
    }

    private static Integer nullableInt(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }
}
