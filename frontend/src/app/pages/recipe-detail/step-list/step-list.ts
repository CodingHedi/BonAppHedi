import { ChangeDetectionStrategy, Component, DOCUMENT, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DurationPipe, VideoTimestampPipe } from '../../../shared/pipes';
import { videoTimestamp } from '../../../shared/format';
import { selectionWithin } from '../../../shared/quote';
import { IconComponent } from '../../../core/icons/icon';
import type { Step } from '../../../core/api/models';

@Component({
  selector: 'bah-step-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DurationPipe, VideoTimestampPipe, IconComponent],
  template: `
    <ol>
      @for (step of steps(); track step.id; let i = $index) {
        <li [id]="'step-' + step.id">
          <span class="number" aria-hidden="true">{{ i + 1 }}</span>

          @if (step.durationMinutes !== null) {
            <span class="timer">{{ step.durationMinutes | duration }}</span>
          }

          <p>
            {{ step.body }}

            @if (hasVideo() && step.videoOffsetSeconds !== null) {
              <button
                type="button"
                class="timestamp"
                [attr.aria-label]="
                  'recipe.jumpToTime' | transloco: { time: label(step.videoOffsetSeconds) }
                "
                (click)="seek.emit(step.videoOffsetSeconds)"
              >
                ({{ step.videoOffsetSeconds | videoTimestamp }})
              </button>
            }
          </p>

          <!--
            Asking about a step is the reason this exists: "what does 'until it
            doubles' mean here" is a question about one instruction, and a comment
            that quotes it is answerable without guessing which step was meant.

            Offered only when there is somebody to ask as, and it quotes the
            selection when there is one inside this step — so highlighting five
            words asks about five words rather than the whole paragraph.
          -->
          @if (canQuote()) {
            <button
              type="button"
              class="btn btn-icon btn-secondary quote"
              [attr.aria-label]="'recipe.quoteStep' | transloco: { number: i + 1 }"
              [attr.title]="'recipe.quoteStep' | transloco: { number: i + 1 }"
              (click)="onQuote(step)"
            >
              <bah-icon name="quote" [size]="14" />
            </button>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 0;
      border-bottom: 1px dashed var(--color-divider);
    }

    li:last-child {
      border-bottom: none;
    }

    .number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1.5px solid var(--color-accent-300);
      display: grid;
      place-items: center;
      font-size: 15px;
      font-weight: 700;
      color: var(--color-accent-text);
      flex: none;
    }

    .timer {
      font-size: 12px;
      opacity: 0.6;
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      white-space: nowrap;
      flex: none;
      margin-top: 2px;
    }

    p {
      flex: 1;
      min-width: 0;
      font-size: 15px;
      line-height: 1.6;
      margin: 0;
    }

    /* Inline so it reads as part of the sentence rather than a separate control. */
    .timestamp {
      display: inline;
      background: none;
      border: none;
      padding: 0;
      margin: 0 0 0 2px;
      font-size: 13px;
      /* A button that reads as a link inside a sentence, so it takes the link
         colour rather than the fill. --color-accent put it at 3.13:1 in the
         dark theme, five of them per recipe. */
      color: var(--color-link);
      cursor: pointer;
    }

    .timestamp:hover {
      color: var(--color-link-hover);
      text-decoration: underline;
    }

    /* Quiet until the step is hovered or the button itself is focused, so a column
       of buttons does not compete with the instructions. Never hidden outright:
       display:none or visibility:hidden would take it out of the tab order and
       make the whole feature unreachable by keyboard. */
    .quote {
      flex: none;
      margin-top: 2px;
      opacity: 0;
      transition: opacity 120ms ease;
    }

    li:hover .quote,
    li:focus-within .quote,
    .quote:focus-visible {
      opacity: 1;
    }

    /* No hover on a touch screen, so there would be nothing to reveal it. */
    @media (hover: none) {
      .quote {
        opacity: 0.55;
      }
    }

    @media (max-width: 640px) {
      li {
        flex-wrap: wrap;
      }

      p {
        flex-basis: 100%;
      }
    }
  `,
})
export class StepListComponent {
  private readonly document = inject(DOCUMENT);

  readonly steps = input.required<readonly Step[]>();
  /** Timestamps are only offered when there is actually a video to jump into. */
  readonly hasVideo = input(false);
  /** Whether to offer the quote button, which needs somebody to ask as. */
  readonly canQuote = input(false);

  readonly seek = output<number>();
  readonly quote = output<string>();

  protected label(seconds: number): string {
    return videoTimestamp(seconds);
  }

  /**
   * The selection inside this step if there is one, and the whole step otherwise.
   *
   * Read here rather than in the parent because only this component knows which
   * element holds which step, and read synchronously because the click that got
   * here is a mousedown away from the selection being collapsed.
   */
  protected onQuote(step: Step): void {
    const element = this.document.getElementById(`step-${step.id}`);
    const view = this.document.defaultView;

    const selected = element && view ? selectionWithin(element, view) : null;
    this.quote.emit(selected ?? step.body);
  }
}
