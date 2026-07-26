import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { SignInRowComponent } from '../../shared/ui/sign-in-row/sign-in-row';

/**
 * Somewhere to sign in that is not the bottom of a recipe.
 *
 * <p>The provider row was originally only ever rendered inside the comment box,
 * which made it the sole way into an account — so reaching the admin area meant
 * opening a recipe and scrolling to its comments, which is fine once you know
 * and inexplicable otherwise.
 *
 * <p>Carries no provider names of its own: the row renders whatever
 * `GET /api/auth/providers` returns, and says sign-in is unavailable when that
 * is empty (ADR 0003). Which provider exists is deployment configuration, and
 * the UI must not name one in its source.
 *
 * <p>A `returnTo` query parameter, if present, is honoured by the sign-in
 * navigation itself rather than by this component — the server validates it and
 * redirects there afterwards. Nothing here needs to know about it.
 */
@Component({
  selector: 'bah-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, SignInRowComponent, RouterLink],
  template: `
    <section class="container page">
      <h1>{{ 'signIn.title' | transloco }}</h1>

      @if (auth.signedIn()) {
        <!-- Reached by someone who is already signed in: say so and get out of
             the way, rather than offering to do it again. -->
        <p class="lead">
          {{ 'account.signedInAs' | transloco: { name: auth.user()?.displayName } }}
        </p>
        <a class="btn btn-secondary" [routerLink]="['/', locale.locale()]">
          {{ 'signIn.home' | transloco }}
        </a>
      } @else {
        <p class="lead">{{ 'signIn.lead' | transloco }}</p>
        <bah-sign-in-row />
      }
    </section>
  `,
  styles: `
    .page {
      padding: 48px 0 80px;
      max-width: 560px;
    }

    h1 {
      margin: 0 0 12px;
    }

    .lead {
      margin: 0 0 24px;
      line-height: 1.55;
      opacity: 0.75;
    }
  `,
})
export class SignInPage {
  protected readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);
}
