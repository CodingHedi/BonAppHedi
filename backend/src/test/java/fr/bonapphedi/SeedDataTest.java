package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

/**
 * The seed, asserted against the frontend's own.
 *
 * <p>ADR 0001 makes the milestone-1 e2e suite the acceptance test for the swap,
 * and those 96 specs assert exact content: five published recipes, a babka rated
 * 4.0 from a single vote, a step at 02:14, two named comments and one awaiting
 * moderation. If this seed drifts from {@code mock/seed-data.ts} by one row the
 * suite fails somewhere unrelated and blames the wrong thing.
 *
 * <p>So these are not "does the database have rows" tests. Each one pins a fact
 * some e2e spec depends on, close to the data, where the failure names the cause.
 */
@SpringBootTest
@TestPropertySource(properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-seed.db?foreign_keys=on")
class SeedDataTest {

    @Autowired
    private JdbcClient jdbc;

    private Long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    @Test
    void seedsEveryRecipe() {
        assertThat(count("SELECT count(*) FROM recipe")).isEqualTo(6);
    }

    @Test
    void seedsExactlyOneDraft() {
        // The public site must show five. A sixth appearing means the draft
        // leaked; a fourth means a published recipe went missing.
        assertThat(count("SELECT count(*) FROM recipe WHERE status = 'PUBLISHED'")).isEqualTo(5);
        assertThat(jdbc.sql("SELECT key FROM recipe WHERE status = 'DRAFT'")
                        .query(String.class)
                        .single())
                .isEqualTo("pomegranate-juice");
    }

    @Test
    void translatesEveryRecipeIntoBothLanguages() {
        assertThat(count("SELECT count(*) FROM recipe_translation")).isEqualTo(12);
    }

    @Test
    void seedsTheBabkaAsTheFrontendHasIt() {
        var babka = jdbc.sql("""
                        SELECT prep_minutes, cook_minutes, difficulty, base_servings,
                               youtube_video_id, featured_rank
                        FROM recipe WHERE key = 'babka'
                        """)
                .query((rs, n) -> new int[] {
                        rs.getInt("prep_minutes"), rs.getInt("cook_minutes"),
                        rs.getInt("difficulty"), rs.getInt("base_servings"),
                        rs.getInt("featured_rank")
                })
                .single();

        assertThat(babka).containsExactly(15, 45, 1, 2, 1);

        assertThat(jdbc.sql("SELECT youtube_video_id FROM recipe WHERE key = 'babka'")
                        .query(String.class)
                        .single())
                .isEqualTo("YE7VzlLtp-4");
    }

    @Test
    void givesTheBabkaBothItsSlugs() {
        // Two locales, two genuinely different URLs - the whole reason slugs live
        // on the translation row rather than on the recipe.
        assertThat(jdbc.sql("SELECT slug FROM recipe_translation rt JOIN recipe r ON r.id = rt.recipe_id "
                                + "WHERE r.key = 'babka' AND rt.locale = 'fr'")
                        .query(String.class)
                        .single())
                .isEqualTo("babka-au-chocolat");

        assertThat(jdbc.sql("SELECT slug FROM recipe_translation rt JOIN recipe r ON r.id = rt.recipe_id "
                                + "WHERE r.key = 'babka' AND rt.locale = 'en'")
                        .query(String.class)
                        .single())
                .isEqualTo("chocolate-babka");
    }

    @Test
    void seedsSevenIngredientsAndFiveStepsForTheBabka() {
        assertThat(count("SELECT count(*) FROM ingredient i JOIN recipe r ON r.id = i.recipe_id "
                + "WHERE r.key = 'babka'")).isEqualTo(7);
        assertThat(count("SELECT count(*) FROM step s JOIN recipe r ON r.id = s.recipe_id "
                + "WHERE r.key = 'babka'")).isEqualTo(5);
    }

    @Test
    void putsTheThirdBabkaStepAtTwoMinutesFourteen() {
        // 134 seconds. An e2e spec clicks the "(02:14)" timestamp and asserts the
        // player is cued there, so this number is load-bearing.
        assertThat(jdbc.sql("SELECT video_offset_seconds FROM step s JOIN recipe r ON r.id = s.recipe_id "
                                + "WHERE r.key = 'babka' AND s.position = 2")
                        .query(Integer.class)
                        .single())
                .isEqualTo(134);
    }

    @Test
    void ratesTheBabkaFourFromASingleVote() {
        // The detail page shows "4.0 / 5 · 1 avis" before anyone touches it.
        assertThat(count("SELECT count(*) FROM rating rt JOIN recipe r ON r.id = rt.recipe_id "
                + "WHERE r.key = 'babka'")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT stars FROM rating rt JOIN recipe r ON r.id = rt.recipe_id "
                                + "WHERE r.key = 'babka'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(4);
    }

    @Test
    void keepsAnIngredientThatMustNotScale() {
        // The shakshuka's salt and pepper have no quantity and must not multiply
        // with the serving count.
        assertThat(count("SELECT count(*) FROM ingredient i JOIN recipe r ON r.id = i.recipe_id "
                + "WHERE r.key = 'shakshuka' AND i.scalable = 0 AND i.base_quantity IS NULL"))
                .isEqualTo(1);
    }

    @Test
    void seedsTheCommentThread() {
        assertThat(count("SELECT count(*) FROM comment c JOIN recipe r ON r.id = c.recipe_id "
                + "WHERE r.key = 'babka' AND c.status = 'PUBLISHED'")).isEqualTo(2);

        // One published and one pending on the shakshuka: the queue has to have
        // something in it for moderation to be exercisable at all.
        assertThat(count("SELECT count(*) FROM comment c JOIN recipe r ON r.id = c.recipe_id "
                + "WHERE r.key = 'shakshuka' AND c.status = 'PUBLISHED'")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM comment WHERE status = 'PENDING'")).isEqualTo(1);
    }

    @Test
    void seedsTheTagsWithTheirPerLocaleSlugs() {
        assertThat(count("SELECT count(*) FROM tag")).isEqualTo(4);

        // "chocolat" in French, "chocolate" in English - the tag filter in the
        // URL is localized like everything else.
        assertThat(jdbc.sql("SELECT slug FROM tag_translation tt JOIN tag t ON t.id = tt.tag_id "
                                + "WHERE t.key = 'chocolate' AND tt.locale = 'fr'")
                        .query(String.class)
                        .single())
                .isEqualTo("chocolat");
    }

    @Test
    void seedsTheSoleAuthor() {
        assertThat(jdbc.sql("SELECT display_name FROM author").query(String.class).single())
                .isEqualTo("Hedi");
    }

    @Test
    void computesSearchTextSoIngredientsAreFindable() {
        // An e2e spec searches "poivron", which appears only in an ingredient
        // name. The server builds this on write so the list endpoint never has
        // to ship every ingredient row for every card.
        assertThat(count("SELECT count(*) FROM recipe_translation WHERE locale = 'fr' "
                + "AND search_text LIKE '%poivron%'")).isEqualTo(1);
    }
}
