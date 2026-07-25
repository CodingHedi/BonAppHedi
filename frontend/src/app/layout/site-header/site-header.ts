import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../core/icons/icon';
import { LocaleService } from '../../core/i18n/locale.service';
import { LOCALE_LABELS, stripLocale } from '../../core/i18n/locale';
import { ThemeService } from '../../core/theme/theme.service';
import { BrandLogoComponent } from '../brand-logo/brand-logo';

@Component({
  selector: 'bah-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, BrandLogoComponent, TranslocoPipe],
  template: `
    <header>
      <nav class="nav container">
        <a class="nav-brand" [routerLink]="homeLink()" [attr.aria-label]="'nav.home' | transloco">
          <bah-brand-logo />
        </a>

        <div class="actions">
          <button type="button" class="btn btn-icon btn-secondary" [attr.aria-label]="'nav.search' | transloco">
            <bah-icon name="search" />
          </button>

          <button type="button" class="btn btn-icon btn-secondary" [attr.aria-label]="'nav.account' | transloco">
            <bah-icon name="user" />
          </button>

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
  `,
})
export class SiteHeaderComponent {
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);
  private readonly transloco = inject(TranslocoService);
  protected readonly theme = inject(ThemeService);

  protected readonly other = this.locale.other;
  protected readonly otherLabel = computed(() => LOCALE_LABELS[this.other()]);
  protected readonly homeLink = computed(() => this.locale.link());

  protected readonly themeLabel = computed(() =>
    this.theme.isDark() ? 'nav.themeToLight' : 'nav.themeToDark',
  );

  /**
   * Switching language is a navigation, not a state flip — every page must stay
   * independently linkable in both languages.
   *
   * Route segments are translated here. Recipe *slugs* cannot be: they live in
   * the database, so a page holding a translated slug supplies it via the
   * `alternates` field and overrides this. Falling back to the section root is
   * the correct behaviour when no counterpart is known — better than a 404.
   */
  protected switchLanguage(): void {
    const target = this.other();
    const rest = stripLocale(this.router.url.split('?')[0].split('#')[0]);

    const translated = rest.map((segment) => {
      const key = (['recipes', 'legal', 'privacy', 'admin'] as const).find(
        (candidate) => this.locale.segment(candidate) === segment,
      );
      return key ? this.locale.segment(key, target) : segment;
    });

    this.locale.remember(target);
    this.locale.apply(target);
    this.transloco.setActiveLang(target);
    void this.router.navigate([`/${target}`, ...translated]);
  }
}
