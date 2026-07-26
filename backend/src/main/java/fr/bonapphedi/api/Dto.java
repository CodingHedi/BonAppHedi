package fr.bonapphedi.api;

import java.util.List;

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
     * Deliberately less than {@code app_user} holds. The email decides admin and
     * is the server's business; sending it to the browser would put an address on
     * the wire for no feature that needs it.
     */
    public record AuthUser(String id, String displayName, String avatarUrl, boolean isAdmin) {}

    public record Page<T>(List<T> items, int page, int size, int total) {}
}
