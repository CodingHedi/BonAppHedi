import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { IconComponent } from '../../core/icons/icon';
import {
  AVATAR_ICONS,
  AVATAR_TINT_HUES,
  formatAvatar,
  parseAvatar,
  randomAvatar,
  type Avatar,
} from '../../core/avatar/avatar-token';

/**
 * The account page: choose an avatar, and sign out.
 *
 * The first screen on this site that exists for a signed-in visitor who is not
 * the author, and a deviation from the prototypes rather than a rendering of one
 * — ADR 7, which is also where the reasoning for the avatars themselves is.
 *
 * The whole page is one choice made twice: a subject from the grid and a tint
 * from the swatch row. `Surprise me` rolls both, so the generator is a button
 * over the same closed set rather than a second system, and every state it can
 * produce is one the grid can also reach.
 *
 * Nothing is saved until Save is pressed. Persisting on every tap would be
 * simpler to write and worse to use: choosing an avatar means trying several,
 * and each attempt would be a write, a request, and an avatar the visitor never
 * settled on appearing against their comments in between.
 */
@Component({
  selector: 'bah-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink, AvatarComponent, IconComponent],
  template: `
    <section class="container page">
      <h1>{{ 'profile.title' | transloco }}</h1>
      <p class="lead">
        {{ 'account.signedInAs' | transloco: { name: auth.user()?.displayName } }}
      </p>

      <div class="card elev-sm preview">
        <div class="slot">
          <bah-avatar
            [avatar]="token()"
            [name]="auth.user()?.displayName ?? ''"
            [size]="88"
          />
        </div>
        <div class="preview-text">
          <b>{{ 'profile.avatarTitle' | transloco }}</b>
          <p>{{ 'profile.avatarLead' | transloco }}</p>
        </div>
      </div>

      <h2>{{ 'profile.pickSubject' | transloco }}</h2>
      <!--
        A radiogroup rather than a row of buttons: this is one choice among
        twelve, and a screen reader has to be told that. Arrow keys come free
        with the role, which a grid of <button>s would not have.
      -->
      <div class="grid" role="radiogroup" [attr.aria-label]="'profile.pickSubject' | transloco">
        @for (name of ICONS; track name) {
          <button
            type="button"
            role="radio"
            class="choice"
            [class.selected]="choice().icon === name"
            [attr.aria-checked]="choice().icon === name"
            [attr.aria-label]="'avatar.' + name | transloco"
            [tabindex]="choice().icon === name ? 0 : -1"
            [disabled]="busy()"
            (click)="pickIcon(name)"
          >
            <bah-avatar [avatar]="tokenFor(name)" [size]="52" />
          </button>
        }
      </div>

      <h2>{{ 'profile.pickTint' | transloco }}</h2>
      <div class="grid tints" role="radiogroup" [attr.aria-label]="'profile.pickTint' | transloco">
        @for (hue of TINTS; track $index) {
          <button
            type="button"
            role="radio"
            class="choice"
            [class.selected]="choice().tint === $index"
            [attr.aria-checked]="choice().tint === $index"
            [attr.aria-label]="'profile.tint' | transloco: { number: $index + 1 }"
            [tabindex]="choice().tint === $index ? 0 : -1"
            [disabled]="busy()"
            (click)="pickTint($index)"
          >
            <bah-avatar [avatar]="tintToken($index)" [size]="52" />
          </button>
        }
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" [disabled]="!canSave()" (click)="save()">
          {{ 'profile.save' | transloco }}
        </button>

        <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="shuffle()">
          {{ 'profile.shuffle' | transloco }}
        </button>

        <!-- Politely, on the right. Signing out used to be a single unlabelled
             click in the header with nothing to confirm it (ADR 7). -->
        <button type="button" class="btn btn-secondary sign-out" [disabled]="busy()" (click)="signOut()">
          <bah-icon name="logout" [size]="15" />
          {{ 'account.signOut' | transloco }}
        </button>
      </div>

      <!-- aria-live, so the confirmation is announced and not only seen. -->
      <p class="status" role="status" aria-live="polite">
        @if (saved()) {
          {{ 'profile.saved' | transloco }}
        } @else if (failed()) {
          {{ 'profile.failed' | transloco }}
        }
      </p>
    </section>
  `,
  styles: `
    .page {
      padding: 48px 0 80px;
      max-width: 620px;
    }

    h1 {
      margin: 0 0 12px;
    }

    h2 {
      font-size: 15px;
      margin: 32px 0 14px;
    }

    .lead {
      margin: 0 0 24px;
      line-height: 1.55;
      opacity: 0.75;
    }

    .preview {
      display: flex;
      /* Explicit, because .card is itself a flex column: without this the
         avatar centres itself above the text instead of sitting beside it, and
         no test can see the difference. */
      flex-direction: row;
      align-items: center;
      gap: 20px;
      padding: 22px 24px;
    }

    .slot {
      width: 88px;
      height: 88px;
      flex: none;
    }

    .preview-text p {
      margin: 4px 0 0;
      font-size: 13.8px;
      line-height: 1.55;
      opacity: 0.7;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
    }

    /* Six across is two clean rows of the twelve subjects; below that the icons
       stop being recognisable before the row stops fitting. */
    @media (max-width: 520px) {
      .grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .tints {
      max-width: 420px;
      /* Six across at every width, including the phone where the subjects drop
         to four. The tints are one scale from warm to cool, and wrapping them
         4 + 2 makes that read as two unrelated groups. */
      grid-template-columns: repeat(6, 1fr);
    }

    .choice {
      aspect-ratio: 1;
      padding: 6px;
      background: none;
      border: 2px solid transparent;
      border-radius: 50%;
      cursor: pointer;
      display: grid;
      place-items: center;
    }

    .choice:hover:not(:disabled) {
      border-color: var(--color-divider);
    }

    .choice.selected {
      border-color: var(--color-accent);
    }

    .choice:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    /* Fills its cell rather than a fixed 52px, so six tints still fit across a
       390px screen. The icon inside stays the size it was drawn at, which is
       what keeps the small ones legible. */
    .choice bah-avatar {
      width: 100%;
      max-width: 52px;
      aspect-ratio: 1;
      height: auto;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 34px;
    }

    .sign-out {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      /* Pushed away from Save, which is the button this page is for. */
      margin-left: auto;
    }

    .status {
      margin: 14px 0 0;
      min-height: 1.3em;
      font-size: 13.8px;
      opacity: 0.75;
    }
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  protected readonly ICONS = AVATAR_ICONS;
  protected readonly TINTS = AVATAR_TINT_HUES;

  /**
   * What is selected but not yet saved.
   *
   * Starts from whatever the account holds; from the first icon on the first
   * tint for somebody who has never chosen, so the page opens on a real avatar
   * rather than on nothing selected.
   */
  protected readonly choice = signal<Avatar>({ icon: AVATAR_ICONS[0], tint: 0 });

  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly failed = signal(false);

  protected readonly token = computed(() => formatAvatar(this.choice()));

  /** The saved avatar, so Save can be inert when there is nothing to save. */
  private readonly stored = computed(() => this.auth.user()?.avatar ?? null);

  protected readonly canSave = computed(() => !this.busy() && this.token() !== this.stored());

  constructor() {
    // Seeded from the account in an effect rather than in the constructor
    // because the guard guarantees a user exists, not that this component was
    // built after one arrived — and signing in again in another tab should not
    // leave this page showing the previous choice.
    effect(() => {
      const current = parseAvatar(this.stored());
      if (current) this.choice.set(current);
    });
  }

  /** The grid's own swatches: each subject drawn on the tint currently chosen. */
  protected tokenFor(icon: (typeof AVATAR_ICONS)[number]): string {
    return formatAvatar({ icon, tint: this.choice().tint });
  }

  /** And the tint row: each tint drawn under the subject currently chosen. */
  protected tintToken(tint: number): string {
    return formatAvatar({ icon: this.choice().icon, tint });
  }

  protected pickIcon(icon: (typeof AVATAR_ICONS)[number]): void {
    this.choice.update((current) => ({ ...current, icon }));
    this.clearStatus();
  }

  protected pickTint(tint: number): void {
    this.choice.update((current) => ({ ...current, tint }));
    this.clearStatus();
  }

  protected shuffle(): void {
    // Excludes what is selected, so a press always visibly changes something.
    this.choice.set(randomAvatar(this.choice()));
    this.clearStatus();
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;

    this.busy.set(true);
    this.clearStatus();
    try {
      await this.auth.chooseAvatar(this.token());
      this.saved.set(true);
    } catch {
      // Said out loud rather than swallowed. A silent failure here looks like a
      // save that worked until the next page load contradicts it.
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    // Nowhere to be once there is no account: this page is behind the guard, so
    // staying would bounce to sign-in and read as an error.
    await this.router.navigate(this.locale.link());
  }

  private clearStatus(): void {
    this.saved.set(false);
    this.failed.set(false);
  }
}
