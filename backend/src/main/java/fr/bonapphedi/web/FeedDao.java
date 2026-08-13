package fr.bonapphedi.web;

import fr.bonapphedi.api.RecipeQueryDao;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * What the sitemap and the feeds need, which is much less than a page needs.
 *
 * <p>Separate from {@code RecipeQueryDao} because the shape is different rather
 * than the rules: one row per translation instead of one per recipe, and no
 * tags, ratings, ingredients or author. A sitemap of a few hundred entries built
 * out of full summaries would load all of that to print two URLs per recipe.
 *
 * <p><b>The visibility rule is borrowed rather than restated.</b> It is the one
 * thing that must not differ from the API: a sitemap naming a recipe the API
 * answers 404 for invites a crawler to a page that does not exist, and a recipe
 * missing from the sitemap is one that never gets found.
 */
@Repository
public class FeedDao {

    private final JdbcClient jdbc;

    public FeedDao(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** One recipe, with every language it has actually been translated into. */
    public record Entry(String publishedAt, List<Translation> translations) {}

    public record Translation(String locale, String slug, String title, String excerpt) {}

    /**
     * Newest first, which is the order the feeds want and the sitemap does not
     * mind. Sorting in SQL rather than in Java is what makes the ISO-8601 text
     * dates worth having: they sort lexicographically (ADR 2).
     *
     * <p>Ordered by {@code id} within a date so two recipes published in the
     * same minute do not swap places between requests, which would make a feed
     * look changed to a reader that is only comparing.
     */
    public List<Entry> published() {
        String sql = "SELECT r.id AS id, r.published_at AS published_at, rt.locale AS locale,"
                + " rt.slug AS slug, rt.title AS title, rt.excerpt AS excerpt"
                + " FROM recipe r"
                + " JOIN recipe_translation rt ON rt.recipe_id = r.id"
                + RecipeQueryDao.PUBLIC_WHERE
                + " ORDER BY r.published_at DESC, r.id, rt.locale";

        Map<Long, Entry> byRecipe = new LinkedHashMap<>();

        jdbc.sql(sql).query((rs, n) -> {
            long id = rs.getLong("id");
            // Read before the lookup: published_at may be null for a recipe
            // published without a date, which the schema allows, and the
            // documents leave the date out rather than inventing one - an item
            // dated "now" because nothing was stored resurfaces as new on every
            // fetch.
            String publishedAt = rs.getString("published_at");

            byRecipe.computeIfAbsent(id, key -> new Entry(publishedAt, new ArrayList<>()))
                    .translations()
                    .add(new Translation(
                            rs.getString("locale"),
                            rs.getString("slug"),
                            rs.getString("title"),
                            rs.getString("excerpt")));
            return id;
        }).list();

        return List.copyOf(byRecipe.values());
    }
}
