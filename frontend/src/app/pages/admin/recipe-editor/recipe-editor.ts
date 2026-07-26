import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ADMIN_API } from '../../../core/api/admin-api';
import { LocaleService } from '../../../core/i18n/locale.service';
import { LOCALES, type Locale } from '../../../core/i18n/locale';
import { MarkdownComponent } from '../../../shared/ui/markdown/markdown';
import { IconComponent } from '../../../core/icons/icon';
import type { IngredientDraft, RecipeDraft, StepDraft } from '../../../core/api/models';

/**
 * Authoring one recipe in both languages.
 *
 * The locale tabs are the whole design. A recipe is one thing with two
 * translations, not two recipes — quantities, timings, difficulty and the video
 * are shared, and only the words change. So the shared fields sit outside the
 * tabs and are edited once, while the tabs swap just the prose. Editing French
 * and English as separate documents is exactly how the two drift apart.
 *
 * Ingredients and steps are per-row bilingual for the same reason: the quantity
 * belongs to the row, the name belongs to the language.
 */
@Component({
  selector: 'bah-admin-recipe-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, MarkdownComponent, IconComponent],
  template: `
    @if (draft.isLoading()) {
      <p class="muted">{{ 'admin.loading' | transloco }}</p>
    } @else if (model(); as m) {
      <form (ngSubmit)="save()">
        <div class="tabs" role="tablist" [attr.aria-label]="'admin.language' | transloco">
          @for (locale of LOCALES; track locale) {
            <button
              type="button"
              role="tab"
              class="tab"
              [id]="'locale-tab-' + locale"
              [class.active]="tab() === locale"
              [attr.aria-selected]="tab() === locale"
              [tabindex]="tab() === locale ? 0 : -1"
              (click)="tab.set(locale)"
              (keydown)="onTabKeydown($event)"
            >
              {{ locale.toUpperCase() }}
              @if (!m.t[locale].title) {
                <span class="dot" [attr.title]="'admin.untranslated' | transloco">•</span>
              }
            </button>
          }
        </div>

        <section role="tabpanel" [attr.aria-labelledby]="'locale-tab-' + tab()" class="panel">
          <label>
            {{ 'admin.fieldTitle' | transloco }}
            <input
              class="input"
              [ngModel]="m.t[tab()].title"
              (ngModelChange)="setTranslation('title', $event)"
              [ngModelOptions]="{ standalone: true }"
            />
          </label>

          <label>
            {{ 'admin.fieldSlug' | transloco }}
            <input
              class="input"
              [ngModel]="m.t[tab()].slug"
              (ngModelChange)="setTranslation('slug', $event)"
              [ngModelOptions]="{ standalone: true }"
            />
          </label>

          <label>
            {{ 'admin.fieldExcerpt' | transloco }}
            <textarea
              class="input"
              rows="2"
              [ngModel]="m.t[tab()].excerpt"
              (ngModelChange)="setTranslation('excerpt', $event)"
              [ngModelOptions]="{ standalone: true }"
            ></textarea>
          </label>

          <label>
            {{ 'admin.fieldBody' | transloco }}
            <textarea
              class="input"
              rows="6"
              [ngModel]="m.t[tab()].bodyMarkdown"
              (ngModelChange)="setTranslation('bodyMarkdown', $event)"
              [ngModelOptions]="{ standalone: true }"
            ></textarea>
          </label>

          <!-- Same sanitizing component the site renders with, so what is
               previewed here is what a visitor gets. -->
          <div class="preview">
            <span class="muted">{{ 'comments.preview' | transloco }}</span>
            <bah-markdown [markdown]="m.t[tab()].bodyMarkdown" />
          </div>
        </section>

        <section class="shared">
          <h2>{{ 'admin.shared' | transloco }}</h2>
          <p class="muted hint">{{ 'admin.sharedHint' | transloco }}</p>

          <div class="grid">
            <label>
              {{ 'admin.fieldKey' | transloco }}
              <input
                class="input"
                [ngModel]="m.key"
                (ngModelChange)="patch({ key: $event })"
                [ngModelOptions]="{ standalone: true }"
                [readonly]="!isNew()"
              />
            </label>

            <label>
              {{ 'recipe.prepTime' | transloco }}
              <input
                class="input"
                type="number"
                min="0"
                [ngModel]="m.prepMinutes"
                (ngModelChange)="patch({ prepMinutes: number($event) })"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>

            <label>
              {{ 'recipe.cookTime' | transloco }}
              <input
                class="input"
                type="number"
                min="0"
                [ngModel]="m.cookMinutes"
                (ngModelChange)="patch({ cookMinutes: number($event) })"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>

            <label>
              {{ 'recipe.difficulty' | transloco }}
              <select
                class="input"
                [ngModel]="m.difficulty"
                (ngModelChange)="setDifficulty($event)"
                [ngModelOptions]="{ standalone: true }"
              >
                <option [value]="1">{{ 'recipe.difficultyEasy' | transloco }}</option>
                <option [value]="2">{{ 'recipe.difficultyMedium' | transloco }}</option>
                <option [value]="3">{{ 'recipe.difficultyHard' | transloco }}</option>
              </select>
            </label>

            <label>
              {{ 'recipe.servings' | transloco }}
              <input
                class="input"
                type="number"
                min="1"
                [ngModel]="m.baseServings"
                (ngModelChange)="patch({ baseServings: +$event || 1 })"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>

            <label>
              {{ 'admin.fieldVideo' | transloco }}
              <input
                class="input"
                [ngModel]="m.youtubeVideoId"
                (ngModelChange)="patch({ youtubeVideoId: $event || null })"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>
          </div>
        </section>

        <section class="rows">
          <h2>{{ 'recipe.ingredients' | transloco }}</h2>
          @for (ingredient of m.ingredients; track $index) {
            <div class="row">
              <input
                class="input qty"
                type="number"
                [attr.aria-label]="'admin.quantity' | transloco"
                [ngModel]="ingredient.baseQuantity"
                (ngModelChange)="patchIngredient($index, { baseQuantity: number($event) })"
                [ngModelOptions]="{ standalone: true }"
              />
              <input
                class="input unit"
                [attr.aria-label]="'admin.unit' | transloco"
                [ngModel]="ingredient.unit"
                (ngModelChange)="patchIngredient($index, { unit: $event })"
                [ngModelOptions]="{ standalone: true }"
              />
              <input
                class="input"
                [attr.aria-label]="'admin.ingredientName' | transloco"
                [ngModel]="ingredient.t[tab()].name"
                (ngModelChange)="patchIngredientName($index, $event)"
                [ngModelOptions]="{ standalone: true }"
              />
              <button
                type="button"
                class="btn btn-icon btn-secondary"
                [attr.aria-label]="'admin.removeRow' | transloco"
                (click)="removeIngredient($index)"
              >
                <bah-icon name="trash" [size]="14" />
              </button>
            </div>
          }
          <button type="button" class="btn btn-secondary" (click)="addIngredient()">
            {{ 'admin.addIngredient' | transloco }}
          </button>
        </section>

        <section class="rows">
          <h2>{{ 'recipe.steps' | transloco }}</h2>
          @for (step of m.steps; track $index) {
            <div class="row row--step">
              <textarea
                class="input"
                rows="2"
                [attr.aria-label]="'admin.stepBody' | transloco"
                [ngModel]="step.t[tab()].body"
                (ngModelChange)="patchStepBody($index, $event)"
                [ngModelOptions]="{ standalone: true }"
              ></textarea>
              <input
                class="input qty"
                type="number"
                [attr.aria-label]="'admin.stepOffset' | transloco"
                [ngModel]="step.videoOffsetSeconds"
                (ngModelChange)="patchStep($index, { videoOffsetSeconds: number($event) })"
                [ngModelOptions]="{ standalone: true }"
              />
              <button
                type="button"
                class="btn btn-icon btn-secondary"
                [attr.aria-label]="'admin.removeRow' | transloco"
                (click)="removeStep($index)"
              >
                <bah-icon name="trash" [size]="14" />
              </button>
            </div>
          }
          <button type="button" class="btn btn-secondary" (click)="addStep()">
            {{ 'admin.addStep' | transloco }}
          </button>
        </section>

        <div class="foot">
          @if (failed()) {
            <p class="error" role="alert">{{ 'admin.saveFailed' | transloco }}</p>
          }
          @if (saved()) {
            <p class="ok" role="status">{{ 'admin.saved' | transloco }}</p>
          }
          <button type="submit" class="btn btn-primary" [disabled]="busy() || !canSave()">
            {{ 'admin.save' | transloco }}
          </button>
        </div>
      </form>
    } @else {
      <p class="muted">{{ 'admin.notFound' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 780px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid var(--color-divider);
      margin-bottom: 22px;
    }

    .tab {
      padding: 10px 18px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: inherit;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      opacity: 0.55;
      cursor: pointer;
    }

    .tab.active {
      opacity: 1;
      color: var(--color-accent);
      border-bottom-color: var(--color-accent);
    }

    /* A language with no title yet is the thing worth seeing from the other
       tab, so the marker lives on the tab itself. */
    .dot {
      color: var(--color-accent);
      margin-left: 4px;
    }

    label {
      display: block;
      font-size: 12.5px;
      opacity: 0.7;
      margin-bottom: 16px;
    }

    .input {
      display: block;
      width: 100%;
      margin-top: 6px;
      font: inherit;
      font-size: 14px;
      opacity: 1;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0 18px;
    }

    h2 {
      font-size: 18px;
      margin: 32px 0 6px;
    }

    .hint {
      margin: 0 0 18px;
      font-size: 12.5px;
    }

    .preview {
      border-top: 1px solid var(--color-divider);
      padding-top: 14px;
      font-size: 14px;
    }

    .row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 10px;
    }

    .row .input {
      margin-top: 0;
    }

    .qty {
      max-width: 100px;
      flex: none;
    }

    .unit {
      max-width: 90px;
      flex: none;
    }

    .row .input:not(.qty):not(.unit) {
      flex: 1;
    }

    .foot {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 14px;
      margin-top: 34px;
      padding-top: 20px;
      border-top: 1px solid var(--color-divider);
    }

    .error {
      margin: 0;
      font-size: 13px;
      color: var(--color-accent-800);
    }

    .ok {
      margin: 0;
      font-size: 13px;
      color: var(--color-accent);
    }

    .muted {
      opacity: 0.55;
    }

    @media (max-width: 640px) {
      .row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class RecipeEditorComponent {
  private readonly api = inject(ADMIN_API);
  private readonly localeService = inject(LocaleService);
  private readonly router = inject(Router);

  /** Bound from the route. Absent on `/admin/recipes/new`. */
  readonly key = input<string | undefined>(undefined);

  protected readonly LOCALES = LOCALES;
  protected readonly tab = signal<Locale>(this.localeService.locale());

  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly saved = signal(false);

  protected readonly isNew = computed(() => this.key() === undefined);

  protected readonly draft = resource({
    params: () => ({ key: this.key() }),
    loader: ({ params }) => (params.key ? this.api.draft(params.key) : this.api.blank()),
  });

  /**
   * The form's working copy.
   *
   * Separate from the resource because it is edited: binding inputs straight to
   * `draft.value()` would mean every keystroke fought whatever the loader last
   * returned, and a reload would silently discard unsaved work.
   */
  protected readonly model = signal<RecipeDraft | null>(null);

  protected readonly canSave = computed(() => Boolean(this.model()?.key.trim()));

  constructor() {
    effect(() => {
      const loaded = this.draft.value();
      if (loaded !== undefined) this.model.set(loaded ? structuredClone(loaded) : null);
    });
  }

  protected number(value: unknown): number | null {
    const parsed = Number(value);
    return value === '' || value === null || Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * A <select> hands back a string, and Difficulty is 1 | 2 | 3 rather than
   * number. Narrowing here keeps the union honest instead of casting it away —
   * anything unexpected falls back to the easiest level rather than storing a
   * value the rest of the app cannot render.
   */
  protected setDifficulty(value: unknown): void {
    const parsed = Number(value);
    this.patch({ difficulty: parsed === 2 || parsed === 3 ? parsed : 1 });
  }

  protected patch(change: Partial<RecipeDraft>): void {
    const current = this.model();
    if (current) this.model.set({ ...current, ...change });
  }

  protected setTranslation(field: 'title' | 'slug' | 'excerpt' | 'bodyMarkdown', value: string): void {
    const current = this.model();
    if (!current) return;

    const locale = this.tab();
    this.model.set({
      ...current,
      t: { ...current.t, [locale]: { ...current.t[locale], [field]: value } },
    });
  }

  protected patchIngredient(index: number, change: Partial<IngredientDraft>): void {
    this.mapIngredients((ingredient, i) => (i === index ? { ...ingredient, ...change } : ingredient));
  }

  protected patchIngredientName(index: number, name: string): void {
    const locale = this.tab();
    this.mapIngredients((ingredient, i) =>
      i === index
        ? { ...ingredient, t: { ...ingredient.t, [locale]: { ...ingredient.t[locale], name } } }
        : ingredient,
    );
  }

  protected addIngredient(): void {
    const current = this.model();
    if (!current) return;

    this.model.set({
      ...current,
      ingredients: [
        ...current.ingredients,
        {
          baseQuantity: null,
          unit: 'g',
          scalable: true,
          t: this.blankPerLocale(() => ({ name: '', note: null })),
        },
      ],
    });
  }

  protected removeIngredient(index: number): void {
    const current = this.model();
    if (current) {
      this.model.set({
        ...current,
        ingredients: current.ingredients.filter((_, i) => i !== index),
      });
    }
  }

  protected patchStep(index: number, change: Partial<StepDraft>): void {
    this.mapSteps((step, i) => (i === index ? { ...step, ...change } : step));
  }

  protected patchStepBody(index: number, body: string): void {
    const locale = this.tab();
    this.mapSteps((step, i) =>
      i === index ? { ...step, t: { ...step.t, [locale]: { body } } } : step,
    );
  }

  protected addStep(): void {
    const current = this.model();
    if (!current) return;

    this.model.set({
      ...current,
      steps: [
        ...current.steps,
        {
          durationMinutes: null,
          videoOffsetSeconds: null,
          t: this.blankPerLocale(() => ({ body: '' })),
        },
      ],
    });
  }

  protected removeStep(index: number): void {
    const current = this.model();
    if (current) {
      this.model.set({ ...current, steps: current.steps.filter((_, i) => i !== index) });
    }
  }

  protected onTabKeydown(event: KeyboardEvent): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const next = LOCALES[(LOCALES.indexOf(this.tab()) + delta + LOCALES.length) % LOCALES.length];
    this.tab.set(next);

    const list = (event.target as HTMLElement).parentElement;
    list?.querySelector<HTMLElement>(`#locale-tab-${next}`)?.focus();
  }

  protected async save(): Promise<void> {
    const current = this.model();
    if (!current || this.busy() || !this.canSave()) return;

    this.busy.set(true);
    this.failed.set(false);
    this.saved.set(false);

    try {
      await this.api.save(current);
      this.saved.set(true);

      // A new recipe moves to its own URL once it has one, so a reload lands on
      // the recipe rather than back on an empty form.
      if (this.isNew()) {
        const base = this.localeService.link([this.localeService.segment('admin')]);
        await this.router.navigate([...base, 'recipes', current.key]);
      }
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private blankPerLocale<T>(make: () => T): Record<Locale, T> {
    return Object.fromEntries(LOCALES.map((locale) => [locale, make()])) as Record<Locale, T>;
  }

  private mapIngredients(map: (row: IngredientDraft, index: number) => IngredientDraft): void {
    const current = this.model();
    if (current) this.model.set({ ...current, ingredients: current.ingredients.map(map) });
  }

  private mapSteps(map: (row: StepDraft, index: number) => StepDraft): void {
    const current = this.model();
    if (current) this.model.set({ ...current, steps: current.steps.map(map) });
  }
}
