import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';

/**
 * The page a visitor reaches by mistake, and by design.
 *
 * <p>Not only a typo or a stale inbound link: an unpublished recipe answers 404
 * as well, deliberately, because a draft and an unknown slug must be
 * indistinguishable from outside — otherwise asking confirms that something
 * exists. So this is a page real people see, and the previous version was a bare
 * heading sitting flush against the viewport edge because it never had the
 * `container` class the rest of the site uses.
 *
 * <p>The numeral is decorative and marked {@code aria-hidden}: a screen reader
 * announcing "four zero four" before the heading adds nothing the heading does
 * not already say.
 */
@Component({
  selector: 'bah-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section class="container page">
      <p class="numeral" aria-hidden="true">404</p>

      <h1>{{ 'error.pageNotFound' | transloco }}</h1>
      <p class="body">{{ 'error.pageNotFoundBody' | transloco }}</p>

      <a class="btn btn-primary" [routerLink]="home()">{{ 'error.backHome' | transloco }}</a>

      <p class="hint">{{ 'error.trySearch' | transloco }}</p>
    </section>
  `,
  styles: `
    .page {
      padding: 72px 0 96px;
      max-width: 560px;
    }

    /*
     * Big, and deliberately faint. It is the one ornament on the page, so it
     * carries the "this is a designed page, not an error" job on its own —
     * loud enough to read as intentional, quiet enough not to compete with the
     * heading, which is the part that actually tells you what happened.
     */
    .numeral {
      margin: 0 0 4px;
      font-size: 76px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-accent);
      opacity: 0.22;
    }

    h1 {
      font-size: 42px;
      line-height: 1.05;
      margin: 0 0 14px;
    }

    .body {
      opacity: 0.75;
      line-height: 1.55;
      margin: 0 0 28px;
    }

    .hint {
      margin: 26px 0 0;
      padding-top: 22px;
      border-top: 1px solid var(--color-divider);
      font-size: 13.8px;
      opacity: 0.6;
    }

    @media (max-width: 520px) {
      .page {
        padding: 48px 0 72px;
      }

      .numeral {
        font-size: 58px;
      }

      h1 {
        font-size: 32px;
      }
    }
  `,
})
export class NotFoundPage {
  private readonly locale = inject(LocaleService);
  protected readonly home = computed(() => this.locale.link());
}
