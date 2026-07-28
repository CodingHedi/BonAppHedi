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

  /**
   * Records the avatar chosen on the profile page and answers with the account
   * as it now stands.
   *
   * `avatar` is a token — `carrot/3` — from the closed set in
   * `core/avatar/avatar-token.ts`, never a URL (ADR 7). The server validates it
   * against its own copy of that set and rejects anything else, so a caller
   * inventing a token gets an error rather than an account with an avatar that
   * renders as nothing.
   *
   * The whole `AuthUser` comes back rather than nothing, so the caller updates
   * from what was stored instead of from what it hoped would be.
   */
  chooseAvatar(avatar: string): Promise<AuthUser>;

  /**
   * Records the name chosen on the profile page, or clears it.
   *
   * `null` — or a blank string — clears the choice, after which the byline shows
   * the provider's name again. So there is no separate "forget my name" call:
   * sending nothing already says it, and the server treats blank as a clear
   * rather than as a bad request precisely so a pseudonym can be undone.
   *
   * The server also rewrites the name on comments already posted. That is not
   * cosmetic and is the reason this exists: somebody setting a pseudonym because
   * they do not want their real name public would otherwise keep it on
   * everything they had already written.
   */
  chooseName(displayName: string | null): Promise<AuthUser>;
}

export const AUTH_API = new InjectionToken<AuthApi>('AuthApi');
