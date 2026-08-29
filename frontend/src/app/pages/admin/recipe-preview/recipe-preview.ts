import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownComponent } from '../../../shared/ui/markdown/markdown';
import { QuickFactsComponent } from '../../recipe-detail/quick-facts/quick-facts';
import { RecipeMediaComponent } from '../../recipe-detail/recipe-media/recipe-media';
import { StepListComponent } from '../../recipe-detail/step-list/step-list';
import { IngredientPanelComponent } from '../../recipe-detail/ingredient-panel/ingredient-panel';
import { clampServings } from '../../../shared/scaling';
import type { Locale } from '../../../core/i18n/locale';
import type { ImageRef, Ingredient, RecipeDraft, Step } from '../../../core/api/models';

/**
 * The recipe as a visitor will read it, drawn from the draft being edited.
 *
 * Every part of it is the public page's own component — the media facade, the
 * quick facts, the step list, the ingredient panel, the sanitizing markdown
 * renderer. That is the point: a preview written as a second, simpler rendering
 * of the same data is a preview that can be right while the page is wrong,
 * which makes it worse than none.
 *
 * What it leaves out is everything a recipe *accumulates* rather than has
 * authored: the rating, the author line, the publication date, the reactions
 * and the comment thread. None of them is in {@link RecipeDraft} — it has no
 * rating fields precisely so that a save cannot overwrite them — so drawing
 * them here would mean inventing numbers, and "0 / 5 · 0 reviews" under a
 * recipe with fifty ratings is a lie told confidently. Tags go the same way:
 * the draft carries their keys and not their labels, and a chip reading
 * `dessert-rapide` is not what the page shows.
 */
@Component({
  selector: 'bah-admin-recipe-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoPipe,
    MarkdownComponent,
    QuickFactsComponent,
    RecipeMediaComponent,
    StepListComponent,
    IngredientPanelComponent,
  ],
  template: `
    <section class="page" [attr.lang]="locale()">
      <nav class="breadcrumb" aria-hidden="true">
        <span>{{ 'recipe.breadcrumb' | transloco }}</span>
        <!-- U+FF0F fullwidth solidus, as drawn -->
        <span>／</span>
        <span>{{ title() || ('admin.previewUntitled' | transloco) }}</span>
      </nav>

      <h2 class="title" [class.untitled]="!title()">
        {{ title() || ('admin.previewUntitled' | transloco) }}
      </h2>

      <div class="row row--media">
        <bah-recipe-media [image]="image()" [title]="title()" [youtubeVideoId]="videoId()" />

        <div class="side">
          <aside class="card elev-sm description">
            <h3>{{ 'recipe.description' | transloco }}</h3>
            <bah-markdown class="body" [markdown]="t().bodyMarkdown" />
            <bah-quick-facts
              [prepMinutes]="draft().prepMinutes"
              [cookMinutes]="draft().cookMinutes"
              [difficulty]="draft().difficulty"
            />
          </aside>
        </div>
      </div>

      <div class="row row--steps">
        <div class="steps">
          <h3>{{ 'recipe.steps' | transloco }}</h3>
          @if (steps().length) {
            <bah-step-list [steps]="steps()" [hasVideo]="videoId() !== null" />
          } @else {
            <p class="empty">{{ 'admin.previewNoSteps' | transloco }}</p>
          }
        </div>

        @if (ingredients().length) {
          <bah-ingredient-panel
            [ingredients]="ingredients()"
            [baseServings]="draft().baseServings"
            [(servings)]="servings"
          />
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    /*
      A copy of the recipe page's own layout rules, and the duplication is the
      price of the preview not being that page: those rules are scoped to
      bah-recipe-detail-page and cannot be reached from here. Only the frame is
      restated — every child carries its own appearance, which is what keeps the
      two from drifting where it would actually show.
    */
    .row {
      display: flex;
      gap: 32px;
      flex-wrap: wrap;
    }

    .row--media {
      align-items: stretch;
    }

    .row--steps {
      align-items: flex-start;
      margin-top: 36px;
    }

    .side {
      flex: 1 1 280px;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .description {
      flex: 1;
      min-width: 0;
      padding: 22px 20px 20px;
    }

    .description h3 {
      font-size: 20px;
      margin: 0 0 16px;
    }

    .description .body {
      opacity: 0.75;
      font-size: 14.5px;
      line-height: 1.7;
      flex: 1;
    }

    .steps {
      flex: 2 1 400px;
      min-width: 0;
    }

    .steps h3 {
      font-size: 20px;
      margin: 0 0 14px;
    }

    .breadcrumb {
      font-size: 12px;
      opacity: 0.55;
      margin-bottom: 14px;
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .title {
      font-size: 34px;
      line-height: 1.05;
      margin: 0 0 24px;
    }

    /* An unnamed recipe still occupies the space its name will, or the whole
       preview jumps on the first character typed. */
    .untitled {
      color: var(--color-text-muted);
      font-style: italic;
    }

    .empty {
      font-size: 13.5px;
      color: var(--color-text-muted);
      margin: 0;
    }

    /*
      The panel is sticky on the real page, where it tracks a whole scrolling
      document. Here it sits in a pane that scrolls itself, so sticky would pin
      it to the wrong thing and leave it hanging over the steps.
    */
    bah-ingredient-panel {
      position: static;
    }
  `,
})
export class RecipePreviewComponent {
  readonly draft = input.required<RecipeDraft>();
  /** Which locale tab the editor is on, so the preview shows the same one. */
  readonly locale = input.required<Locale>();

  protected readonly servings = signal(2);

  protected readonly t = computed(() => this.draft().t[this.locale()]);

  protected readonly title = computed(() => this.t().title.trim());

  /** Empty string is falsy, so `||` is the point rather than a slip. */
  protected readonly videoId = computed(() => this.draft().youtubeVideoId || null);

  protected readonly image = computed<ImageRef>(() => {
    const photo = this.draft().photo;
    const alt = this.title();

    return photo
      ? { url: photo.url, alt, width: photo.width, height: photo.height, dominant: photo.dominant }
      : { url: null, alt };
  });

  /**
   * Rows with nothing written in them are dropped, in both lists.
   *
   * A blank ingredient is what the editor opens with and what "add a row"
   * produces, so keeping them would put an empty bullet and a stray "200 g"
   * into the preview of every recipe being started — noise that reads as a
   * rendering fault rather than as a field nobody has filled in yet.
   */
  protected readonly ingredients = computed<readonly Ingredient[]>(() => {
    const locale = this.locale();

    return this.draft()
      .ingredients.map((row, index) => ({
        id: index,
        position: index + 1,
        name: row.t[locale].name,
        baseQuantity: row.baseQuantity,
        unit: row.unit,
        note: row.t[locale].note,
        scalable: row.scalable,
      }))
      .filter((row) => row.name.trim().length > 0);
  });

  protected readonly steps = computed<readonly Step[]>(() => {
    const locale = this.locale();

    return this.draft()
      .steps.map((row, index) => ({
        id: index,
        position: index + 1,
        body: row.t[locale].body,
        durationMinutes: row.durationMinutes,
        videoOffsetSeconds: row.videoOffsetSeconds,
      }))
      .filter((row) => row.body.trim().length > 0);
  });

  constructor() {
    /*
     * Track the servings field while it is being edited, the same way the real
     * page starts from whatever the recipe stores. Without it the panel keeps
     * scaling against the count it was created with, and every quantity in the
     * preview is quietly wrong the moment that field is changed.
     */
    effect(() => this.servings.set(clampServings(this.draft().baseServings)));
  }
}
