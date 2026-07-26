import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { SEGMENTS } from '../../core/i18n/locale';

/**
 * The site footer, and the only way into an account from a page that is not a
 * recipe.
 *
 * <p>A link rather than a provider row, and that is not only a matter of taste:
 * a row here would put a second set of provider buttons on every recipe page,
 * beside the one already in the comment box. Two identical "sign in with
 * Google" buttons on one page is ambiguous to a screen reader and to a test
 * suite alike — three e2e specs failed on exactly that ambiguity when this was
 * first written as a row.
 *
 * <p>Only when signed out. The header already carries who you are, the way out
 * and the admin link, so repeating any of it here would be two places obliged
 * to keep agreeing.
 */
@Component({
  selector: 'bah-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink],
  template: `
    <footer>
      <div class="container inner">
        <span>{{ 'site.title' | transloco }} — {{ 'site.tagline' | transloco }}</span>

        <span class="right">
          @if (offersSignIn()) {
            <a [routerLink]="signInLink()" [queryParams]="{ returnTo: currentUrl() }">
              {{ 'account.signIn' | transloco }}
            </a>
          }
          <span>{{ 'footer.copyright' | transloco: { year } }}</span>
        </span>
      </div>
    </footer>
  `,
  styles: `
    footer {
      border-top: 1px solid var(--color-divider);
      padding: 34px 0 50px;
    }

    .inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 13px;
      opacity: 0.6;
    }

    .right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  `,
})
export class SiteFooterComponent {
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  // Dynamic rather than the prototype's hardcoded "© 2026" — that string would
  // silently go stale in five months.
  protected readonly year = new Date().getFullYear();

  /**
   * Nothing until we know who the visitor is, so the footer does not flash a
   * sign-in link at somebody who is already signed in on every page load.
   */
  protected readonly offersSignIn = computed(() => this.auth.resolved() && !this.auth.signedIn());

  protected readonly signInLink = computed(() => {
    const locale = this.locale.locale();
    return ['/', locale, SEGMENTS[locale].signIn];
  });

  /**
   * Driven off navigation events rather than read straight from `router.url`.
   *
   * `Router.url` is a plain property, so a computed reading it has nothing to
   * depend on: it would evaluate once, cache the first page the visitor landed
   * on, and quietly send everyone back there for the rest of the session. This
   * footer lives in the shell and is never otherwise re-rendered, so nothing
   * would have corrected it.
   */
  private readonly lastNavigation = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
    { initialValue: null },
  );

  /**
   * The page being left, so signing in returns here rather than to the home
   * page. The server refuses anything that is not a path on this site, so this
   * cannot be turned into a redirect somewhere else.
   */
  protected readonly currentUrl = computed(() => {
    this.lastNavigation();
    return this.router.url;
  });
}
