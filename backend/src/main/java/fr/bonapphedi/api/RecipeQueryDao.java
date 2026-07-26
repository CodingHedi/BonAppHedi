package fr.bonapphedi.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Every read the public site performs, as hand-written SQL.
 *
 * <p>ADR 0002 chose Spring Data JDBC precisely so the join-heavy reads could be
 * written out rather than generated: they are visible here, and tunable, which
 * a derived query name is not.
 *
 * <p>Two rules run through all of it. A recipe is public only when it is
 * PUBLISHED <em>and</em> actually translated into the language being asked for -
 * without the second half the English site quietly fills with French cards,
 * which reads as a bug rather than as a partial translation. And a slug
 * identifies a recipe within one language only, so every lookup is by
 * (slug, locale) and never by slug alone.
 */
@Repository
public class RecipeQueryDao {

    private final JdbcClient jdbc;

    public RecipeQueryDao(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Columns shared by the card and the detail page, so the two cannot disagree. */
    private static final String SUMMARY_COLUMNS = """
            SELECT r.id                AS id,
                   rt.slug             AS slug,
                   rt.title            AS title,
                   rt.excerpt          AS excerpt,
                   rt.search_text      AS search_text,
                   r.published_at      AS published_at,
                   r.prep_minutes      AS prep_minutes,
                   r.cook_minutes      AS cook_minutes,
                   r.difficulty        AS difficulty,
                   a.slug              AS author_slug,
                   a.display_name      AS author_name,
                   a.avatar_url        AS author_avatar,
                   at.bio              AS author_bio,
                   (SELECT count(*) FROM rating x WHERE x.recipe_id = r.id)               AS rating_count,
                   (SELECT coalesce(avg(x.stars), 0) FROM rating x WHERE x.recipe_id = r.id) AS rating_avg
            FROM recipe r
            JOIN recipe_translation rt ON rt.recipe_id = r.id AND rt.locale = :locale
            JOIN author a              ON a.id = r.author_id
            LEFT JOIN author_translation at ON at.author_id = a.id AND at.locale = :locale
            """;

    /** Published, and translated into the language asked for. Both halves matter. */
    private static final String PUBLIC_WHERE = " WHERE r.status = 'PUBLISHED' AND rt.title <> '' ";

    public List<Dto.RecipeSummary> list(String locale, String tagSlug, String authorSlug, String sort) {
        StringBuilder sql = new StringBuilder(SUMMARY_COLUMNS).append(PUBLIC_WHERE);

        if (tagSlug != null && !tagSlug.isBlank()) {
            sql.append("""
                    AND EXISTS (SELECT 1 FROM recipe_tag rtg
                                JOIN tag_translation tt ON tt.tag_id = rtg.tag_id AND tt.locale = :locale
                                WHERE rtg.recipe_id = r.id AND tt.slug = :tag)
                    """);
        }
        if (authorSlug != null && !authorSlug.isBlank()) {
            sql.append(" AND a.slug = :author ");
        }

        // Only two orderings exist and both are named, so this cannot become a
        // route for arbitrary SQL from a query parameter.
        sql.append("oldest".equals(sort) ? " ORDER BY r.published_at ASC " : " ORDER BY r.published_at DESC ");

        var spec = jdbc.sql(sql.toString()).param("locale", locale);
        if (tagSlug != null && !tagSlug.isBlank()) spec = spec.param("tag", tagSlug);
        if (authorSlug != null && !authorSlug.isBlank()) spec = spec.param("author", authorSlug);

        List<Row> rows = spec.query(Row.MAPPER).list();
        Map<Long, List<Dto.Tag>> tags = tagsFor(rows.stream().map(Row::id).toList(), locale);

        return rows.stream()
                .map(row -> row.toSummary(tags.getOrDefault(row.id(), List.of())))
                .toList();
    }

    public Optional<Dto.RecipeDetail> bySlug(String slug, String locale) {
        String sql = SUMMARY_COLUMNS + PUBLIC_WHERE + """
                AND rt.slug = :slug
                """;

        // A second read of the same row for the columns only the detail page
        // needs, rather than carrying them through every card query.
        Optional<Row> found = jdbc.sql(sql)
                .param("locale", locale)
                .param("slug", slug)
                .query(Row.MAPPER)
                .optional();

        if (found.isEmpty()) {
            return Optional.empty();
        }

        Row row = found.get();
        long id = row.id();

        var extra = jdbc.sql("""
                        SELECT r.base_servings, r.youtube_video_id, rt.body_markdown, rt.body_html
                        FROM recipe r
                        JOIN recipe_translation rt ON rt.recipe_id = r.id AND rt.locale = :locale
                        WHERE r.id = :id
                        """)
                .param("locale", locale)
                .param("id", id)
                .query((rs, n) -> new Object[] {
                        rs.getInt("base_servings"), rs.getString("youtube_video_id"),
                        rs.getString("body_markdown"), rs.getString("body_html")
                })
                .single();

        List<Dto.Ingredient> ingredients = jdbc.sql("""
                        SELECT i.id, i.position, i.base_quantity, i.unit, i.scalable, it.name, it.note
                        FROM ingredient i
                        JOIN ingredient_translation it ON it.ingredient_id = i.id AND it.locale = :locale
                        WHERE i.recipe_id = :id
                        ORDER BY i.position
                        """)
                .param("locale", locale)
                .param("id", id)
                .query((rs, n) -> {
                    // wasNull() reports on the column read *last*, so it has to
                    // be captured here and not further down the argument list -
                    // reading `name` in between silently makes this the answer
                    // for `name` instead, and "salt and pepper" comes back
                    // quantified.
                    double quantity = rs.getDouble("base_quantity");
                    Double baseQuantity = rs.wasNull() ? null : quantity;

                    return new Dto.Ingredient(
                            rs.getLong("id"),
                            rs.getInt("position"),
                            rs.getString("name"),
                            baseQuantity,
                            rs.getString("unit"),
                            rs.getString("note"),
                            rs.getInt("scalable") == 1);
                })
                .list();

        List<Dto.Step> steps = jdbc.sql("""
                        SELECT s.id, s.position, s.duration_minutes, s.video_offset_seconds, st.body
                        FROM step s
                        JOIN step_translation st ON st.step_id = s.id AND st.locale = :locale
                        WHERE s.recipe_id = :id
                        ORDER BY s.position
                        """)
                .param("locale", locale)
                .param("id", id)
                .query((rs, n) -> new Dto.Step(
                        rs.getLong("id"),
                        rs.getInt("position"),
                        rs.getString("body"),
                        nullableInt(rs.getInt("duration_minutes"), rs.wasNull()),
                        nullableInt(rs.getInt("video_offset_seconds"), rs.wasNull())))
                .list();

        List<Dto.LocaleAlternate> alternates = jdbc.sql(
                        "SELECT locale, slug FROM recipe_translation WHERE recipe_id = :id ORDER BY locale")
                .param("id", id)
                .query((rs, n) -> new Dto.LocaleAlternate(rs.getString("locale"), rs.getString("slug")))
                .list();

        int reactionCount = jdbc.sql("SELECT count(*) FROM reaction WHERE recipe_id = :id")
                .param("id", id).query(Integer.class).single();

        // Counts what a visitor can actually see, so it agrees with the thread
        // below it. A pending comment is not public reading.
        int commentCount = jdbc.sql(
                        "SELECT count(*) FROM comment WHERE recipe_id = :id AND status = 'PUBLISHED'")
                .param("id", id).query(Integer.class).single();

        List<Dto.Tag> tags = tagsFor(List.of(id), locale).getOrDefault(id, List.of());

        return Optional.of(new Dto.RecipeDetail(
                row.slug(), row.title(), row.excerpt(),
                new Dto.ImageRef(null, row.title()),
                tags, row.author(), row.publishedAt(),
                row.prepMinutes(), row.cookMinutes(), row.difficulty(), row.searchText(),
                (String) extra[2],
                (String) extra[3],
                (Integer) extra[0],
                (String) extra[1],
                ingredients, steps,
                // yourRating is null until sessions exist; an anonymous visitor
                // has rated nothing that can be attributed back to them.
                new Dto.RatingSummary(row.ratingAvg(), row.ratingCount(), null),
                new Dto.Reactions(reactionCount, false),
                commentCount,
                alternates));
    }

    public List<Dto.HeroSlide> featured(String locale) {
        return jdbc.sql("""
                        SELECT rt.slug, rt.title, rt.hero_kicker, rt.hero_excerpt, rt.excerpt
                        FROM recipe r
                        JOIN recipe_translation rt ON rt.recipe_id = r.id AND rt.locale = :locale
                        WHERE r.status = 'PUBLISHED' AND rt.title <> '' AND r.featured_rank IS NOT NULL
                        ORDER BY r.featured_rank
                        """)
                .param("locale", locale)
                .query((rs, n) -> {
                    String heroExcerpt = rs.getString("hero_excerpt");
                    String kicker = rs.getString("hero_kicker");
                    return new Dto.HeroSlide(
                            rs.getString("slug"),
                            kicker == null ? "" : kicker,
                            rs.getString("title"),
                            // Falls back to the card excerpt, which is what the
                            // mock does when no hero copy was written.
                            heroExcerpt == null ? rs.getString("excerpt") : heroExcerpt,
                            new Dto.ImageRef(null, rs.getString("title")));
                })
                .list();
    }

    /** Only tags that something published actually carries, with their counts. */
    public List<Dto.Tag> tags(String locale) {
        return jdbc.sql("""
                        SELECT tt.slug, tt.label, t.color_variant, count(*) AS uses
                        FROM tag t
                        JOIN tag_translation tt ON tt.tag_id = t.id AND tt.locale = :locale
                        JOIN recipe_tag rtg ON rtg.tag_id = t.id
                        JOIN recipe r ON r.id = rtg.recipe_id AND r.status = 'PUBLISHED'
                        JOIN recipe_translation rt ON rt.recipe_id = r.id AND rt.locale = :locale AND rt.title <> ''
                        GROUP BY t.id, tt.slug, tt.label, t.color_variant
                        ORDER BY t.id
                        """)
                .param("locale", locale)
                .query((rs, n) -> new Dto.Tag(
                        rs.getString("slug"), rs.getString("label"),
                        rs.getString("color_variant"), rs.getInt("uses")))
                .list();
    }

    public List<Dto.Author> authors(String locale) {
        return jdbc.sql("""
                        SELECT a.slug, a.display_name, a.avatar_url, at.bio
                        FROM author a
                        LEFT JOIN author_translation at ON at.author_id = a.id AND at.locale = :locale
                        ORDER BY a.id
                        """)
                .param("locale", locale)
                .query((rs, n) -> new Dto.Author(
                        rs.getString("slug"), rs.getString("display_name"),
                        rs.getString("avatar_url"), rs.getString("bio")))
                .list();
    }

    // --- internals ------------------------------------------------------------

    /**
     * One query for every recipe's tags rather than one per recipe. Five cards
     * would be six round trips otherwise, and SQLite serialises them.
     */
    private Map<Long, List<Dto.Tag>> tagsFor(List<Long> recipeIds, String locale) {
        if (recipeIds.isEmpty()) {
            return Map.of();
        }

        Map<Long, List<Dto.Tag>> byRecipe = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT rtg.recipe_id, tt.slug, tt.label, t.color_variant
                        FROM recipe_tag rtg
                        JOIN tag t ON t.id = rtg.tag_id
                        JOIN tag_translation tt ON tt.tag_id = t.id AND tt.locale = :locale
                        WHERE rtg.recipe_id IN (:ids)
                        ORDER BY rtg.rowid
                        """)
                .param("locale", locale)
                .param("ids", recipeIds)
                .query((rs, n) -> {
                    byRecipe.computeIfAbsent(rs.getLong("recipe_id"), k -> new ArrayList<>())
                            .add(new Dto.Tag(rs.getString("slug"), rs.getString("label"),
                                    rs.getString("color_variant"), null));
                    return null;
                })
                .list();

        return byRecipe;
    }

    private static Integer nullableInt(int value, boolean wasNull) {
        return wasNull ? null : value;
    }

    /** The shared summary row, before tags are attached. */
    private record Row(
            long id, String slug, String title, String excerpt, String searchText,
            String publishedAt, Integer prepMinutes, Integer cookMinutes, int difficulty,
            Dto.Author author, double ratingAvg, int ratingCount) {

        static final org.springframework.jdbc.core.RowMapper<Row> MAPPER = (rs, n) -> {
            int prep = rs.getInt("prep_minutes");
            boolean prepNull = rs.wasNull();
            int cook = rs.getInt("cook_minutes");
            boolean cookNull = rs.wasNull();

            return new Row(
                    rs.getLong("id"),
                    rs.getString("slug"),
                    rs.getString("title"),
                    rs.getString("excerpt"),
                    rs.getString("search_text"),
                    rs.getString("published_at"),
                    prepNull ? null : prep,
                    cookNull ? null : cook,
                    rs.getInt("difficulty"),
                    new Dto.Author(rs.getString("author_slug"), rs.getString("author_name"),
                            rs.getString("author_avatar"), rs.getString("author_bio")),
                    rs.getDouble("rating_avg"),
                    rs.getInt("rating_count"));
        };

        Dto.RecipeSummary toSummary(List<Dto.Tag> tags) {
            return new Dto.RecipeSummary(
                    slug, title, excerpt,
                    new Dto.ImageRef(null, title),
                    tags, author, publishedAt, prepMinutes, cookMinutes, difficulty,
                    new Dto.Rating(ratingAvg, ratingCount),
                    searchText);
        }
    }
}
