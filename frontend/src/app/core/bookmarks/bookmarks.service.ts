import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { BOOKMARK_API } from '../api/bookmark-api';
import { AuthService } from '../auth/auth.service';
import { LocaleService } from '../i18n/locale.service';

/** Where an anonymous reader's list lives, and the only place it ever lives. */
const STORAGE_KEY = 'bah-bookmarks';

/**
 * Saved recipes: the browser's list, and the account's when there is one
 * (ADR 16).
 *
 * <p>One signal, two backing stores. Everything that renders reads {@link keys}
 * and never learns which of the two is behind it, which is what lets the same
 * control and the same page serve a reader with an account and one without.
 *
 * <p>**Keys, never slugs.** A slug identifies a recipe within one language, so a
 * list held as slugs empties itself the first time somebody switches. A key is
 * the same string in both and cannot be renamed.
 */
@Injectable({ providedIn: 'root' })
export class BookmarksService {
  private readonly api = inject(BOOKMARK_API);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LocaleService);

  private readonly saved = signal<readonly string[]>(readStored());

  /**
   * False when the browser refuses to store anything, which is a real state
   * rather than a hypothetical: private-browsing modes and blocked site data
   * both make `localStorage` *throw* rather than return null. The feature is
   * then unavailable and says so, instead of appearing to work and losing
   * everything on reload.
   */
  private readonly storable = signal(canStore());

  readonly keys = this.saved.asReadonly();
  readonly available = this.storable.asReadonly();
  readonly count = computed(() => this.saved().length);

  constructor() {
    /*
     * Sign-in merges, sign-out clears, and both are one effect because they are
     * one question: has the reader's identity changed since the last time this
     * ran?
     *
     * The first resolution is not a change, and getting that wrong is not
     * subtle. `resolved()` turning true with nobody signed in is what every
     * page load looks like to an anonymous reader, and treating it as a
     * transition - which `wasSignedIn` starting as null and being compared with
     * `!==` does - clears their list on each one. The whole feature then works
     * perfectly until you reload, which is a bug best found here rather than by
     * somebody who had saved twenty recipes.
     *
     * So the first observation only ever merges, never clears: arriving already
     * signed in should pull the account's list down, and arriving anonymous
     * should leave the browser's alone.
     */
    let seenSignedIn: boolean | null = null;

    effect(() => {
      if (!this.auth.resolved()) return;
      const signedIn = this.auth.signedIn();

      const first = seenSignedIn === null;
      const changed = seenSignedIn !== signedIn;
      seenSignedIn = signedIn;

      if (signedIn && (first || changed)) void this.mergeIntoAccount();
      else if (!first && changed) this.forgetLocally();
    });
  }

  has(key: string): boolean {
    return this.saved().includes(key);
  }

  /**
   * Saves or unsaves, optimistically.
   *
   * <p>The signal moves first and the request follows, because the control has
   * to answer the press immediately — and if the request fails, the browser's
   * copy is still correct and the next merge reconciles it. Waiting for the
   * server instead would make a slow connection look like a broken button.
   */
  async toggle(key: string, slug: string): Promise<void> {
    const next = this.has(key)
      ? this.saved().filter((candidate) => candidate !== key)
      : [key, ...this.saved()];

    this.saved.set(next);
    this.writeStored(next);

    if (!this.auth.signedIn()) return;

    try {
      await this.api.set(slug, next.includes(key), this.locale.locale());
    } catch {
      // Deliberately swallowed. The local list is already right, the merge on
      // the next sign-in is a union that will carry it up, and an error here is
      // not something the reader can act on.
    }
  }

  /**
   * Adopts a list that arrived in a URL, which is how sharing works.
   *
   * <p>A union with what is already saved, never a replacement: somebody opening
   * a friend's link has not asked to lose their own recipes.
   */
  async adopt(keys: readonly string[]): Promise<void> {
    const merged = [...new Set([...keys, ...this.saved()])];
    this.saved.set(merged);
    this.writeStored(merged);

    if (this.auth.signedIn()) await this.pushMerge(merged);
  }

  /** Signing in: the browser's list goes up, and everything comes back. */
  private async mergeIntoAccount(): Promise<void> {
    await this.pushMerge(this.saved());
  }

  private async pushMerge(keys: readonly string[]): Promise<void> {
    try {
      const everything = await this.api.merge(keys);
      this.saved.set(everything);
      this.writeStored(everything);
    } catch {
      // The local list stands. A failed merge is retried on the next sign-in
      // rather than repaired, which is what a union buys.
    }
  }

  /**
   * Signing out takes the local copy with it.
   *
   * <p>ADR 3 chose session cookies so that logging out genuinely revokes, and
   * `SecurityConfig` backs that with `invalidateHttpSession` and a deleted
   * cookie. Leaving a personalised list on the device would contradict the
   * promise those make, and it matters most on the shared device where somebody
   * thought to log out. The recipes are safe on the account.
   */
  private forgetLocally(): void {
    this.saved.set([]);
    this.writeStored([]);
  }

  private writeStored(keys: readonly string[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch {
      this.storable.set(false);
    }
  }
}

/**
 * Never throws, and never returns anything but an array of strings.
 *
 * <p>Anything else in there is somebody else's data, a half-written value or a
 * shape from a version of this that no longer exists, and none of those is
 * worth breaking the page over.
 */
function readStored(): readonly string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

/** Whether this browser will store anything at all, asked once by trying it. */
function canStore(): boolean {
  try {
    localStorage.setItem(`${STORAGE_KEY}-probe`, '1');
    localStorage.removeItem(`${STORAGE_KEY}-probe`);
    return true;
  } catch {
    return false;
  }
}
