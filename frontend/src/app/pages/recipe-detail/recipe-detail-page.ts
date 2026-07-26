import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { RECIPE_API } from '../../core/api/recipe-api';
import { SOCIAL_API } from '../../core/api/social-api';
import type { RatingSummary, ReactionState } from '../../core/api/models';
import { LocaleService } from '../../core/i18n/locale.service';
import { ShareBarComponent } from '../../shared/ui/share-bar/share-bar';
import { ReactionBarComponent } from './reaction-bar/reaction-bar';
import { CommentSectionComponent } from './comment-section/comment-section';
import { TagChipComponent } from '../../shared/ui/tag-chip/tag-chip';
import { MarkdownComponent } from '../../shared/ui/markdown/markdown';
import { RelativeTimePipe } from '../../shared/pipes';
import { clampServings } from '../../shared/scaling';
import { StarRatingComponent } from './star-rating/star-rating';
import { QuickFactsComponent } from './quick-facts/quick-facts';
import { RecipeMediaComponent } from './recipe-media/recipe-media';
import { StepListComponent } from './step-list/step-list';
import { IngredientPanelComponent } from './ingredient-panel/ingredient-panel';

@Component({
  selector: 'bah-recipe-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslocoPipe,
    RelativeTimePipe,
    TagChipComponent,
    MarkdownComponent,
    StarRatingComponent,
    QuickFactsComponent,
    RecipeMediaComponent,
    StepListComponent,
    IngredientPanelComponent,
    ShareBarComponent,
    ReactionBarComponent,
    CommentSectionComponent,
  ],
  template: `
    @if (recipe.isLoading()) {
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--media"></div>
    } @else if (recipe.value(); as r) {
      <section class="head">
        <nav class="breadcrumb" [attr.aria-label]="'recipe.breadcrumb' | transloco">
          <a [routerLink]="homeLink()">{{ 'recipe.breadcrumb' | transloco }}</a>
          <!-- U+FF0F fullwidth solidus, as drawn -->
          <span aria-hidden="true">／</span>
          <span>{{ r.title }}</span>
        </nav>

        <div class="title-row">
          <h1>{{ r.title }}</h1>
          @if (r.tags.length) {
            <div class="tags">
              @for (tag of r.tags; track tag.slug) {
                <bah-tag-chip [tag]="tag" />
              }
            </div>
          }
        </div>

        <div class="meta">
          <!--
            Interactive: the stars are how a visitor rates, not just how the
            average is drawn. Your own score wins over the average once given,
            so the control shows you what you said, not what the crowd said.
          -->
          <bah-star-rating
            [value]="rating().yourRating ?? rating().average"
            [interactive]="true"
            (rate)="onRate($event)"
          />
          <span>
            {{ 'recipe.ratingSummary' | transloco: { average: average() } }}
            ·
            {{ 'recipe.reviews' | transloco: { count: rating().count } }}
          </span>
          @if (rating().yourRating !== null) {
            <span class="thanks" role="status">{{ 'rating.thanks' | transloco }}</span>
          }
          <span aria-hidden="true">·</span>
          <span>{{ 'recipe.byAuthor' | transloco: { author: r.author.displayName } }}</span>
          <span aria-hidden="true">·</span>
          <time [attr.datetime]="r.publishedAt">{{ r.publishedAt | relativeTime }}</time>
        </div>

        <bah-share-bar [title]="r.title" />
      </section>

      <div class="row row--media">
        <bah-recipe-media
          [image]="r.image"
          [title]="r.title"
          [youtubeVideoId]="r.youtubeVideoId"
        />

        <aside class="card elev-sm description">
          <h2>{{ 'recipe.description' | transloco }}</h2>
          <bah-markdown class="body" [markdown]="r.bodyMarkdown" [html]="r.bodyHtml" />
          <bah-quick-facts
            [prepMinutes]="r.prepMinutes"
            [cookMinutes]="r.cookMinutes"
            [difficulty]="r.difficulty"
          />
        </aside>
      </div>

      <div class="row row--steps">
        <div class="steps">
          <h2>{{ 'recipe.steps' | transloco }}</h2>
          <bah-step-list
            [steps]="r.steps"
            [hasVideo]="r.youtubeVideoId !== null"
            (seek)="onSeek($event)"
          />
        </div>

        <bah-ingredient-panel
          [ingredients]="r.ingredients"
          [baseServings]="r.baseServings"
          [(servings)]="servings"
        />
      </div>

      <section class="social">
        @if (writeFailed()) {
          <p class="write-error" role="alert">{{ 'error.generic' | transloco }}</p>
        }

        <bah-reaction-bar
          [count]="reactions().count"
          [reacted]="reactions().reacted"
          [busy]="busy()"
          (react)="onReact($event)"
        />

        <bah-comment-section
          [comments]="comments.value() ?? []"
          [busy]="busy()"
          (post)="onPost($event)"
          (remove)="onRemove($event)"
        />
      </section>
    } @else {
      <section class="missing">
        <h1>{{ 'recipe.notFound' | transloco }}</h1>
        <a class="btn btn-primary" [routerLink]="homeLink()">
          {{ 'recipe.notFoundAction' | transloco }}
        </a>
      </section>
    }
  `,
  styles: `
    .head {
      padding: 36px 0 0;
    }

    .breadcrumb {
      font-size: 12px;
      opacity: 0.55;
      margin-bottom: 18px;
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    h1 {
      font-size: 42px;
      margin: 0;
      line-height: 1.05;
    }

    .tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      /* Nudged down so the chips sit on the h1's baseline rather than its box. */
      margin-top: 8px;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 14px 0 32px;
      opacity: 0.7;
      font-size: 14px;
      flex-wrap: wrap;
    }

    .row {
      display: flex;
      gap: 48px;
      flex-wrap: wrap;
    }

    .row--media {
      align-items: stretch;
      margin-top: 20px;
    }

    .row--steps {
      align-items: flex-start;
      margin-top: 44px;
    }

    .description {
      flex: 1 1 300px;
      min-width: 0;
      padding: 26px 24px 22px;
    }

    .description h2 {
      font-size: 22px;
      margin: 0 0 18px;
    }

    .description .body {
      opacity: 0.75;
      font-size: 14.5px;
      line-height: 1.7;
      flex: 1;
    }

    .steps {
      flex: 2 1 480px;
      min-width: 0;
    }

    .steps h2 {
      font-size: 22px;
      margin: 0 0 18px;
    }

    /* The divider and the generous gap are from the prototype: the social block
       is a separate concern from the recipe and is drawn as one. */
    .social {
      display: block;
      margin-top: 70px;
      padding-top: 34px;
      border-top: 1px solid var(--color-divider);
    }

    .thanks {
      color: var(--color-accent);
      opacity: 1;
    }

    .write-error {
      margin: 0 0 20px;
      text-align: center;
      font-size: 13.5px;
      color: var(--color-accent-800);
    }

    .missing {
      padding: 80px 0 60px;
    }

    .missing h1 {
      font-size: 34px;
      margin-bottom: 24px;
    }

    .skeleton {
      background: var(--color-surface);
      opacity: 0.55;
      border-radius: var(--radius-lg);
      animation: pulse 1.4s ease-in-out infinite;
    }

    .skeleton--title {
      height: 52px;
      width: min(520px, 80%);
      margin: 60px 0 28px;
    }

    .skeleton--media {
      height: 340px;
    }

    @keyframes pulse {
      50% {
        opacity: 0.3;
      }
    }

    @media (max-width: 900px) {
      .row {
        gap: 32px;
      }

      h1 {
        font-size: 34px;
      }
    }

    @media (max-width: 640px) {
      h1 {
        font-size: 28px;
      }

      .head {
        padding-top: 24px;
      }
    }
  `,
})
export class RecipeDetailPage {
  private readonly api = inject(RECIPE_API);
  private readonly social = inject(SOCIAL_API);
  private readonly localeService = inject(LocaleService);

  /** Bound from the route by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  private readonly media = viewChild(RecipeMediaComponent);

  protected readonly servings = signal(2);

  /** Blocks a second write while one is in flight, and drives disabled states. */
  protected readonly busy = signal(false);
  protected readonly writeFailed = signal(false);

  protected readonly homeLink = computed(() => this.localeService.link());

  protected readonly recipe = resource({
    params: () => ({ slug: this.slug(), locale: this.localeService.locale() }),
    loader: ({ params }) => this.api.bySlug(params.slug, params.locale),
  });

  protected readonly comments = resource({
    params: () => ({ slug: this.slug(), locale: this.localeService.locale() }),
    loader: ({ params }) => this.social.comments(params.slug, params.locale),
  });

  /**
   * Rating and reactions are held locally on top of what the recipe reported.
   *
   * Every write returns the recomputed state, so the alternative — refetching
   * the recipe — buys nothing and costs something real: the reload would refire
   * the servings effect below and silently throw away the count the visitor had
   * dialled in. Overlaying the response keeps the write local to what changed.
   */
  private readonly ratedOverride = signal<RatingSummary | null>(null);
  private readonly reactionOverride = signal<ReactionState | null>(null);

  private static readonly NO_RATING: RatingSummary = { average: 0, count: 0, yourRating: null };

  protected readonly rating = computed<RatingSummary>(
    () => this.ratedOverride() ?? this.recipe.value()?.rating ?? RecipeDetailPage.NO_RATING,
  );

  protected readonly reactions = computed<ReactionState>(
    () => this.reactionOverride() ?? this.recipe.value()?.reactions ?? { count: 0, reacted: false },
  );

  protected readonly average = computed(() => this.rating().average.toFixed(1));

  constructor() {
    // Reset to the recipe's own base count when a different recipe loads, so a
    // serving size chosen on one page does not silently carry to the next.
    effect(() => {
      const base = this.recipe.value()?.baseServings;
      if (base !== undefined) this.servings.set(clampServings(base));
    });

    // Drop the overlay when the route moves to another recipe, or the previous
    // recipe's rating would be shown against the new one until its own load
    // lands.
    effect(() => {
      this.slug();
      this.ratedOverride.set(null);
      this.reactionOverride.set(null);
    });
  }

  protected onSeek(seconds: number): void {
    this.media()?.seekTo(seconds);
  }

  protected onRate(stars: number): void {
    void this.write(async () => {
      this.ratedOverride.set(await this.social.rate(this.slug(), stars, this.locale()));
    });
  }

  protected onReact(reacted: boolean): void {
    void this.write(async () => {
      this.reactionOverride.set(await this.social.react(this.slug(), reacted, this.locale()));
    });
  }

  protected onPost(body: string): void {
    void this.write(async () => {
      await this.social.addComment(this.slug(), body, this.locale());
      this.comments.reload();
    });
  }

  protected onRemove(id: number): void {
    void this.write(async () => {
      await this.social.deleteComment(id);
      this.comments.reload();
    });
  }

  private locale() {
    return this.localeService.locale();
  }

  /**
   * One writer at a time, and a failure that stays on the page.
   *
   * Rethrowing would surface as an unhandled rejection, which the e2e fixture
   * treats as a failed test — a signal worth reserving for genuine breakage
   * rather than spending on a rating that did not save.
   */
  private async write(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;

    this.busy.set(true);
    this.writeFailed.set(false);

    try {
      await action();
    } catch {
      this.writeFailed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
