import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';
import { AuthService } from '../../../core/auth/auth.service';
import type { ProviderId } from '../../../core/api/models';

/**
 * One button per configured provider.
 *
 * The prototype drew a single "S'identifier avec GitHub" button. That is
 * replaced by a row driven from `GET /api/auth/providers`, per ADR 0006 — the
 * point being that the set of providers is deployment configuration, so the UI
 * must not name any of them in its own source.
 *
 * An empty list is a real state, not an error: it means sign-in is switched off
 * in configuration, and saying so is better than showing buttons that cannot
 * work.
 */
@Component({
  selector: 'bah-sign-in-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, IconComponent],
  template: `
    @if (auth.providers(); as providers) {
      @if (providers.length) {
        <div class="row">
          @for (provider of providers; track provider.id) {
            <button
              type="button"
              class="btn btn-secondary"
              [disabled]="busy()"
              (click)="signIn(provider.id)"
            >
              <bah-icon [name]="provider.id" [size]="16" />
              {{ 'comments.signInWith' | transloco: { provider: provider.label } }}
            </button>
          }
        </div>
      } @else {
        <p class="unavailable">{{ 'comments.unavailable' | transloco }}</p>
      }
    }
  `,
  styles: `
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .unavailable {
      margin: 0;
      opacity: 0.55;
      font-size: 13.5px;
    }

    @media (max-width: 520px) {
      /* Two provider buttons will not sit side by side on a phone without
         wrapping mid-word, so they stack and go full width instead. */
      .row {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
})
export class SignInRowComponent {
  protected readonly auth = inject(AuthService);

  /** Set while a sign-in is in flight, so the row cannot be double-submitted. */
  readonly busy = input(false);

  constructor() {
    void this.auth.loadProviders();
  }

  protected signIn(provider: ProviderId): void {
    void this.auth.signIn(provider);
  }
}
