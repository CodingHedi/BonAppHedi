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

    .caption {
      position: absolute;
      left: 56px;
      right: 56px;
      bottom: 36px;
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

      .caption {
        left: 32px;
        right: 32px;
      }

      .caption h2 {
        font-size: 32px;
      }
    }

    @media (max-width: 640px) {
      .slide {
        height: 340px;
      }

      .caption {
        left: 20px;
        right: 20px;
        bottom: 28px;
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
