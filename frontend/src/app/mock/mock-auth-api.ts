import { DOCUMENT, Injectable, inject } from '@angular/core';
import type { AuthApi } from '../core/api/auth-api';
import type { AuthProvider, AuthUser, ProviderId } from '../core/api/models';
import { SocialStore } from './social-store';

const SESSION_KEY = 'bah-mock-session';

/**
 * What the mock keeps, which is one field more than the contract exposes.
 *
 * The server can always fall back to `app_user.display_name` because the provider
 * refreshes it on every login. The mock has no such column, so it remembers the
 * provider's name itself — otherwise clearing a chosen name would have nothing to
 * restore and would leave the byline holding the pseudonym it was meant to undo.
 */
interface StoredSession extends AuthUser {
  readonly providerName: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => sleep(120 + Math.random() * 200);

/**
 * Stands in for `GET /api/auth/providers`.
 *
 * Hardcoded here only because there is no server yet to read `application.yml`.
 * The shape is the point: the UI receives a list and renders it, so switching
 * Facebook on in milestone 2 is a config line and a restart, with no frontend
 * change (ADR 0003). Cutting this array to `[]` is a fair test of the
 * sign-in-unavailable state.
 */
const CONFIGURED_PROVIDERS: readonly AuthProvider[] = [
  { id: 'google', label: 'Google' },
  { id: 'facebook', label: 'Facebook' },
];

/**
 * Who you become on the mock. A real profile arrives from the provider in M2.
 *
 * Both carry a chosen avatar token, where they used to carry `avatarUrl: null` —
 * a provider picture is no longer part of a profile at all (ADR 7). Two
 * different ones, because one repeated avatar in a thread would hide exactly the
 * bug where every comment renders the signed-in visitor's choice.
 */
const MOCK_USERS: Record<ProviderId, AuthUser> = {
  google: {
    id: 'mock-google-1',
    displayName: 'Hedi',
    // Null, because a freshly signed-in account has chosen nothing: the byline
    // shows what the provider said, which is the state the profile page's empty
    // field has to mean.
    chosenName: null,
    avatar: 'pot/0',
    isAdmin: true,
  },
  facebook: {
    id: 'mock-facebook-1',
    displayName: 'Camille',
    chosenName: null,
    avatar: 'citrus/4',
    isAdmin: false,
  },
};

/**
 * A fake OAuth round trip.
 *
 * The session is persisted to localStorage rather than held in memory, because
 * the real thing is a cookie that survives a reload — and a mock that forgets
 * who you are on refresh would make the app look broken in the one way the
 * finished product will not be.
 */
@Injectable({ providedIn: 'root' })
export class MockAuthApi implements AuthApi {
  private readonly document = inject(DOCUMENT);
  private readonly social = inject(SocialStore);

  async providers(): Promise<readonly AuthProvider[]> {
    await latency();
    return CONFIGURED_PROVIDERS;
  }

  async session(): Promise<AuthUser | null> {
    return this.read();
  }

  async signIn(provider: ProviderId): Promise<void> {
    await latency();

    const user = MOCK_USERS[provider];
    if (!user) throw new Error(`provider "${provider}" is not configured`);

    // The provider's name is what it is at sign-in, since nothing has been chosen.
    this.write({ ...user, providerName: user.displayName });
  }

  async signOut(): Promise<void> {
    await latency();
    this.write(null);
  }

  async chooseAvatar(avatar: string): Promise<AuthUser> {
    await latency();

    const user = this.read();
    // The real endpoint answers 401 here. Throwing keeps the two halves behaving
    // the same way for a caller, which is the point of the seam — the profile
    // page is behind a guard, so reaching this means something is wrong.
    if (!user) throw new Error('nobody is signed in');

    // Validated server-side against the same closed set, and deliberately not
    // validated here: a mock that silently accepted what the server refuses
    // would hide exactly the bug worth finding.
    const updated: StoredSession = { ...user, avatar };
    this.write(updated);
    return updated;
  }

  /**
   * The provider's name is kept, not overwritten, so clearing the choice has
   * something to fall back to — which is exactly how the column works.
   *
   * The rename of comments already posted is modelled too. It is the behaviour
   * the feature exists for, and a mock that skipped it would leave the e2e suite
   * asserting the easy half.
   */
  async chooseName(displayName: string | null): Promise<AuthUser> {
    await latency();

    const stored = this.read();
    if (!stored) throw new Error('nobody is signed in');

    // Trimmed and collapsed to match `DisplayName.normalise` server-side, but
    // deliberately not length- or character-checked: a mock that accepted what
    // the server refuses would hide the bug worth finding, exactly as with the
    // avatar above.
    const chosen = displayName?.trim() ? displayName.trim().replace(/[ \t]+/g, ' ') : null;
    const shown = chosen ?? stored.providerName;

    const updated: StoredSession = { ...stored, displayName: shown, chosenName: chosen };

    this.write(updated);
    this.social.renameAuthor(shown);

    return updated;
  }

  /**
   * Reads the session, filling in the two fields a hand-planted one may lack.
   *
   * The e2e helpers write this key directly to sign a test in, so the stored
   * object is not guaranteed to carry everything the current model has. Defaulted
   * here rather than at each use: `providerName` in particular has exactly one
   * honest default — the name currently shown, which is the provider's precisely
   * when no choice has been made.
   */
  private read(): StoredSession | null {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<StoredSession> & AuthUser;
      return {
        ...parsed,
        chosenName: parsed.chosenName ?? null,
        providerName: parsed.providerName ?? parsed.displayName,
      };
    } catch {
      // Private mode, blocked storage, or a half-written value. Signed out is
      // the safe reading of "we cannot tell who this is".
      return null;
    }
  }

  private write(user: StoredSession | null): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (user) storage?.setItem(SESSION_KEY, JSON.stringify(user));
      else storage?.removeItem(SESSION_KEY);
    } catch {
      // Same as above: a lost convenience, not a failure worth surfacing.
    }
  }
}
