import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { IconComponent } from '../../core/icons/icon';
import {
  AVATAR_ICONS,
  AVATAR_INKS,
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
 * The whole page is one choice made three times: a subject from the grid, a tint
 * for the disc, and an ink for the icon. `Surprise me` rolls all three, so the
 * generator is a button over the same closed set rather than a second system, and
 * every state it can produce is one the grid can also reach.
 *
 * The ink is offered as swatches rather than as a colour picker on purpose. Only
 * hues are stored — the lightness of both the disc and the icon comes from the
 * theme — so no combination the rows can express is illegible. A free picker
 * would need a contrast check to promise that, and a contrast check is a curated
 * palette arrived at the hard way.
 *
 * Nothing is saved until Save is pressed. Persisting on every tap would be
 * simpler to write and worse to use: choosing an avatar means trying several,
 * and each attempt would be a write, a request, and an avatar the visitor never
 * settled on appearing against their comments in between.
 */
@Component({
  selector: 'bah-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, AvatarComponent, IconComponent],
  template: `
    <section class="container page">
      <h1>{{ 'profile.title' | transloco }}</h1>
      <p class="lead">
        {{ 'account.signedInAs' | transloco: { name: auth.user()?.displayName } }}
      </p>

      <!--
        Two labelled regions, and the page now has a real heading hierarchy: h1,
        then one h2 per thing that can be changed, then h3 for the three parts of
        the avatar. That is worth having for its own sake, and it also gives each
        half an accessible name — without which "the Save button" and "the status
        message" are ambiguous to a screen reader and to a test alike, there being
        two of each on this page.

        The name comes first because it is the consequential choice of the two: it
        is what a byline actually says, and somebody arriving here to stop their
        real name being public should not have to scroll past a colour picker.
      -->
      <section class="block" aria-labelledby="name-heading">
        <h2 id="name-heading">{{ 'profile.pickName' | transloco }}</h2>
        <p class="section-lead">{{ 'profile.nameLead' | transloco }}</p>

        <!--
          A real label, hidden, rather than leaning on the placeholder. The
          placeholder is the provider's name — what an empty field falls back to —
          and a placeholder doing that job as well as naming the field leaves a
          screen reader with nothing once anything is typed.
        -->
        <div class="name-row">
          <label class="visually-hidden" for="chosen-name">
            {{ 'profile.pickName' | transloco }}
          </label>
          <input
            id="chosen-name"
            class="input"
            type="text"
            autocomplete="nickname"
            [attr.placeholder]="providerName()"
            [attr.maxlength]="NAME_MAX"
            aria-describedby="chosen-name-hint"
            [ngModel]="draftName()"
            (ngModelChange)="draftName.set($event)"
            [disabled]="busy()"
          />

          <button
            type="button"
            class="btn btn-primary"
            [disabled]="!canSaveName()"
            (click)="saveName()"
          >
            {{ 'profile.save' | transloco }}
          </button>
        </div>

        <p id="chosen-name-hint" class="hint">
          {{ 'profile.nameHint' | transloco: { max: NAME_MAX } }}
        </p>

        <p class="status" role="status" aria-live="polite">
          @if (nameSaved()) {
            {{ 'profile.nameSaved' | transloco }}
          } @else if (nameFailed()) {
            {{ 'profile.nameFailed' | transloco }}
          }
        </p>
      </section>

      <section class="block" aria-labelledby="avatar-heading">
        <h2 id="avatar-heading">{{ 'profile.avatarTitle' | transloco }}</h2>

        <div class="card elev-sm preview">
          <div class="slot">
            <bah-avatar [avatar]="token()" [name]="shownName()" [size]="88" />
          </div>
          <div class="preview-text">
            <p>{{ 'profile.avatarLead' | transloco }}</p>
          </div>
        </div>

        <h3>{{ 'profile.pickSubject' | transloco }}</h3>
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

        <h3>{{ 'profile.pickTint' | transloco }}</h3>
        <div
          class="grid tints"
          role="radiogroup"
          [attr.aria-label]="'profile.pickTint' | transloco"
        >
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

        <h3>{{ 'profile.pickInk' | transloco }}</h3>
        <!--
        Each swatch is the motif and tint currently chosen, drawn in that ink,
        rather than a bare colour chip. The question being asked is "how does my
        avatar look in this colour", and a row of circles of pure hue answers a
        different one — the wash and the fixed lightness mean the ink on the disc
        is never the colour the chip would show.
      -->
        <div class="grid inks" role="radiogroup" [attr.aria-label]="'profile.pickInk' | transloco">
          @for (ink of INKS; track $index) {
            <button
              type="button"
              role="radio"
              class="choice"
              [class.selected]="choice().ink === ink"
              [attr.aria-checked]="choice().ink === ink"
              [attr.aria-label]="
                ink === null
                  ? ('profile.inkDefault' | transloco)
                  : ('profile.ink' | transloco: { number: ink + 1 })
              "
              [tabindex]="choice().ink === ink ? 0 : -1"
              [disabled]="busy()"
              (click)="pickInk(ink)"
            >
              <bah-avatar [avatar]="inkToken(ink)" [size]="52" />
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

      <!-- Outside both sections: signing out is not part of choosing an avatar,
           and it sat inside that block only because there was nothing else here.
           Politely at the end, rather than the single unlabelled click in the
           header it used to be (ADR 7). -->
      <div class="actions sign-out-row">
        <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="signOut()">
          <bah-icon name="logout" [size]="15" />
          {{ 'account.signOut' | transloco }}
        </button>
      </div>
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

    /* One per changeable thing, so they carry a little more weight than the
       sub-headings inside the avatar block. */
    h2 {
      font-size: 17px;
      margin: 0 0 10px;
    }

    h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 32px 0 14px;
    }

    /* The divider does the separating, so the sections do not need a large gap as
       well — two blocks 60px apart with a rule between them reads as two pages. */
    .block + .block {
      margin-top: 40px;
      padding-top: 34px;
      border-top: 1px solid var(--color-divider);
    }

    .lead {
      margin: 0 0 24px;
      line-height: 1.55;
      opacity: 0.75;
    }

    .section-lead {
      margin: 0 0 14px;
      font-size: 13.8px;
      line-height: 1.55;
      opacity: 0.7;
      max-width: 52ch;
    }

    .name-row {
      display: flex;
      gap: 10px;
      align-items: center;
      max-width: 460px;
    }

    /* The field takes the room; the button stays the width of its label. Without
       the basis the input collapses to its content on Safari. */
    .name-row .input {
      flex: 1 1 auto;
      min-width: 0;
    }

    .name-row .btn {
      flex: none;
    }

    /* Same treatment as the composer's markdown hint, so the two read as the same
       kind of remark rather than as two different weights of small print. */
    .hint {
      margin: 8px 0 0;
      font-size: 12px;
      opacity: 0.5;
      max-width: 52ch;
      line-height: 1.5;
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

    .inks {
      max-width: 490px;
      /* Seven, because the default ink is a choice in the row rather than an
         absence of one. Same reasoning as the tints for keeping them on one
         line: 6 + 1 would read as a scale plus an afterthought, which is
         precisely backwards — the default is what most accounts have. */
      grid-template-columns: repeat(7, 1fr);
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

    .sign-out-row {
      margin-top: 40px;
      padding-top: 28px;
      border-top: 1px solid var(--color-divider);
    }

    .sign-out-row .btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
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
  protected readonly INKS = AVATAR_INKS;

  /**
   * What is selected but not yet saved.
   *
   * Starts from whatever the account holds; from the first icon on the first
   * tint in the default ink for somebody who has never chosen, so the page opens
   * on a real avatar rather than on nothing selected.
   */
  protected readonly choice = signal<Avatar>({ icon: AVATAR_ICONS[0], tint: 0, ink: null });

  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly failed = signal(false);

  /**
   * Thirty, the same limit `DisplayName.MAX` enforces server-side.
   *
   * Duplicated rather than fetched, and the duplication is the point of the
   * `maxlength` attribute: the field stops accepting characters at the limit
   * instead of letting somebody type a paragraph and then answering 400. The
   * server is still the authority — this is a courtesy, not a check.
   */
  protected readonly NAME_MAX = 30;

  protected readonly draftName = signal('');
  protected readonly nameSaved = signal(false);
  protected readonly nameFailed = signal(false);

  /** What the byline says now: the chosen name, or the provider's. */
  protected readonly shownName = computed(() => this.auth.user()?.displayName ?? '');

  /**
   * The provider's name, used as the field's placeholder.
   *
   * Derived rather than stored: when no choice has been made, `displayName` *is*
   * what the provider said. Once one has, the placeholder no longer matters —
   * the field is filled, so nothing shows it.
   */
  protected readonly providerName = computed(() => {
    const user = this.auth.user();
    return user?.chosenName ?? user?.displayName ?? '';
  });

  /** The stored choice, as the field would spell it: empty means "no choice". */
  private readonly storedName = computed(() => this.auth.user()?.chosenName ?? '');

  /**
   * Trimmed on both sides of the comparison, so pressing Save after adding a
   * trailing space is inert rather than a write the server normalises back to
   * exactly what was already there.
   */
  protected readonly canSaveName = computed(
    () => !this.busy() && this.draftName().trim() !== this.storedName().trim(),
  );

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

    // The name field, on the same terms. Written unconditionally rather than only
    // when non-empty: clearing the choice has to empty the field too, and an
    // `if (name)` here would leave the pseudonym sitting in it after it was
    // deliberately removed.
    effect(() => {
      this.draftName.set(this.storedName());
    });
  }

  /** The grid's own swatches: each subject drawn on the tint currently chosen. */
  protected tokenFor(icon: (typeof AVATAR_ICONS)[number]): string {
    return formatAvatar({ ...this.choice(), icon });
  }

  /** And the tint row: each tint drawn under the subject currently chosen. */
  protected tintToken(tint: number): string {
    return formatAvatar({ ...this.choice(), tint });
  }

  /** And the ink row, likewise: the chosen avatar in each ink it could take. */
  protected inkToken(ink: number | null): string {
    return formatAvatar({ ...this.choice(), ink });
  }

  protected pickIcon(icon: (typeof AVATAR_ICONS)[number]): void {
    this.choice.update((current) => ({ ...current, icon }));
    this.clearStatus();
  }

  protected pickTint(tint: number): void {
    this.choice.update((current) => ({ ...current, tint }));
    this.clearStatus();
  }

  protected pickInk(ink: number | null): void {
    this.choice.update((current) => ({ ...current, ink }));
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

  /**
   * Saves the chosen name, or clears it when the field has been emptied.
   *
   * An empty field sends `null`, which is a clear rather than a blank name —
   * the byline goes back to what the provider said, and so do the comments already
   * posted. That symmetry is why there is no separate "remove" button.
   */
  protected async saveName(): Promise<void> {
    if (!this.canSaveName()) return;

    this.busy.set(true);
    this.clearNameStatus();
    try {
      const wanted = this.draftName().trim();
      await this.auth.chooseName(wanted === '' ? null : wanted);
      this.nameSaved.set(true);
    } catch {
      // Said out loud. The server refuses a name that is too short, too long or
      // carries formatting characters, and a silent failure here would look like
      // a save that worked until the next page load contradicted it.
      this.nameFailed.set(true);
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

  private clearNameStatus(): void {
    this.nameSaved.set(false);
    this.nameFailed.set(false);
  }
}
