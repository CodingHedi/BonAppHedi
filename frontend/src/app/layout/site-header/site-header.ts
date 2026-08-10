import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { QuickSearchComponent } from '../quick-search/quick-search';
import { IconComponent } from '../../core/icons/icon';
import { LocaleService } from '../../core/i18n/locale.service';
import { LocaleAlternatesService } from '../../core/i18n/locale-alternates.service';
import { LOCALE_LABELS, stripLocale } from '../../core/i18n/locale';
import { ThemeService } from '../../core/theme/theme.service';
import { AuthService } from '../../core/auth/auth.service';
import { BrandLogoComponent } from '../brand-logo/brand-logo';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';

@Component({
  selector: 'bah-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    BrandLogoComponent,
    AvatarComponent,
    TranslocoPipe,
    QuickSearchComponent,
  ],
  template: `
    <header>
      <nav class="nav container">
        <a class="nav-brand" [routerLink]="homeLink()" [attr.aria-label]="'nav.home' | transloco">
          <bah-brand-logo />
        </a>

        <div class="actions">
          <!--
            Opens in place and answers here. It used to navigate to the recipe
            list and borrow that page's filter bar, which cost you whatever you
            were reading to look something up.
          -->
          <bah-quick-search />

          <!--
            Only present once there is an account, and then it signs out.
            The prototype drew this permanently, but signed out it would be a
            control with nowhere to go: sign-in is asked for next to the comment
            box, where the reason for it is visible. Recorded in ADR 0006.
          -->
          <!-- Only an admin has anywhere to go, so only an admin gets a door. -->
          @if (auth.isAdmin()) {
            <a
              class="btn btn-icon btn-secondary"
              [routerLink]="adminLink()"
              [attr.aria-label]="'admin.open' | transloco"
            >
              <bah-icon name="edit" />
            </a>
          }

          @if (auth.user(); as user) {
            <!--
              The prototype's user icon, finally doing what a user icon does.
              It signed the visitor out on one unlabelled click until there was
              an account page to send them to instead (ADR 7); signing out is now
              a labelled button on that page.

              Their own avatar rather than the generic glyph, so the header shows
              the choice the page exists to make.
            -->
            <a
              class="btn btn-icon btn-secondary account"
              [routerLink]="profileLink()"
              [attr.aria-label]="'account.open' | transloco"
              [attr.title]="'account.signedInAs' | transloco: { name: user.displayName }"
            >
              <bah-avatar [avatar]="user.avatar" [name]="user.displayName" [size]="30" />
            </a>
          }

          <!--
            Text, not a flag. Flags denote countries, and French is not spoken
            only in France.
          -->
          <button
            type="button"
            class="btn btn-icon btn-secondary lang"
            [attr.aria-label]="'nav.switchTo' | transloco: { language: otherLabel() }"
            (click)="switchLanguage()"
          >
            {{ other().toUpperCase() }}
          </button>

          <button
            type="button"
            class="btn btn-icon btn-secondary"
            [attr.aria-label]="themeLabel() | transloco"
            [attr.aria-pressed]="theme.isDark()"
            (click)="theme.toggle()"
          >
            <bah-icon [name]="theme.isDark() ? 'moon' : 'sun'" />
          </button>
        </div>
      </nav>
    </header>
  `,
  styles: `
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: color-mix(in srgb, var(--color-bg) 90%, transparent);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--color-divider);
    }

    .nav {
      padding-top: 18px;
      padding-bottom: 18px;
    }

    .nav-brand {
      text-decoration: none;
      display: flex;
      align-items: center;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
    }

    .lang {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    /* The avatar fills the icon button rather than sitting inside it as a glyph
       would, so it reads as a portrait and not as a picture of one. */
    .account {
      padding: 0;
      overflow: hidden;
    }

    .account bah-avatar {
      width: 30px;
      height: 30px;
    }
  `,
})
export class SiteHeaderComponent {
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);
  private readonly transloco = inject(TranslocoService);
  private readonly alternates = inject(LocaleAlternatesService);
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);

  protected readonly other = this.locale.other;
  protected readonly otherLabel = computed(() => LOCALE_LABELS[this.other()]);
  protected readonly homeLink = computed(() => this.locale.link());
  protected readonly adminLink = computed(() => this.locale.link([this.locale.segment('admin')]));
  protected readonly profileLink = computed(() => this.locale.link([this.locale.segment('profile')]));

  protected readonly themeLabel = computed(() =>
    this.theme.isDark() ? 'nav.themeToLight' : 'nav.themeToDark',
  );

  /**
   * Switching language is a navigation, not a state flip — every page must stay
   * independently linkable in both languages.
   *
   * Route segments are translated from the locale tables. Recipe slugs cannot
   * be, because they are rows rather than translations, so the recipe page
   * publishes its counterpart through `LocaleAlternatesService` and this reads
   * it. A segment with no known counterpart is carried across unchanged, which
   * is right for anything that is not a slug and is why an unknown slug still
   * lands on the 404 rather than somewhere arbitrary.
   */
  protected switchLanguage(): void {
    const target = this.other();
    const rest = stripLocale(this.router.url.split('?')[0].split('#')[0]);

    const translated = rest.map((segment) => {
      // Every translated segment has to be listed here, and two were missing:
      // switching language on /fr/connexion asked for /en/connexion, which is
      // not a route, so the catch-all rendered the 404 page. `profile` joins for
      // the same reason and `signIn` is the fix for that.
      const key = (['recipes', 'legal', 'privacy', 'admin', 'signIn', 'profile'] as const).find(
        (candidate) => this.locale.segment(candidate) === segment,
      );
      if (key) return this.locale.segment(key, target);

      /*
       * Not a route segment, so it may be a recipe slug — and a slug is a row
       * rather than a translation. `babka-au-chocolat` is `chocolate-babka`
       * only because the database says so, which is why the page supplies it
       * and this asks rather than translating.
       *
       * Returning the segment unchanged is what used to happen to every slug,
       * and it produced /en/recipes/babka-au-chocolat: a real route carrying a
       * slug that does not exist in that language, so the visitor was told the
       * recipe was missing by pressing a button that promised the same page.
       */
      return this.alternates.counterpart(segment, target) ?? segment;
    });

    this.locale.remember(target);
    this.locale.apply(target);
    this.transloco.setActiveLang(target);
    void this.router.navigate([`/${target}`, ...translated]);
  }
}
