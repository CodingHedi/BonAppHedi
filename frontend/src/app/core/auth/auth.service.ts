import { Injectable, computed, inject, signal } from '@angular/core';
import { AUTH_API } from '../api/auth-api';
import type { AuthProvider, AuthUser, ProviderId } from '../api/models';

interface AuthUserState {
  readonly status: 'unknown' | 'resolved';
  readonly user: AuthUser | null;
}

/**
 * Owns "who is signed in" for the whole app.
 *
 * Deliberately thin. It holds the current user and the configured provider list
 * and nothing else — no guards, no redirects, no per-route rules. Reading a
 * recipe never touches this, so making it load-bearing for navigation would put
 * an identity check in front of pages that must stay anonymous.
 *
 * `isAdmin` here decides what the UI offers, never what the server permits. The
 * admin area is guarded again on the backend in milestone 2; anything decided
 * only in a browser is a suggestion.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AUTH_API);

  private readonly current = signal<AuthUserState>({ status: 'unknown', user: null });
  private readonly configured = signal<readonly AuthProvider[] | null>(null);

  readonly user = computed(() => this.current().user);
  readonly signedIn = computed(() => this.current().user !== null);
  readonly isAdmin = computed(() => this.current().user?.isAdmin === true);

  /**
   * Distinguishes "not signed in" from "we have not asked yet", so the comment
   * box can avoid flashing the signed-out prompt at someone who is in fact
   * signed in — a flicker on every page load that reads as a bug.
   */
  readonly resolved = computed(() => this.current().status === 'resolved');

  /** Null until asked. Loaded on demand: an anonymous reader never needs it. */
  readonly providers = this.configured.asReadonly();

  /** Called once at bootstrap, alongside theme and locale. */
  async init(): Promise<void> {
    const user = await this.api.session();
    this.current.set({ status: 'resolved', user });
  }

  async loadProviders(): Promise<void> {
    if (this.configured() !== null) return;
    this.configured.set(await this.api.providers());
  }

  /**
   * Begins sign-in. In milestone 2 this navigates away and never returns, so
   * nothing may be sequenced after it — see the note on `AuthApi.signIn`.
   */
  async signIn(provider: ProviderId): Promise<void> {
    await this.api.signIn(provider);
    await this.init();
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    this.current.set({ status: 'resolved', user: null });
  }

  /**
   * Records the avatar chosen on the profile page.
   *
   * The signal is set from what the server sent back rather than from the token
   * that was sent up, so the UI shows what was stored rather than what was asked
   * for.
   *
   * That updates the places reading this service — the profile page and the
   * header. Comments carry their author's avatar from the comments endpoint, and
   * pick it up the next time a thread is loaded; the server resolves it through
   * the account rather than from a copy on the row, which is what makes them
   * follow at all (ADR 7).
   */
  async chooseAvatar(avatar: string): Promise<void> {
    const user = await this.api.chooseAvatar(avatar);
    this.current.set({ status: 'resolved', user });
  }
}
