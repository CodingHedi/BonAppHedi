import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Key inherited from the design prototype so an existing preference survives
 * the rewrite. The same key is read by the blocking script in index.html.
 */
const STORAGE_KEY = 'bah-organic-theme';

const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#efe6d6',
  dark: '#241f1a',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /**
   * The prototype only knew 'light' and 'dark'. 'system' is added because
   * respecting the OS setting is the correct default for a first-time visitor —
   * but an explicit choice must still win over it, hence three states rather
   * than a boolean.
   */
  private readonly pref = signal<ThemePref>('system');

  /** Kept live so switching the OS theme updates the page without a reload. */
  private readonly systemPrefersDark = signal(false);

  readonly preference = this.pref.asReadonly();

  readonly resolved = computed<ResolvedTheme>(() => {
    const pref = this.pref();
    if (pref === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return pref;
  });

  readonly isDark = computed(() => this.resolved() === 'dark');

  constructor() {
    effect(() => this.paint(this.resolved()));
  }

  init(): void {
    const view = this.document.defaultView;
    if (!view) return;

    const query = view.matchMedia('(prefers-color-scheme: dark)');
    this.systemPrefersDark.set(query.matches);
    query.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));

    try {
      const stored = view.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        this.pref.set(stored);
      }
    } catch {
      // Storage unavailable — stay on 'system', which is a sensible default.
    }
  }

  /**
   * The header button is a two-state toggle, so this resolves 'system' to
   * whatever it currently looks like and flips that. Someone on a dark OS who
   * presses the button expects light, not a no-op.
   */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  set(pref: ThemePref): void {
    this.pref.set(pref);
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // Preference is lost on reload but the session still works.
    }
  }

  private paint(theme: ResolvedTheme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[theme]);
  }
}
