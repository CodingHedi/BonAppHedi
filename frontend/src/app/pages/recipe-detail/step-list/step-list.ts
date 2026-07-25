import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DurationPipe, VideoTimestampPipe } from '../../../shared/pipes';
import { videoTimestamp } from '../../../shared/format';
import type { Step } from '../../../core/api/models';

@Component({
  selector: 'bah-step-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DurationPipe, VideoTimestampPipe],
  template: `
    <ol>
      @for (step of steps(); track step.id; let i = $index) {
        <li>
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
      color: var(--color-accent);
      cursor: pointer;
    }

    .timestamp:hover {
      color: var(--color-accent-600);
      text-decoration: underline;
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
  readonly steps = input.required<readonly Step[]>();
  /** Timestamps are only offered when there is actually a video to jump into. */
  readonly hasVideo = input(false);

  readonly seek = output<number>();

  protected label(seconds: number): string {
    return videoTimestamp(seconds);
  }
}
