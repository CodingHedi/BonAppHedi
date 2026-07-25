import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { inject } from '@angular/core';
import { DurationPipe } from '../../../shared/pipes';
import type { Difficulty } from '../../../core/api/models';

/**
 * The three-column strip under the description: prep time, cook time, and
 * difficulty as dots.
 *
 * The dots are a graphic, so the accessible name spells the level out in words
 * — "Difficulté : facile" — rather than leaving a screen reader to announce
 * three decorative circles.
 */
@Component({
  selector: 'bah-quick-facts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DurationPipe],
  template: `
    <div class="facts">
      <div class="fact">
        <span class="value">{{ prepMinutes() | duration }}</span>
        <span class="label">{{ 'recipe.prepTime' | transloco }}</span>
      </div>

      <div class="fact">
        <span class="value">{{ cookMinutes() ? (cookMinutes() | duration) : '—' }}</span>
        <span class="label">{{ 'recipe.cookTime' | transloco }}</span>
      </div>

      <div class="fact">
        <span class="value dots" [attr.aria-label]="difficultyLabel()">
          @for (level of LEVELS; track level) {
            <span class="dot" [class.dot--on]="level <= difficulty()"></span>
          }
        </span>
        <span class="label">{{ 'recipe.difficulty' | transloco }}</span>
      </div>
    </div>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid var(--color-divider);
    }

    .fact {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    /* Hairline separators between the columns, not around them. */
    .fact:not(:first-child) {
      border-left: 1px solid var(--color-divider);
      padding-left: 14px;
    }

    .value {
      font-size: 16px;
      color: var(--color-accent-text);
      font-weight: 700;
      min-height: 1.2em;
      display: flex;
      align-items: center;
    }

    .label {
      font-size: 11.5px;
      opacity: 0.6;
    }

    .dots {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-divider);
    }

    .dot--on {
      background: var(--color-accent);
    }
  `,
})
export class QuickFactsComponent {
  private readonly transloco = inject(TranslocoService);

  protected readonly LEVELS = [1, 2, 3] as const;

  readonly prepMinutes = input<number | null>(null);
  readonly cookMinutes = input<number | null>(null);
  readonly difficulty = input<Difficulty>(1);

  protected readonly difficultyLabel = computed(() => {
    const key = (['recipe.difficultyEasy', 'recipe.difficultyMedium', 'recipe.difficultyHard'] as const)[
      this.difficulty() - 1
    ];
    return this.transloco.translate('recipe.difficultyLevel', {
      level: this.transloco.translate(key),
    });
  });
}
