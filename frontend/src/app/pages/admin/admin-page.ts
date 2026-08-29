import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * The admin shell: a heading, a section nav, and whichever screen is routed.
 *
 * Deliberately plain. This is a workshop, not a shop window — the design
 * prototypes cover the public site and say nothing about this, so it borrows the
 * same tokens and primitives and invents no new visual language of its own.
 */
@Component({
  selector: 'bah-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  template: `
    <header class="head">
      <h1>{{ 'admin.title' | transloco }}</h1>
      @if (auth.user(); as user) {
        <p class="who">{{ 'account.signedInAs' | transloco: { name: user.displayName } }}</p>
      }
    </header>

    <nav class="sections" [attr.aria-label]="'admin.title' | transloco">
      @for (section of SECTIONS; track section.path) {
        <a
          [routerLink]="link(section.path)"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: false }"
        >
          {{ 'admin.' + section.label | transloco }}
        </a>
      }
    </nav>

    <router-outlet />
  `,
  styles: `
    :host {
      display: block;
      padding: 36px 0 60px;
    }

    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    h1 {
      font-size: 34px;
      margin: 0;
    }

    .who {
      margin: 0;
      font-size: 13px;
      color: var(--color-text-muted);
    }

    .sections {
      display: flex;
      gap: 4px;
      margin: 24px 0 32px;
      border-bottom: 1px solid var(--color-divider);
      flex-wrap: wrap;
    }

    /* A tab strip, so the pair below is what carries "which one am I on". The
       inactive tab is muted with a colour rather than opacity, and the active
       one takes the link colour rather than the fill — --color-accent is
       3.13:1 on the dark background, and it was the selected tab that was
       hardest to read. The underline still does the real work. */
    .sections a {
      padding: 10px 16px;
      font-size: 14px;
      text-decoration: none;
      color: var(--color-text-muted);
      border-bottom: 2px solid transparent;
    }

    .sections a.active {
      color: var(--color-link);
      border-bottom-color: var(--color-accent);
    }
  `,
})
export class AdminPage {
  private readonly locale = inject(LocaleService);
  protected readonly auth = inject(AuthService);

  protected readonly SECTIONS = [
    { path: 'recipes', label: 'recipes' },
    { path: 'comments', label: 'moderation' },
    { path: 'stats', label: 'analytics' },
  ] as const;

  private readonly base = computed(() => this.locale.link([this.locale.segment('admin')]));

  protected link(path: string): unknown[] {
    return [...this.base(), path];
  }
}
