import { InjectionToken } from '@angular/core';
import type { AuthProvider, AuthUser, ProviderId } from './models';

/**
 * Sign-in, sign-out, and who the visitor currently is.
 *
 * Reading a recipe never requires any of this. It is only reached when someone
 * tries to comment, which is the one thing on the public site that needs a name
 * attached to it.
 */
export interface AuthApi {
  /**
   * Only providers the server holds credentials for. An empty array is a valid
   * answer — it means sign-in is switched off, and the UI must say so rather
   * than render a row of buttons that cannot work.
   */
  providers(): Promise<readonly AuthProvider[]>;

  /** Null for a visitor who has not signed in. Not an error: that is the norm. */
  session(): Promise<AuthUser | null>;

  /**
   * Starts sign-in with the given provider.
   *
   * The two implementations of this differ more than the signature suggests, and
   * that is deliberate — it is exactly what the seam is hiding:
   *
   *   mock (M1) — flips to a fake signed-in user and resolves.
   *   HTTP (M2) — navigates the browser to `/oauth2/authorization/{id}` and the
   *               returned promise never settles, because the page is being torn
   *               down. The visitor comes back to a fresh app that finds its
   *               session through `session()`.
   *
   * Callers must therefore treat this as "sign-in has begun", never as
   * "sign-in has completed" — do not await it and then assume a user exists.
   */
  signIn(provider: ProviderId): Promise<void>;

  signOut(): Promise<void>;
}

export const AUTH_API = new InjectionToken<AuthApi>('AuthApi');
