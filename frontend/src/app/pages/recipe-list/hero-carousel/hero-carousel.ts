import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';
import { ImageComponent } from '../../../shared/ui/image/image';
import { LocaleService } from '../../../core/i18n/locale.service';
import type { HeroSlide } from '../../../core/api/models';

const AUTOPLAY_MS = 6000;

@Component({
  selector: 'bah-hero-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ImageComponent, TranslocoPipe],
  template: `
    <section
      class="hero"
      aria-roledescription="carousel"
      [attr.aria-label]="'site.title' | transloco"
      (mouseenter)="pause()"
      (mouseleave)="resume()"
      (focusin)="pause()"
      (focusout)="resume()"
    >
      <div class="frame">
        <div class="track" [style.transform]="trackTransform()">
          @for (slide of slides(); track slide.slug; let i = $index) {
            <article
              class="slide washed"
              [attr.inert]="i === index() ? null : ''"
              [attr.aria-hidden]="i === index() ? null : 'true'"
            >
              <bah-image [image]="slide.image" [label]="slide.title" [priority]="i === 0" />
              <div class="defocus"></div>
              <div class="scrim"></div>

              <div class="caption">
                <span class="kicker">{{ slide.kicker }}</span>
                <!--
                  <h2>, not <h1>: the prototype had three <h1> elements in one
                  carousel. The page's single <h1> is visually hidden on the
                  list page.
                -->
                <h2>{{ slide.title }}</h2>
                <p>{{ slide.excerpt }}</p>
                <a class="btn btn-primary" [routerLink]="link(slide.slug)">
                  {{ 'hero.cta' | transloco }}
                </a>
              </div>
            </article>
          }
        </div>

        <button
          type="button"
          class="btn btn-icon arrow arrow--prev"
          [attr.aria-label]="'hero.previous' | transloco"
          (click)="go(index() - 1)"
        >
          <bah-icon name="chevron-left" [size]="18" />
        </button>

        <button
          type="button"
          class="btn btn-icon arrow arrow--next"
          [attr.aria-label]="'hero.next' | transloco"
          (click)="go(index() + 1)"
        >
          <bah-icon name="chevron-right" [size]="18" />
        </button>

        <div class="dots">
          @for (slide of slides(); track slide.slug; let i = $index) {
            <button
              type="button"
              class="dot"
              [class.is-active]="i === index()"
              [attr.aria-label]="'hero.goToSlide' | transloco: { number: i + 1 }"
              [attr.aria-current]="i === index() ? 'true' : null"
              (click)="go(i)"
            ></button>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .hero {
      padding: 40px 0 8px;
    }

    .frame {
      position: relative;
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }

    .track {
      display: flex;
      transition: transform 0.5s cubic-bezier(0.65, 0, 0.35, 1);
    }

    .slide {
      min-width: 100%;
      position: relative;
      height: 440px;
    }

    /*
     * Throws the photograph out of focus behind the caption, and only there.
     *
     * The scrim below darkens, which is enough on a dark photograph and not
     * enough on a bright one: the kicker is --color-accent-300, a light tint,
     * and over the lit crust of a loaf it disappeared. Darkening harder would
     * have cost the photograph; blurring costs only the part of it the text
     * already covers, and the top two thirds stay sharp.
     *
     * Masked rather than sized so the blur fades out instead of ending on a
     * visible horizontal edge. Separate from .scrim because masking that
     * element would mask its gradient too, and that gradient is the
     * prototype's — this layer is the deviation, kept where it can be seen.
     *
     * Degrades honestly: a browser without backdrop-filter simply gets the
     * scrim it got before, which is the current behaviour and not a break.
     */
    .defocus {
      position: absolute;
      inset: 0;
      pointer-events: none;
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
      /*
       * NB: no backticks anywhere in this block. These styles are a TypeScript
       * template literal, so one backtick in a CSS comment ends the string and
       * the compiler reports two dozen errors about names it cannot find.
       *
       * --defocus-solid is per-breakpoint because the caption's height is, and
       * the mask has to cover it. The caption reaches 50.7% of the slide on a
       * desktop and 76.6% on a phone, where the excerpt wraps to four lines —
       * so a single value either leaves the phone's kicker outside the blur
       * entirely, which is what it did, or blurs two thirds of a desktop hero
       * for no reason. Each is the measured caption top plus a few points.
       *
       * EASED, NOT LINEAR, and that is the whole reason for the seven stops.
       * A two-stop ramp is linear in alpha, so its RATE of change jumps from
       * nothing to constant at --defocus-solid and back to nothing at
       * --defocus-fade. Those two corners are visible as a band edge even
       * though no stop is abrupt — the eye finds the discontinuity in the
       * gradient of the blur, not in the blur itself, which is why widening a
       * linear ramp alone never fixed it.
       *
       * The alphas below approximate a smoothstep: they leave 1 slowly, cross
       * the middle quickly and approach 0 slowly, so both corners are rounded
       * off. Expressed against --defocus-band so the shape survives each
       * breakpoint moving its own endpoints.
       */
      --defocus-band: calc(var(--defocus-fade) - var(--defocus-solid));
      -webkit-mask-image: linear-gradient(
        0deg,
        #000 0%,
        #000 var(--defocus-solid),
        rgba(0, 0, 0, 0.94) calc(var(--defocus-solid) + var(--defocus-band) * 0.18),
        rgba(0, 0, 0, 0.78) calc(var(--defocus-solid) + var(--defocus-band) * 0.36),
        rgba(0, 0, 0, 0.54) calc(var(--defocus-solid) + var(--defocus-band) * 0.55),
        rgba(0, 0, 0, 0.28) calc(var(--defocus-solid) + var(--defocus-band) * 0.73),
        rgba(0, 0, 0, 0.09) calc(var(--defocus-solid) + var(--defocus-band) * 0.88),
        transparent var(--defocus-fade)
      );
      mask-image: linear-gradient(
        0deg,
        #000 0%,
        #000 var(--defocus-solid),
        rgba(0, 0, 0, 0.94) calc(var(--defocus-solid) + var(--defocus-band) * 0.18),
        rgba(0, 0, 0, 0.78) calc(var(--defocus-solid) + var(--defocus-band) * 0.36),
        rgba(0, 0, 0, 0.54) calc(var(--defocus-solid) + var(--defocus-band) * 0.55),
        rgba(0, 0, 0, 0.28) calc(var(--defocus-solid) + var(--defocus-band) * 0.73),
        rgba(0, 0, 0, 0.09) calc(var(--defocus-solid) + var(--defocus-band) * 0.88),
        transparent var(--defocus-fade)
      );
      --defocus-solid: 54%;
      /* Well above the caption: the band is where the easing happens, so it
         has to be long enough for the easing to be worth anything. */
      --defocus-fade: 94%;
    }

    .scrim {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(
        0deg,
        var(--scrim-strong) 0%,
        var(--scrim-soft) 40%,
        transparent 72%
      );
    }

    /*
     * left clears the previous arrow, and that is a constraint rather than a
     * spacing choice. The arrow is vertically centred and the kicker is the
     * caption's first line, so the two land in the same band: at the
     * prototype's 56px the arrow (left:18px + 44px wide = 62px) covered the
     * kicker's first glyph by 6px, and at the 640px breakpoint's 20px it
     * covered 26px of it.
     *
     * Invisible for as long as the hero was a pale placeholder panel — a
     * translucent disc over a flat panel reads as a disc, not as something
     * eating a letter. The first photograph made it obvious.
     *
     * So: arrow right edge + a 16px gap, at each breakpoint. Change either the
     * arrow's size or its offset and this has to move with it.
     */
    /*
     * bottom is 10px lower than the prototype's 36px, deliberately. It drops
     * the kicker further inside the defocus band, away from the edge where the
     * mask is fading out and the blur is only partly applied.
     */
    .caption {
      position: absolute;
      left: 78px;
      right: 78px;
      bottom: 26px;
      max-width: 520px;
      /* Fixed light colours: this text sits on a photo in both themes. */
      color: var(--on-photo);
    }

    .kicker {
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--color-accent-300);
      display: block;
      margin-bottom: 10px;
      min-height: 1em;
    }

    .caption h2 {
      font-size: 40px;
      margin: 0 0 12px;
      line-height: 1.05;
      color: var(--on-photo);
    }

    .caption p {
      color: var(--on-photo-muted);
      font-size: 15px;
      margin: 0 0 22px;
      max-width: 480px;
    }

    .arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 3;
      width: 44px;
      height: 44px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      color: var(--on-photo);
      backdrop-filter: blur(6px);
    }

    .arrow:hover {
      background: color-mix(in srgb, var(--color-accent) 55%, var(--glass-bg));
      color: var(--on-photo);
    }

    .arrow--prev {
      left: 18px;
    }

    .arrow--next {
      right: 18px;
    }

    .dots {
      position: absolute;
      right: 36px;
      bottom: 34px;
      display: flex;
      gap: 8px;
      z-index: 3;
    }

    .dot {
      width: 7px;
      height: 7px;
      padding: 0;
      border: none;
      border-radius: var(--radius-pill);
      background: var(--dot-inactive);
      cursor: pointer;
      transition:
        width 0.3s ease,
        background-color 0.3s ease;
    }

    .dot.is-active {
      width: 20px;
      border-radius: 4px;
      background: var(--color-accent);
    }

    @media (max-width: 900px) {
      .slide {
        height: 380px;
      }

      /* Arrow is unchanged here (18px + 44px), so the same 78px clears it. */
      .caption {
        left: 78px;
        right: 78px;
      }

      /* The slide is shorter but the caption is not, so it reaches higher. */
      .defocus {
        --defocus-solid: 60%;
        --defocus-fade: 97%;
      }

      .caption h2 {
        font-size: 32px;
      }
    }

    @media (max-width: 640px) {
      .slide {
        height: 340px;
      }

      /* Arrow shrinks to 36px at left:10px, so it ends at 46px. */
      .caption {
        left: 62px;
        right: 62px;
        bottom: 20px;
      }

      /*
       * The excerpt wraps to four lines here, so the caption covers three
       * quarters of a 340px slide and the band has to follow it up. Most of
       * the photograph ends up defocused on a phone, which is the right trade
       * at this size: the text is what the hero is for.
       */
      .defocus {
        /*
         * The shortest band of the three, and it cannot be lengthened much:
         * the caption already reaches 76.6% and the mask cannot run past the
         * top of the slide. solid drops to 78% — still clear of the kicker at
         * 74.2% — and fade takes the whole of what is left, so the easing has
         * as much room as this size can give it.
         */
        --defocus-solid: 78%;
        --defocus-fade: 100%;
      }

      .caption h2 {
        font-size: 26px;
      }

      .caption p {
        font-size: 14px;
      }

      .arrow {
        width: 36px;
        height: 36px;
      }

      .arrow--prev {
        left: 10px;
      }

      .arrow--next {
        right: 10px;
      }

      .dots {
        right: 20px;
        bottom: 20px;
      }
    }
  `,
})
export class HeroCarouselComponent {
  private readonly locale = inject(LocaleService);

  readonly slides = input.required<readonly HeroSlide[]>();

  protected readonly index = signal(0);
  protected readonly trackTransform = computed(() => `translateX(-${this.index() * 100}%)`);

  private timer: ReturnType<typeof setInterval> | null = null;
  private hovering = false;

  /**
   * Autoplay is suppressed entirely — not merely shortened — when the visitor
   * has asked for reduced motion. A carousel that moves on its own is exactly
   * the kind of motion that setting exists to stop.
   */
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    this.start();
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected link(slug: string): unknown[] {
    return this.locale.recipeLink(slug);
  }

  /** Wraps in both directions: -1 lands on the last slide, n on the first. */
  protected go(target: number): void {
    const count = this.slides().length;
    if (count === 0) return;
    this.index.set(((target % count) + count) % count);
    this.restart();
  }

  protected pause(): void {
    this.hovering = true;
    this.stop();
  }

  protected resume(): void {
    this.hovering = false;
    this.start();
  }

  private start(): void {
    if (this.reducedMotion || this.hovering || this.timer !== null) return;
    this.timer = setInterval(() => this.advance(), AUTOPLAY_MS);
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Restarts the clock after a manual move, so the visitor gets a full interval. */
  private restart(): void {
    this.stop();
    this.start();
  }

  private advance(): void {
    const count = this.slides().length;
    if (count > 0) this.index.set((this.index() + 1) % count);
  }
}
