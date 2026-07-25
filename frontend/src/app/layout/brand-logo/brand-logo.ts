import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The wordmark, transcribed from the prototype's inline SVG.
 *
 * SVG <text> rather than styled HTML because the two lines must keep their exact
 * baselines and relative sizes regardless of the surrounding layout, and because
 * it scales to any header height from one `height` input.
 */
@Component({
  selector: 'bah-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 90 50"
      [attr.width]="width()"
      [attr.height]="height()"
      role="img"
      aria-label="Bon App' Hédi"
    >
      <text x="0" y="16" font-size="18" class="line line--top">BonApp'</text>
      <text x="0" y="47" font-size="34" class="line line--bottom">Hedi</text>
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
    }

    .line {
      font-family: var(--font-logo);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .line--top {
      fill: var(--color-text);
    }

    .line--bottom {
      fill: var(--color-accent);
    }
  `,
})
export class BrandLogoComponent {
  readonly height = input(50);
  protected readonly width = computed(() => (this.height() * 90) / 50);
}
