import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';

/**
 * "🙂 0 réaction" from the prototype, as a real control.
 *
 * The emoji is replaced by the heart icon for the reason recorded in the icon
 * registry: an emoji renders differently on every platform and cannot inherit
 * the accent colour when it becomes active.
 *
 * Anyone may react — this is the one piece of social feedback that does not
 * require signing in, because it costs nothing to give and nothing to moderate.
 */
@Component({
  selector: 'bah-reaction-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, IconComponent],
  template: `
    <div class="reactions">
      <button
        type="button"
        class="btn btn-icon btn-secondary"
        [class.reacted]="reacted()"
        [attr.aria-label]="'reactions.react' | transloco"
        [attr.aria-pressed]="reacted()"
        [disabled]="busy()"
        (click)="react.emit(!reacted())"
      >
        <bah-icon name="heart" [size]="18" />
      </button>

      <!-- aria-live so the new total is announced: the number changing is the
           only feedback that the press did anything. -->
      <span aria-live="polite">{{ 'reactions.count' | transloco: { count: count() } }}</span>
    </div>
  `,
  styles: `
    .reactions {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      opacity: 0.6;
      font-size: 13.5px;
    }

    .reacted {
      color: var(--color-accent);
      border-color: var(--color-accent);
    }

    /*
     * Filled rather than outlined once given, so the state reads at a glance and
     * not only from the count beside it.
     *
     * ::ng-deep is required, not stylistic: the icon carries fill="none" as a
     * presentation attribute inside its own view, and a presentation attribute
     * beats inheritance — so setting fill on the host has no effect and the
     * rule has to land on the svg itself.
     */
    .reacted ::ng-deep svg {
      fill: currentColor;
    }
  `,
})
export class ReactionBarComponent {
  readonly count = input(0);
  readonly reacted = input(false);
  readonly busy = input(false);

  /**
   * Not named `toggle`: that is a native DOM event (on <details>), so an output
   * of that name would be ambiguous with a real one bubbling up.
   */
  readonly react = output<boolean>();
}
