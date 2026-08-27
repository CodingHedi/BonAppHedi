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
import { IconComponent } from '../../../core/icons/icon';
import { RecipePreviewComponent } from '../recipe-preview/recipe-preview';
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
 *
 * Beside the form is the recipe as it will be read — {@link RecipePreviewComponent},
 * built from the same working copy the inputs are bound to, so it moves on every
 * keystroke. Side by side rather than behind a "preview" button because the
 * things it catches are the things you only notice by comparison: a step that
 * reads as a wall of text, an ingredient whose quantity scales when it should
 * not, a description whose first line is the only one anybody will see.
 */
@Component({
  selector: 'bah-admin-recipe-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, IconComponent, RecipePreviewComponent],
  template: `
    @if (draft.isLoading()) {
      <p class="muted">{{ 'admin.loading' | transloco }}</p>
    } @else if (model(); as m) {
      <div class="bar">
        <button
          type="button"
          class="btn btn-secondary"
          [attr.aria-pressed]="showPreview()"
          (click)="showPreview.set(!showPreview())"
        >
          <bah-icon name="eye" [size]="14" />
          {{ 'admin.preview' | transloco }}
        </button>
      </div>

      <div class="split" [class.split--wide]="showPreview()">
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

            <!--
              The rendered markdown used to be repeated here, under the field.
              It is in the pane alongside now, in the card the site actually
              draws it in — the same sanitizing component and more of the
              truth, so a second copy here would only be one more thing to
              keep in step.
            -->
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

          <section class="shared">
            <h2>{{ 'admin.photo' | transloco }}</h2>
            <p class="muted hint">{{ 'admin.photoHint' | transloco }}</p>

            @if (isNew()) {
              <!--
              The upload is addressed by recipe key, so there is nothing to
              attach a photograph to until the recipe exists. Saying so beats
              offering a control that would 404.
            -->
              <p class="muted">{{ 'admin.photoAfterSave' | transloco }}</p>
            } @else {
              <div class="photo">
                @if (m.photo; as photo) {
                  <img
                    class="photo-preview"
                    [src]="photo.url"
                    alt=""
                    [style.background-color]="photo.dominant"
                  />
                  <p class="muted">{{ photo.width }}&times;{{ photo.height }}</p>
                } @else {
                  <p class="muted">{{ 'admin.photoNone' | transloco }}</p>
                }

                <div class="photo-actions">
                  <!--
                  A label rather than a button, because a file input cannot be
                  opened programmatically without a user gesture and does not
                  need to be: clicking its label is the gesture.
                -->
                  <label class="btn">
                    {{ (m.photo ? 'admin.photoReplace' : 'admin.photoChoose') | transloco }}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      [disabled]="photoBusy()"
                      (change)="choosePhoto($event)"
                    />
                  </label>

                  @if (m.photo) {
                    <button
                      type="button"
                      class="btn"
                      [disabled]="photoBusy()"
                      (click)="removePhoto()"
                    >
                      {{ 'admin.photoRemove' | transloco }}
                    </button>
                  }
                </div>

                @if (photoFailed()) {
                  <p class="error" role="alert">{{ 'admin.photoFailed' | transloco }}</p>
                }
              </div>
            }
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

        @if (showPreview()) {
          <aside class="pane" [attr.aria-label]="'admin.preview' | transloco">
            <div class="pane-head">
              <h2>{{ 'admin.preview' | transloco }}</h2>
              <p class="muted hint">{{ 'admin.previewHint' | transloco }}</p>
            </div>

            <div class="pane-body">
              <bah-admin-recipe-preview [draft]="m" [locale]="tab()" />
            </div>
          </aside>
        }
      </div>
    } @else {
      <p class="muted">{{ 'admin.notFound' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    form {
      max-width: 780px;
      min-width: 0;
    }

    .bar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 14px;
    }

    .bar .btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    /*
      One column until there is room for two, and the breakpoint is about the
      preview rather than about the form: below roughly 1240px the pane is
      narrow enough that the recipe page inside it collapses to its phone
      layout, which is a preview of a page nobody is going to read from this
      screen. Stacked, it is still the same rendering and still correct — just
      underneath instead of beside.
    */
    .split {
      display: grid;
      gap: 36px;
    }

    @media (min-width: 1240px) {
      .split--wide {
        grid-template-columns: minmax(0, 480px) minmax(0, 1fr);
        align-items: start;

        /*
          Deliberately wider than the site's own 1180px column.
          Side by side only earns its place if both halves are usable, and half
          of 1180 is not. The width is taken back from the viewport and the
          negative margin re-centres it, since the row is now wider than the
          .container it sits in.

          100vw is safe here despite the scrollbar: the 64px of gutter it gives
          back is four times the widest classic scrollbar, so the row can never
          be the thing that makes the document scroll sideways.
        */
        width: calc(100vw - 2 * var(--container-pad));
        max-width: 1720px;
        margin-left: calc(-1 * (min(100vw - 2 * var(--container-pad), 1720px) - 100%) / 2);
      }
    }

    /* Its own scroller, so a long form and a long recipe do not have to be
       read at the same scroll position. */
    .pane {
      position: sticky;
      top: 96px;
      min-width: 0;
      max-height: calc(100vh - 120px);
      overflow: auto;
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-lg);
      padding: 20px 24px 28px;
    }

    .pane-head {
      display: flex;
      align-items: baseline;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--color-divider);
    }

    .pane-head h2 {
      font-size: 15px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin: 0;
      opacity: 0.7;
    }

    .pane-head .hint {
      margin: 0;
    }

    @media (max-width: 1239px) {
      .pane {
        position: static;
        max-height: none;
        overflow: visible;
      }
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

    .photo {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: flex-start;
    }

    /*
      The 3:2 box the cards use, so what the editor shows is the shape the site
      will crop to rather than the shape the file happens to be. The tint under
      it is the stored dominant colour, which is what fills the box on the site
      while the bytes are in flight.
    */
    .photo-preview {
      width: 100%;
      max-width: 320px;
      aspect-ratio: 3 / 2;
      object-fit: cover;
      border-radius: var(--radius-md, 8px);
      border: 1px solid var(--color-divider);
    }

    .photo-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    /* A label doing a button's job still has to look and focus like one. */
    .photo-actions .btn {
      cursor: pointer;
    }

    .photo-actions .btn:focus-within {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
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

  /**
   * On by default: an author opening the editor wants to see the recipe, and a
   * preview that has to be asked for is one that gets looked at after the
   * mistake rather than before it. The toggle exists for the narrow screen,
   * where the pane sits under the form and is a long way to scroll past.
   */
  protected readonly showPreview = signal(true);

  /**
   * Separate from `busy`/`failed`, which belong to the save.
   *
   * An upload is not part of saving the form — it has already happened on the
   * server by the time it reports back — so sharing the flags would let a
   * refused photograph read as a failed save, and a successful one clear the
   * message from a save that really did fail.
   */
  protected readonly photoBusy = signal(false);
  protected readonly photoFailed = signal(false);

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

  protected setTranslation(
    field: 'title' | 'slug' | 'excerpt' | 'bodyMarkdown',
    value: string,
  ): void {
    const current = this.model();
    if (!current) return;

    const locale = this.tab();
    this.model.set({
      ...current,
      t: { ...current.t, [locale]: { ...current.t[locale], [field]: value } },
    });
  }

  protected patchIngredient(index: number, change: Partial<IngredientDraft>): void {
    this.mapIngredients((ingredient, i) =>
      i === index ? { ...ingredient, ...change } : ingredient,
    );
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

  protected async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const current = this.model();
    if (!file || !current || this.photoBusy()) return;

    this.photoBusy.set(true);
    this.photoFailed.set(false);

    try {
      const photo = await this.api.uploadPhoto(current.key, file);

      // Re-read rather than closing over `current`: the form is editable while
      // the upload is in flight, and writing back the copy taken before it
      // would silently undo whatever was typed in the meantime.
      const latest = this.model();
      if (latest) this.model.set({ ...latest, photo });
    } catch {
      this.photoFailed.set(true);
    } finally {
      this.photoBusy.set(false);

      // Cleared so that choosing the same file again still fires `change`. A
      // file input compares against its current value, so the second attempt
      // after a failure would otherwise do nothing at all.
      input.value = '';
    }
  }

  protected async removePhoto(): Promise<void> {
    const current = this.model();
    if (!current || this.photoBusy()) return;

    this.photoBusy.set(true);
    this.photoFailed.set(false);

    try {
      await this.api.removePhoto(current.key);
      const latest = this.model();
      if (latest) this.model.set({ ...latest, photo: null });
    } catch {
      this.photoFailed.set(true);
    } finally {
      this.photoBusy.set(false);
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
