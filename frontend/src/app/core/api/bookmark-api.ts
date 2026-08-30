import { InjectionToken } from '@angular/core';
import type { Locale } from '../i18n/locale';

/**
 * A signed-in reader's saved recipes (ADR 16).
 *
 * Everything here speaks recipe **keys**, never slugs. A slug identifies a
 * recipe within one language, so a list held as slugs empties itself the first
 * time somebody switches; a key is the same string in both and cannot be
 * renamed.
 *
 * Nothing on this interface is reachable without a session, and that is the
 * point rather than a limitation: an anonymous reader's bookmarks live in their
 * browser and never come here at all. `BookmarksService` is what decides which
 * of the two a given reader is using, and it is the only caller.
 */
export interface BookmarkApi {
  /** The reader's keys, newest first. Rejects with 401 when nobody is signed in. */
  list(): Promise<readonly string[]>;

  /**
   * Adds the browser's list to the account's and answers with everything.
   *
   * A union, never a replacement — sending an empty list must not empty the
   * account, which is what would happen to somebody signing in on a second
   * device. Idempotent, so a failed call is retried rather than repaired.
   */
  merge(keys: readonly string[]): Promise<readonly string[]>;

  /** Saves or unsaves one recipe, addressed by the slug of the page you are on. */
  set(slug: string, bookmarked: boolean, locale: Locale): Promise<void>;
}

export const BOOKMARK_API = new InjectionToken<BookmarkApi>('BookmarkApi');
