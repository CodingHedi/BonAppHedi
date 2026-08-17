import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { ThemeService } from '../theme/theme.service';
import { type LogoSet, defaultSet, isKonami, pushKey, shuffleSet } from './logo-palette';

/**
 * Once unlocked, it stays unlocked. An easter egg that had to be re-entered on
 * every visit would be a chore rather than a find, and the whole behaviour is
 * three colours in a header — there is nothing here worth protecting.
 */
const STORAGE_KEY = 'bah-konami';

/**
 * The Konami code, and what it unlocks: the logo draws itself in a different
 * legible set of the brand palette on every load and every click of it.
 *
 * Scoped to the logo deliberately. The same shuffle applied to the accent
 * tokens would move colours that every contrast decision on the site depends
 * on — tags, buttons, the rating stars — and turn a joke into a accessibility
 * regression that only some visitors can see. The lockup is self-contained:
 * three blocks, one ground, one rule.
 */
@Injectable({ providedIn: 'root' })
export class LogoPaletteService {
  private readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);

  private readonly unlockedState = signal(false);
  private readonly shuffled = signal<LogoSet | null>(null);

  readonly unlocked = this.unlockedState.asReadonly();

  /**
   * What the logo should be drawn in.
   *
   * Falls back to the chosen reference whenever nothing is unlocked, so the
   * component needs no branch of its own — and follows the theme even while
   * shuffled, because the *ground* changes when the theme does and a set that
   * was legible on Paper need not be on Umber.
   */
  readonly current = computed<LogoSet>(() => {
    const shuffled = this.shuffled();
    return shuffled ?? defaultSet(this.theme.resolved());
  });

  init(): void {
    const view = this.document.defaultView;
    if (!view) return;

    try {
      if (view.localStorage.getItem(STORAGE_KEY) === 'on') {
        this.unlockedState.set(true);
        // "A new set each time we refresh": the roll happens at startup, not
        // at unlock, so a reload is itself the re-roll.
        this.reshuffle();
      }
    } catch {
      /* private mode: the egg simply stays locked, which breaks nothing */
    }

    let recent: string[] = [];
    this.document.addEventListener('keydown', (event: KeyboardEvent) => {
      // Never while typing. Without this the sequence can complete inside the
      // comment box or the search field, where the arrow keys are navigation
      // and `b` and `a` are text.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;

      recent = pushKey(recent, event.key);
      if (!isKonami(recent)) return;

      recent = [];
      this.unlockedState.set(true);
      try {
        view.localStorage.setItem(STORAGE_KEY, 'on');
      } catch {
        /* the unlock still holds for this page, which is the part that matters */
      }
      this.reshuffle();
    });
  }

  /** Re-rolls, if unlocked. Called on load and when the logo is clicked. */
  reshuffle(): void {
    if (!this.unlockedState()) return;
    this.shuffled.set(shuffleSet(this.theme.resolved(), Math.random, this.shuffled() ?? undefined));
  }
}
