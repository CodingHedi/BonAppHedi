import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { LogoPaletteService } from '../../core/brand/logo-palette.service';

/** Natural size of the lockup artwork. Width follows height from this. */
const ART_WIDTH = 877.14;
const ART_HEIGHT = 361.17;

/**
 * The logo: a cooking pot beside the two-line wordmark.
 *
 * Chosen from the proof sheet on 2026-08-17 — the Pot symbol over the Letter B,
 * in the two references `A·C·A on U` (dark) and `A·I·A on P` (light). Those
 * decode to one rule rather than two palettes, which is why this file has no
 * theme logic in it at all:
 *
 *   - the pot and HÉDI are `A`, Orange, in both themes
 *   - BONAPP' is `C` on Umber and `I` on Paper — which is `--color-text`
 *
 * So the mark keeps its colour when the theme flips and only the upper word
 * follows the page. That is the point of Orange being a brand ink outside both
 * ramps (see `--color-brand`), not a third accent.
 *
 * The three blocks take their fill through `--logo-mark`, `--logo-upper` and
 * `--logo-lower`, each falling back to the chosen reference. Nothing sets those
 * variables today; they are the seam the Konami palette shuffle writes to, and
 * having them here means that feature adds no branching to this component.
 *
 * Path data is transcribed from the proof sheet unaltered. It is not artwork to
 * edit by hand: the two `<g>` boundaries carry the meaning, and the coordinates
 * inside them came out of the drawing.
 */
@Component({
  selector: 'bah-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The logo sits inside the home link, so this fires alongside the navigation
  // rather than instead of it: the re-roll is visible on the page you land on.
  host: { '(click)': 'palette.reshuffle()' },
  template: `
    <svg
      viewBox="0 0 877.14 361.17"
      [attr.width]="width()"
      [attr.height]="height()"
      role="img"
      aria-label="Bon App' Hédi"
    >
      <g class="mark">
        <path
          d="M267.15,231.22c-0.11-0.08-0.21-0.13-0.32-0.21c-7.65-4.59-17.63-2.23-22.67,5.13 c-15.08,21.98-17.74,53.8-17.74,53.8c21.06-15.67,28.82-37.89,28.82-37.89c3.09,11.99-2.15,22.62-2.15,22.62 c10.65-6.76,16.53-15.38,19.62-21.49C276.57,245.47,274.45,235.81,267.15,231.22z"
        />
        <path
          d="M379.1,200.39l-7.97-18c-1.95-4.41-7.03-6.52-11.53-4.79l-48.33,18.58l14.6-11.89 c2.5-2.04,3.73-5.23,3.22-8.42l-0.7-4.48c-0.83-5.1-5.72-8.45-10.73-7.33c-0.08,0.02-0.16,0.04-0.24,0.05 c-13.57,3.02-25.58-9.52-21.88-22.92c2.09-7.58,5.38-14.85,9.78-21.55c13.83-21.05,28.72-53.5,13.84-81.15 C294.78-6.75,244.07-2.7,206.56,15.23c-37.51,17.95-56.21,66.09-146,90.78c0,0,28.95,13.23,78.7-21.44 c49.72-34.67,84.55-68.99,129.47-51.04c44.92,17.92,31.21,72.8,3.3,89.78c0,0,6.81-37.94-37.83-54.61 c0,0,14.95,16.96,0.35,50.72c0,0-81.25-3.94-128.88,37.7c3.41-1.61,79.67-37.75,168.64-9.63l4.48,24.05c0,0,0,0,0,0 c-66.07,11.08-138.96,15.78-185.76,17.74c0,0-0.01,0-0.01-0.01l-9.95-34.94c-53.05,2.15-57.45-31.37-55.25-41.99 c5.26-40.01,82.54-32.31,82.54-32.31C14.57,58.86,9.71,114.62,15.08,135.28c5.42,17.07,17.52,25.97,29.41,30.58 c5.29,2.05,10.26,4.71,14.8,7.89c7.27,5.1,3.55,16.61-5.33,16.79c-0.05,0-0.11,0-0.16,0c-5.29,0.11-9.31,4.78-8.64,10.04 l0.54,4.32c0.83,6.71-4.8,12.45-11.54,11.78l-22.43-2.33C5.47,213.7,0,218.61,0,224.91v16.96c0,5.13,3.65,9.53,8.69,10.47 l38.37,7.16c3.78,0.7,6.9,3.41,8.08,7.08l6.98,21.31c14.81,45.29,57.96,75.02,105.59,73.2c33.65-1.29,61.66-5.96,84.34-11.81 c44.54-11.51,76.42-50.66,79.13-96.57l0.86-14.52c0.3-4.75,3.25-8.96,7.62-10.84l34.75-14.97 C379.02,210.37,381.14,204.97,379.1,200.39z M291.78,253.62c-5.15,19.54-22.65,53.1-81.71,63.19 c-31.5,4.59-78.57,8-113.58-36.25c-1.1-1.39-1.69-3.17-1.69-4.96c0-1.02,0.83-1.72,1.69-1.72c0.35,0,0.7,0.11,0.99,0.32 c9.85,7.19,45.56,30.48,86.67,23.91c12.56-2.01,22.59-11.7,25.49-24.1c2.39-10.2,6.14-23.45,11.78-36.14 c8.91-20.18,32.23-30.56,52.51-21.9c0.8,0.32,1.61,0.7,2.39,1.1C289.56,223.76,295.59,239.29,291.78,253.62z"
        />
      </g>
      <g class="upper">
        <path
          d="M405.41,121.85V2.61h29.74c9.89,0,17.43,0.76,22.41,2.27c4.72,1.43,8.43,4.25,11.35,8.62 c2.93,4.39,4.42,11.78,4.42,21.97c0,8.28-1.56,11.98-2.87,13.63c-1.91,2.39-5.97,4.32-12.07,5.72l-10.67,2.44l10.68,2.42 c6.8,1.54,11.4,4.02,13.68,7.38c2.36,3.48,3.56,9.06,3.56,16.6v11.52c0,7.98-0.89,13.9-2.64,17.59 c-1.64,3.45-4.17,5.74-7.75,7.01c-3.91,1.38-12.3,2.08-24.95,2.08H405.41z M432.73,105.67l2.58-0.09 c5.34-0.18,8.65-1.1,10.4-2.9c1.79-1.83,2.59-5.28,2.59-11.18V79.92c0-6.32-0.72-9.73-2.42-11.43 c-1.65-1.65-4.92-2.47-10.58-2.65l-2.57-0.08V105.67z M432.73,51.58l2.58-0.09c1.34-0.05,2.39-0.08,3.13-0.08 c4.13,0,6.9-1.22,8.24-3.62c0.75-1.35,1.62-4.24,1.62-14.6c0-4.29-0.43-7.3-1.3-9.21c-1.01-2.19-2.43-3.62-4.23-4.26 c-0.91-0.32-2.67-0.76-7.51-0.84l-2.53-0.04V51.58z"
        />
        <path
          d="M516.84,124.46c-6.29,0-12-1.03-16.97-3.07c-4.84-1.99-8.79-5-11.72-8.96 c-2.95-3.97-4.72-8.35-5.28-13.01c-0.6-5-0.9-13.94-0.9-26.56V51.6c0-12.33,0.29-21.15,0.87-26.23 c0.54-4.74,2.24-9.13,5.07-13.06c2.82-3.91,6.69-6.96,11.52-9.07C504.35,1.09,510.21,0,516.84,0c6.29,0,12,1.03,16.97,3.07 c4.84,1.99,8.79,5.01,11.72,8.96c2.95,3.97,4.72,8.35,5.28,13.01c0.6,5,0.9,13.94,0.9,26.56v21.25 c0,12.32-0.29,21.15-0.87,26.23c-0.54,4.74-2.24,9.13-5.07,13.06c-2.82,3.91-6.69,6.96-11.52,9.07 C529.33,123.37,523.47,124.46,516.84,124.46z M516.99,16.04c-2.52,0-4.57,1.05-5.93,3.04c-0.88,1.28-1.78,3.82-1.78,12.96 v58.01c0,9.97,0.55,12.81,1.02,14.17c0.55,1.57,2.11,4.2,6.46,4.2c3.31,0,5.65-1.65,6.6-4.66c0.45-1.41,1.04-4.46,1.04-14.64 V32.04c0-8.2-0.65-10.78-1.13-12.01C522.24,17.46,520.01,16.04,516.99,16.04z"
        />
        <polygon points="602.38,121.85 581.23,50.76 581.23,121.85 559.2,121.85 559.2,2.61 581.91,2.61 604.32,71.84 604.32,2.61 626.35,2.61 626.35,121.85 " />
        <path
          d="M681.59,121.85l-1.73-22.33h-16.15l-1.94,22.33H633.5L649.32,2.61h42.36l17.73,119.24H681.59z M669.32,27.48c-3.28,23.74-5.37,41.34-6.22,52.33l-0.21,2.68h16.61l-0.32-2.78c-1.62-13.98-3.28-31.5-4.91-52.09l-1.81-22.84 L669.32,27.48z"
        />
        <path
          d="M715.51,121.85V2.61h30.04c8.52,0,15.11,0.66,19.6,1.97c4.26,1.24,7.47,3.02,9.52,5.27 c2.07,2.27,3.5,5.08,4.25,8.35c0.8,3.51,1.2,9.12,1.2,16.67V45.7c0,7.54-0.75,13.03-2.24,16.32 c-1.39,3.08-3.93,5.41-7.76,7.11c-4.03,1.79-9.46,2.7-16.14,2.7h-11.16v50.03H715.51z M742.83,55.34l2.35,0.13 c0.97,0.05,1.81,0.08,2.52,0.08c3.75,0,6.49-1.05,8.13-3.14c1.54-1.96,2.26-5.33,2.26-10.64V31.58 c0-5.07-0.88-8.27-2.76-10.08c-1.86-1.78-5.04-2.61-10.01-2.61h-2.49V55.34z"
        />
        <path
          d="M789.52,121.85V2.61h30.04c8.52,0,15.11,0.66,19.6,1.97c4.26,1.24,7.47,3.02,9.52,5.27 c2.07,2.27,3.5,5.08,4.25,8.35c0.8,3.51,1.2,9.12,1.2,16.67V45.7c0,7.54-0.75,13.03-2.24,16.32 c-1.39,3.08-3.93,5.41-7.76,7.11c-4.03,1.79-9.46,2.7-16.14,2.7h-11.16v50.03H789.52z M816.84,55.34l2.35,0.13 c0.97,0.05,1.81,0.08,2.52,0.08c3.75,0,6.49-1.05,8.13-3.14c1.54-1.96,2.26-5.33,2.26-10.64V31.58 c0-5.07-0.88-8.27-2.76-10.08c-1.86-1.78-5.04-2.61-10.01-2.61h-2.49V55.34z"
        />
        <polygon points="864.93,31.36 861.95,16 861.95,2.61 877.14,2.61 877.14,16.03 874.56,31.36 " />
      </g>
      <g class="lower">
        <polygon
          points="481.5,216.49 463.98,216.49 463.98,135.94 405.41,135.94 405.41,361.17 463.98,361.17 463.98,266.57 481.5,266.57 481.5,361.17 540.07,361.17 540.07,135.94 481.5,135.94 "
        />
        <polygon
          points="612.99,266.57 649.58,266.57 649.58,223.72 612.99,223.72 612.99,181.01 652.08,181.01 652.08,135.94 554.42,135.94 554.42,361.17 655.97,361.17 655.97,316.09 612.99,316.09 "
        />
        <path
          d="M793.7,152.63c-5.2-5.93-12.78-10.2-22.74-12.8c-9.97-2.6-29.1-3.89-57.39-3.89h-43.82v225.23h73.87 c14,0,24.48-0.77,31.44-2.3c6.96-1.53,12.8-4.22,17.53-8.07c4.73-3.85,8.04-9.18,9.95-16c1.9-6.82,2.85-20.33,2.85-40.55 v-78.88c0-21.33-0.65-35.63-1.95-42.92C802.14,165.18,798.9,158.57,793.7,152.63z M746.82,289.94 c0,15.02-0.98,24.23-2.92,27.61c-1.95,3.39-7.14,5.08-15.58,5.08V174.47c6.4,0,10.76,0.67,13.08,2.02 c2.32,1.35,3.8,3.46,4.45,6.33c0.65,2.88,0.98,9.41,0.98,19.62V289.94z"
        />
        <rect x="818.57" y="135.94" width="58.57" height="225.23" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
    }

    /*
     * One custom property per block, each defaulting to the chosen reference.
     * A caller that sets none of them gets A·C·A / A·I·A, which is the logo.
     */
    .mark {
      fill: var(--logo-mark, var(--color-brand));
    }

    .upper {
      fill: var(--logo-upper, var(--color-text));
    }

    .lower {
      fill: var(--logo-lower, var(--color-brand));
    }

    /*
     * Only the shuffle animates, and only when it is asked for. A logo that
     * eased on every theme change would draw the eye to the header each time
     * somebody flipped the switch.
     */
    @media (prefers-reduced-motion: no-preference) {
      .mark,
      .upper,
      .lower {
        transition: fill 0.4s ease;
      }
    }
  `,
})
export class BrandLogoComponent {
  protected readonly palette = inject(LogoPaletteService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly height = input(44);
  protected readonly width = computed(() => (this.height() * ART_WIDTH) / ART_HEIGHT);

  constructor() {
    effect(() => {
      const element = this.host.nativeElement as HTMLElement;

      // Locked is the normal state, and it *removes* the properties rather than
      // writing the default into them. That keeps the shipped logo entirely
      // CSS-driven: BONAPP' follows `--color-text` because it is that token,
      // not because something re-read it and copied the value in.
      if (!this.palette.unlocked()) {
        for (const block of ['mark', 'upper', 'lower']) {
          element.style.removeProperty(`--logo-${block}`);
        }
        return;
      }

      const set = this.palette.current();
      element.style.setProperty('--logo-mark', set.mark);
      element.style.setProperty('--logo-upper', set.upper);
      element.style.setProperty('--logo-lower', set.lower);
    });
  }
}
