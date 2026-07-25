import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Five stars, in two modes.
 *
 * Display mode is decorative: the numeric rating is stated in text right next
 * to it, so the stars are marked aria-hidden rather than announced twice.
 *
 * Interactive mode is a radiogroup — the correct role for "pick exactly one of
 * five" — with real focusable radios and arrow-key support, so it is usable
 * without a mouse.
 */
@Component({
  selector: 'bah-star-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (interactive()) {
      <div
        class="stars"
        role="radiogroup"
        [attr.aria-label]="'rating.label' | transloco"
        (mouseleave)="hovered.set(0)"
      >
        @for (star of STARS; track star) {
          <button
            type="button"
            role="radio"
            class="star star--button"
            [attr.aria-checked]="value() === star"
            [attr.aria-label]="'rating.star' | transloco: { count: star }"
            [tabindex]="tabIndexFor(star)"
            (click)="rate.emit(star)"
            (mouseenter)="hovered.set(star)"
            (focus)="hovered.set(star)"
            (blur)="hovered.set(0)"
            (keydown)="onKeydown($event, star)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <polygon
                points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9"
                [attr.fill]="isLit(star) ? 'var(--color-accent)' : 'none'"
                [attr.stroke]="isLit(star) ? 'var(--color-accent)' : 'currentColor'"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        }
      </div>
    } @else {
      <div class="stars" aria-hidden="true">
        @for (star of STARS; track star) {
          <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
            <polygon
              points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9"
              [attr.fill]="star <= rounded() ? 'var(--color-accent)' : 'none'"
              [attr.stroke]="star <= rounded() ? 'var(--color-accent)' : 'currentColor'"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .stars {
      display: flex;
      gap: 2px;
      align-items: center;
    }

    .star--button {
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
      display: inline-flex;
      border-radius: 4px;
      transition: transform 0.12s ease;
    }

    .star--button:hover {
      transform: scale(1.12);
    }
  `,
})
export class StarRatingComponent {
  protected readonly STARS = [1, 2, 3, 4, 5] as const;

  readonly value = input(0);
  readonly interactive = input(false);
  readonly size = input(16);

  readonly rate = output<number>();

  protected readonly hovered = signal(0);

  protected readonly rounded = computed(() => Math.round(this.value()));

  /** In interactive mode, hovering previews the rating you are about to give. */
  protected isLit(star: number): boolean {
    const preview = this.hovered();
    return star <= (preview || this.value());
  }

  /**
   * A radiogroup is one tab stop, not five: Tab reaches the group, then arrow
   * keys move within it. With nothing selected yet the first star takes the
   * stop, otherwise the selected one does.
   */
  protected tabIndexFor(star: number): number {
    const current = this.value();
    return star === (current || 1) ? 0 : -1;
  }

  protected onKeydown(event: KeyboardEvent, star: number): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;

    if (delta === 0) return;

    event.preventDefault();
    const next = Math.min(5, Math.max(1, star + delta));
    this.rate.emit(next);

    // Move focus with the selection, or the arrow keys stop working after one
    // press because focus is still on the old star.
    const group = (event.target as HTMLElement).parentElement;
    (group?.children[next - 1] as HTMLElement | undefined)?.focus();
  }
}
