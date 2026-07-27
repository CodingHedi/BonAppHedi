package fr.bonapphedi.api;

import java.util.List;
import java.util.Map;

/**
 * The wire shape, mirroring {@code frontend/src/app/core/api/models.ts} field
 * for field.
 *
 * <p>That file is the contract and this is what has to satisfy it (ADR 0001), so
 * these records are deliberately dumb: no logic, no computed accessors, nothing
 * that could make the JSON drift from the TypeScript. Names are camelCase
 * because that is what the frontend reads; the database is snake_case and the
 * translation happens in the DAO, once.
 *
 * <p>Nulls are serialized rather than omitted. {@code ImageRef.url} is
 * {@code string | null} on the other side, and a missing key is a different
 * thing to TypeScript than a null one.
 */
public final class Dto {

    private Dto() {}

    /** Null until real photography exists, which is the current state. */
    public record ImageRef(String url, String alt) {}

    public record Tag(String slug, String label, String colorVariant, Integer count) {}

    public record Author(String slug, String displayName, String avatarUrl, String bio) {}

    /** What a card shows: no per-visitor state, so it stays cacheable. */
    public record Rating(double average, int count) {}

    /** What the detail page shows, including what this visitor gave. */
    public record RatingSummary(double average, int count, Integer yourRating) {}

    public record Reactions(int count, boolean reacted) {}

    public record Ingredient(
            long id,
            int position,
            String name,
            Double baseQuantity,
            String unit,
            String note,
            boolean scalable) {}

    public record Step(
            long id, int position, String body, Integer durationMinutes, Integer videoOffsetSeconds) {}

    /** The same recipe's slug in the other language, so the switcher can navigate. */
    public record LocaleAlternate(String locale, String slug) {}

    public record RecipeSummary(
            String slug,
            String title,
            String excerpt,
            ImageRef image,
            List<Tag> tags,
            Author author,
            String publishedAt,
            Integer prepMinutes,
            Integer cookMinutes,
            int difficulty,
            Rating rating,
            String searchText) {}

    /**
     * RecipeDetail extends RecipeSummary in TypeScript. Java records cannot
     * extend, so the summary fields are repeated here rather than nested - the
     * JSON has to be flat either way, and nesting them would change the contract
     * to make the Java tidier.
     */
    public record RecipeDetail(
            String slug,
            String title,
            String excerpt,
            ImageRef image,
            List<Tag> tags,
            Author author,
            String publishedAt,
            Integer prepMinutes,
            Integer cookMinutes,
            int difficulty,
            String searchText,
            String bodyMarkdown,
            String bodyHtml,
            int baseServings,
            String youtubeVideoId,
            List<Ingredient> ingredients,
            List<Step> steps,
            RatingSummary rating,
            Reactions reactions,
            int commentCount,
            List<LocaleAlternate> alternates) {}

    public record HeroSlide(String slug, String kicker, String title, String excerpt, ImageRef image) {}

    /** {@code id} is what {@code /oauth2/authorization/{id}} takes; the label is a brand name. */
    public record AuthProvider(String id, String label) {}

    /**
     * Deliberately not {@link Author}: a commenter has no slug, no bio and no page.
     *
     * <p>{@code avatar} is a chosen-avatar token such as {@code carrot/3}, read
     * through {@code comment.user_id} rather than copied onto the comment, and
     * never a URL. It was a URL, and rendering it made reading a recipe disclose
     * the reader's address to Google (ADR 7).
     */
    public record CommentAuthor(String displayName, String avatar) {}

    /**
     * {@code status} is PUBLISHED, PENDING or REJECTED, and {@code mine} is
     * whether this reader wrote it - which is what lets the UI offer to delete it
     * without asking a second question.
     */
    public record Comment(
            long id,
            CommentAuthor author,
            String bodyMarkdown,
            String bodyHtml,
            String createdAt,
            String status,
            boolean mine) {}

    /**
     * Deliberately less than {@code app_user} holds. The email decides admin and
     * is the server's business; sending it to the browser would put an address on
     * the wire for no feature that needs it.
     */
    public record AuthUser(String id, String displayName, String avatar, boolean isAdmin) {}

    /** The body of {@code PUT /api/auth/avatar}. One field, and it is required. */
    public record AvatarChoice(String avatar) {}

    public record Page<T>(List<T> items, int page, int size, int total) {}

    // --- admin ----------------------------------------------------------------
    //
    // The drafts below are the one part of the contract that carries every
    // language at once. Everything the public site reads is already resolved to a
    // single locale because a reader wants one; an author is writing both and
    // needs to see them together. Hence the `t` maps, keyed by locale.
    //
    // What they deliberately leave out matters as much: no publication date, no
    // featured rank, no hero copy, no rating totals. Those are things a recipe
    // accumulates rather than things anyone types, and a draft that carried them
    // would let a save overwrite them with staler copies of themselves.

    public record TranslationDraft(String slug, String title, String excerpt, String bodyMarkdown) {}

    public record IngredientText(String name, String note) {}

    public record IngredientDraft(
            Double baseQuantity, String unit, boolean scalable, Map<String, IngredientText> t) {}

    public record StepText(String body) {}

    public record StepDraft(
            Integer durationMinutes, Integer videoOffsetSeconds, Map<String, StepText> t) {}

    public record RecipeDraft(
            String key,
            String status,
            List<String> tagKeys,
            Integer prepMinutes,
            Integer cookMinutes,
            int difficulty,
            int baseServings,
            String youtubeVideoId,
            List<IngredientDraft> ingredients,
            List<StepDraft> steps,
            Map<String, TranslationDraft> t) {}

    /** A row in the admin's recipe table. Drafts included - that is the point. */
    public record AdminRecipeRow(
            String key,
            String title,
            String status,
            String publishedAt,
            /** Languages this recipe actually has a title in, so gaps are visible. */
            List<String> translated,
            int ratingCount,
            int commentCount) {}

    /** A comment awaiting a decision, carrying enough context to judge it. */
    public record ModerationItem(Comment comment, String recipeKey, String recipeTitle) {}

    public record CommentTotals(int total, int pending) {}

    public record RatingTotals(int count, double average) {}

    public record AdminTopRecipe(
            String key, String title, double ratingAverage, int ratingCount, int commentCount) {}

    public record AdminStats(
            Map<String, Integer> recipes,
            CommentTotals comments,
            RatingTotals ratings,
            int reactions,
            List<AdminTopRecipe> top) {}
}
