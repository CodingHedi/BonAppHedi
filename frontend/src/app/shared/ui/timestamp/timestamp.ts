import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { LocaleService } from '../../../core/i18n/locale.service';
import { absoluteDate, relativeTime } from '../../format';

/** Which form is shown before anyone clicks. */
export type TimestampForm = 'date' | 'relative';

/**
 * A date that shows the other way of saying itself when you press it.
 *
 * The two forms answer different questions and the right default depends on
 * where you are: a card in a list is being scanned for freshness, where "il y a
 * 4 jours" is the useful fact, and a recipe you have opened is being read,
 * where the date it was published is. So the list keeps relative time and the
 * recipe page leads with the date — and either can be swapped in place, since
 * the other question is always the one somebody is about to ask.
 *
 * **Swapped in place rather than shown in a bubble.** A popover has to be
 * positioned, dismissed, kept out of the sticky header's stacking context and
 * out of the card's `overflow: hidden`; a button whose label changes has none
 * of those failure modes and behaves the same under touch, mouse and keyboard.
 *
 * It is a real `<button>`, which is why `recipe-card` had to stop being one
 * enormous `<a>`: a control inside a link is invalid, and browsers resolve the
 * ambiguity by navigating, so the swap would never have fired there.
 */
@Component({
  selector: 'bah-timestamp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="swap" [attr.title]="hidden()" (click)="toggle($event)">
      <time [attr.datetime]="iso()">{{ shown() }}</time>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .swap {
      /* Inherits rather than sets: this lands inside card meta, comment
         headers and admin tables, each of which has already decided how its
         small print looks. A button that arrived with its own size would have
         to be undone at every one of them. */
      appearance: none;
      background: none;
      border: 0;
      padding: 0;
      margin: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      /* The affordance. Dotted rather than solid so it does not read as a link
         in a card whose title already is one. */
      border-bottom: 1px dotted currentColor;
      /* currentColor at the meta's own opacity is very faint; the underline is
         the only thing saying "this does something". */
      opacity: 0.9;
    }

    .swap:hover {
      opacity: 1;
      border-bottom-style: solid;
    }

    .swap:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 3px;
      border-radius: 2px;
    }
  `,
})
export class TimestampComponent {
  private readonly locale = inject(LocaleService);
  private readonly transloco = inject(TranslocoService);

  readonly iso = input.required<string>();
  /** What to show first. The list says `relative`; the recipe page says `date`. */
  readonly initial = input<TimestampForm>('relative');

  private readonly swapped = signal(false);

  private readonly form = computed<TimestampForm>(() => {
    const initial = this.initial();
    if (!this.swapped()) return initial;
    return initial === 'date' ? 'relative' : 'date';
  });

  private readonly asDate = computed(() => absoluteDate(this.iso(), this.locale.locale()) ?? '');

  /**
   * Under a minute `relativeTime` returns null, because Intl would otherwise
   * say "in 0 seconds". The caller supplies the wording, exactly as
   * `RelativeTimePipe` does — this component is a second reader of that same
   * contract rather than a place to re-decide it.
   */
  private readonly asRelative = computed(
    () =>
      relativeTime(this.iso(), this.locale.locale()) ?? this.transloco.translate('time.justNow'),
  );

  protected readonly shown = computed(() =>
    this.form() === 'date' ? this.asDate() : this.asRelative(),
  );

  /** The form you would get by pressing. Offered as the native tooltip. */
  protected readonly hidden = computed(() =>
    this.form() === 'date' ? this.asRelative() : this.asDate(),
  );

  protected toggle(event: Event): void {
    // The card is navigable by a link stretched across it, so a press here
    // must not also open the recipe. Harmless everywhere else.
    event.preventDefault();
    event.stopPropagation();
    this.swapped.update((swapped) => !swapped);
  }
}
