import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService } from '../../../core/i18n/locale.service';
import { UnitLabelPipe } from '../../../shared/pipes';
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  type ScaledMeasure,
  clampServings,
  scaleMeasure,
} from '../../../shared/scaling';
import type { Ingredient } from '../../../core/api/models';

@Component({
  selector: 'bah-ingredient-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, UnitLabelPipe],
  template: `
    <aside class="card elev-sm">
      <div class="head">
        <span class="portions">{{ 'recipe.servings' | transloco }}</span>

        <div class="stepper">
          <button
            type="button"
            [attr.aria-label]="'recipe.decreaseServings' | transloco"
            [disabled]="servings() <= MIN"
            (click)="step(-1)"
          >
            <!-- U+2212 minus sign, not a hyphen: it aligns with the plus. -->
            −
          </button>

          <output [attr.aria-label]="'recipe.servings' | transloco">{{ servings() }}</output>

          <button
            type="button"
            [attr.aria-label]="'recipe.increaseServings' | transloco"
            [disabled]="servings() >= MAX"
            (click)="step(1)"
          >
            +
          </button>
        </div>
      </div>

      <p class="hint">{{ 'recipe.servingsHint' | transloco }}</p>

      <ul>
        @for (ingredient of ingredients(); track ingredient.id) {
          <li>
            <span class="name">
              {{ ingredient.name }}
              @if (ingredient.note) {
                <span class="note">({{ ingredient.note }})</span>
              }
            </span>

            <span class="leader" aria-hidden="true"></span>

            <!--
              The unit comes from the scaled measure, not from the ingredient:
              scaling up can carry a quantity into a bigger unit, and reading
              ingredient.unit here would print "1.5 g".
            -->
            @if (amount(ingredient); as measure) {
              <span class="amount">{{ measure.value }} {{ measure.unit | unitLabel }}</span>
            }
          </li>
        }
      </ul>
    </aside>
  `,
  styles: `
    :host {
      display: block;
      flex: 1 1 300px;
      min-width: 0;
      /* Clears the sticky header, which is ~76px tall. */
      position: sticky;
      top: 96px;
    }

    .card {
      padding: 26px 24px 22px;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      gap: 12px;
    }

    .portions {
      font-size: 13.5px;
      opacity: 0.75;
    }

    .stepper {
      display: flex;
      align-items: center;
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-pill);
      overflow: hidden;
    }

    .stepper button {
      width: 32px;
      height: 32px;
      background: var(--color-bg);
      border: none;
      color: var(--color-text);
      font-size: 16px;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background-color 0.15s ease;
    }

    .stepper button:hover:not(:disabled) {
      background: var(--color-accent-100);
      color: var(--color-accent-800);
    }

    .stepper button:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    output {
      width: 32px;
      text-align: center;
      font-size: 14px;
      font-weight: 700;
    }

    .hint {
      font-size: 11.5px;
      color: var(--color-text-muted);
      margin: 4px 0 18px;
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    li {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 9px 0;
      font-size: 14px;
    }

    .name {
      white-space: nowrap;
    }

    .note {
      opacity: 0.55;
      font-size: 12.5px;
    }

    /* Leader dots, so the eye tracks from the name to the amount. */
    .leader {
      flex: 1;
      border-bottom: 1px dotted var(--color-divider);
      transform: translateY(-4px);
    }

    .amount {
      color: var(--color-accent-text);
      font-size: 13.5px;
      font-weight: 700;
      white-space: nowrap;
    }

    @media (max-width: 900px) {
      :host {
        position: static;
      }
    }
  `,
})
export class IngredientPanelComponent {
  private readonly locale = inject(LocaleService);

  protected readonly MIN = MIN_SERVINGS;
  protected readonly MAX = MAX_SERVINGS;

  readonly ingredients = input.required<readonly Ingredient[]>();
  readonly baseServings = input(2);

  readonly servings = model(2);

  protected step(delta: number): void {
    this.servings.set(clampServings(this.servings() + delta));
  }

  /**
   * Derived on every render rather than stored, so there is exactly one source
   * of truth for a quantity: the base amount and the current serving count.
   */
  protected amount(ingredient: Ingredient): ScaledMeasure | null {
    return scaleMeasure(
      ingredient.baseQuantity,
      this.baseServings(),
      this.servings(),
      ingredient.unit,
      this.locale.locale(),
      ingredient.scalable,
    );
  }
}
