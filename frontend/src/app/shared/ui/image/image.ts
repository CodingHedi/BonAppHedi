import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IconComponent } from '../../../core/icons/icon';
import type { ImageRef } from '../../../core/api/models';

/**
 * An image that has an honest empty state.
 *
 * No photography exists for this site yet, so the placeholder is not a
 * temporary inconvenience — it is what every visitor currently sees. It has to
 * look deliberate rather than broken: a warm washed panel, a dashed inner
 * border and the subject's name, echoing the prototype's own placeholder.
 *
 * The box always reserves its space via `aspect-ratio`, so dropping in real
 * photos later causes zero layout shift.
 */
@Component({
  selector: 'bah-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (src(); as url) {
      <img
        [src]="url"
        [alt]="alt()"
        [attr.loading]="priority() ? 'eager' : 'lazy'"
        [attr.fetchpriority]="priority() ? 'high' : null"
        decoding="async"
        (load)="loaded.set(true)"
        [class.is-loaded]="loaded()"
      />
    } @else if (compact()) {
      <!--
        Avatars are 28px. The panel placeholder's icon, caption and dashed ring
        are all illegible at that size and read as a rendering fault, so a
        compact slot shows a single initial instead.
      -->
      <div class="placeholder placeholder--compact washed tinted" [style.--seed-hue]="hue()">
        <span class="initial">{{ initial() }}</span>
      </div>
    } @else {
      <div class="placeholder washed tinted" [style.--seed-hue]="hue()">
        <bah-icon name="image" [size]="26" [strokeWidth]="1.6" />
        @if (label()) {
          <span class="label">{{ label() }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      width: 100%;
      height: 100%;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 0.35s ease;
    }

    img.is-loaded {
      opacity: 1;
    }

    .placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      text-align: center;
      color: var(--color-text);
      opacity: 0.55;
      /*
       * The per-subject hue rotation — so six placeholder cards read as six
       * different things rather than one repeated grey box — comes from the
       * global .tinted class, which bah-avatar shares, fed by hue() below.
       */
    }

    .placeholder::after {
      content: '';
      position: absolute;
      inset: 10px;
      border: 1.5px dashed currentColor;
      border-radius: inherit;
      opacity: 0.35;
      pointer-events: none;
    }

    .label {
      font-size: 12.5px;
      font-weight: 500;
      line-height: 1.3;
      max-width: 22ch;
    }

    .placeholder--compact {
      opacity: 1;
      padding: 0;
      /* Dark end of the ramp on the light surface, light end on the dark one —
         accent-800 on the dark surface is effectively invisible. */
      color: var(--color-accent-800);
    }

    :host-context([data-theme='dark']) .placeholder--compact {
      color: var(--color-accent-200);
    }

    .placeholder--compact::after {
      content: none;
    }

    .initial {
      font-family: var(--font-heading);
      font-weight: 700;
      /* Scales with the slot so one component serves 28px and 64px avatars. */
      font-size: 0.9em;
      line-height: 1;
    }
  `,
})
export class ImageComponent {
  readonly image = input<ImageRef | null>(null);
  /** Shown inside the placeholder. Usually the recipe title. */
  readonly label = input<string>('');
  /** Set on the first hero slide so it is not lazy-loaded below the fold. */
  readonly priority = input(false);
  /** Avatar-sized slots: show an initial rather than the full panel treatment. */
  readonly compact = input(false);

  protected readonly initial = computed(() =>
    (this.label() || this.alt() || '?').trim().charAt(0).toUpperCase(),
  );

  protected readonly loaded = signal(false);

  protected readonly src = computed(() => this.image()?.url ?? null);
  protected readonly alt = computed(() => this.image()?.alt ?? '');

  /** Stable pseudo-random hue derived from the label, so it never flickers. */
  protected readonly hue = computed(() => {
    const text = this.label() || this.alt();
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360;
    // A warm band, chosen so placeholders sat inside the Umber palette rather
    // than introducing greens and blues that design never used. It no longer
    // tracks the palette — wine is hue 342 and olive 74 — and is left alone for
    // the same reason as the avatar ramp it shares its treatment with (ADR 9).
    return 18 + (hash % 42);
  });
}
