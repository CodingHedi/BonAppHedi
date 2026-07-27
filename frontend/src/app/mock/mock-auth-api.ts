import { DOCUMENT, Injectable, inject } from '@angular/core';
import type { AuthApi } from '../core/api/auth-api';
import type { AuthProvider, AuthUser, ProviderId } from '../core/api/models';

const SESSION_KEY = 'bah-mock-session';

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
  google: { id: 'mock-google-1', displayName: 'Hédi', avatar: 'pot/0', isAdmin: true },
  facebook: { id: 'mock-facebook-1', displayName: 'Camille', avatar: 'citrus/4', isAdmin: false },
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

    this.write(user);
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
    const updated: AuthUser = { ...user, avatar };
    this.write(updated);
    return updated;
  }

  private read(): AuthUser | null {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      // Private mode, blocked storage, or a half-written value. Signed out is
      // the safe reading of "we cannot tell who this is".
      return null;
    }
  }

  private write(user: AuthUser | null): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (user) storage?.setItem(SESSION_KEY, JSON.stringify(user));
      else storage?.removeItem(SESSION_KEY);
    } catch {
      // Same as above: a lost convenience, not a failure worth surfacing.
    }
  }
}
