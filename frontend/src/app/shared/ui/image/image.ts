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
 * **The box is the caller's, not this component's.** Every slot gives it a
 * definite size — the card's `.media` a flat 190px, the detail page's a 16/9
 * `aspect-ratio`, an avatar a pixel square — and the image is stretched to fill
 * whatever that is. Which is what makes a photograph arriving cost zero layout
 * shift, measured 2026-08-17 at 6, 100 and 300 cards (`scripts/grid-perf.mjs`):
 * the page's shift was identical at all three and never once attributed to an
 * image.
 *
 * This used to claim the reservation happened here, via `aspect-ratio`. It does
 * not, and the distinction matters to anyone adding a fourth slot: put
 * `bah-image` in a box of indeterminate height and nothing in this file will
 * save you. `width` and `height` on the `ImageRef` are not read at all.
 */
@Component({
  selector: 'bah-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (src(); as url) {
      <img
        [src]="url"
        [attr.srcset]="srcset()"
        [attr.sizes]="srcset() ? sizes() : null"
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

  /**
   * How wide this slot will actually be, for the browser to pick a source with.
   *
   * The default describes a card in the grid: about a third of a 1200px page,
   * and the full width of a phone. **A wrong `sizes` is worse than none** — it
   * is a promise the browser trusts before layout, so understating it fetches a
   * blurry file and overstating it fetches the large one and undoes the whole
   * point. Every caller that is not a grid card should say so; the detail page
   * does.
   */
  readonly sizes = input('(max-width: 700px) 100vw, 33vw');

  protected readonly initial = computed(() =>
    (this.label() || this.alt() || '?').trim().charAt(0).toUpperCase(),
  );

  protected readonly loaded = signal(false);

  protected readonly src = computed(() => this.image()?.url ?? null);
  protected readonly alt = computed(() => this.image()?.alt ?? '');

  /**
   * The candidates, as `srcset` spells them: `url 400w, url 800w, …`.
   *
   * Null rather than empty when there is nothing to offer, so the attribute is
   * absent altogether — a photograph with one size renders exactly the `<img>`
   * this component rendered before any of this existed. `sizes` is bound to
   * null in the same case, because a `sizes` without a `srcset` is a promise
   * about a decision the browser is not making.
   *
   * A single candidate is also dropped: `foo.jpg 1600w` and a `sizes` telling
   * the browser the slot is 400px wide is an instruction to downscale the only
   * file there is, which is what it would have done anyway.
   */
  protected readonly srcset = computed(() => {
    const sources = this.image()?.sources ?? [];
    if (sources.length < 2) return null;

    return sources.map((source) => `${source.url} ${source.width}w`).join(', ');
  });

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
