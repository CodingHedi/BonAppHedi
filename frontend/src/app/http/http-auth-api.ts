import { HttpClient } from '@angular/common/http';
import { DOCUMENT, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AuthApi } from '../core/api/auth-api';
import type { AuthProvider, AuthUser, ProviderId } from '../core/api/models';

/**
 * Sign-in against the real server.
 *
 * The interesting method is `signIn`, and it is interesting because it is not a
 * request at all — see the note on `AuthApi.signIn`, which this half of the seam
 * was written against.
 */
@Injectable()
export class HttpAuthApi implements AuthApi {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  /**
   * Only what the server holds credentials for. An empty array is a real answer
   * and means sign-in is switched off, which the sign-in row renders as an
   * unavailable notice rather than as buttons that cannot work (ADR 0003).
   */
  async providers(): Promise<readonly AuthProvider[]> {
    return firstValueFrom(this.http.get<AuthProvider[]>('/api/auth/providers'));
  }

  /**
   * Null for a visitor who has not signed in, which is the normal state of
   * almost every request to this site rather than a failure.
   *
   * The server answers 204 with no body and Angular reads that as `null`, so
   * there is nothing to translate. It is deliberately not a 401: a healthy page
   * should not fill the console with authentication errors.
   */
  async session(): Promise<AuthUser | null> {
    return firstValueFrom(this.http.get<AuthUser | null>('/api/auth/session'));
  }

  /**
   * Leaves the application.
   *
   * OAuth is a full-page redirect to the provider and back, so this is a browser
   * navigation rather than an XHR — the authorization endpoint sets state in the
   * session and answers 302 to Google, neither of which survives being fetched.
   *
   * The returned promise never settles, on purpose. The document is being torn
   * down, and a caller that sequenced work after this would be running it in a
   * page that is going away; the visitor comes back to a fresh application that
   * finds its session through `session()`.
   */
  async signIn(provider: ProviderId): Promise<void> {
    const view = this.document.defaultView;

    // The page being left, so the server can send them back to it afterwards.
    // Without this everyone lands on the home page, which reads as the sign-in
    // having failed when in fact it worked. The server refuses anything that is
    // not a path on this site, so a rewritten link cannot turn its own sign-in
    // into a redirect somewhere else.
    //
    // An explicit ?returnTo= wins over the current path, which is what makes the
    // dedicated sign-in page work: signing in from there should return you to
    // wherever you were when you clicked the footer link, not to the sign-in
    // page you have just finished with.
    const here = view ? this.returnTarget(view) : '/';

    view?.location.assign(
      `/oauth2/authorization/${encodeURIComponent(provider)}?returnTo=${encodeURIComponent(here)}`,
    );

    return new Promise<void>(() => undefined);
  }

  /**
   * POST, and handled by Spring's logout filter rather than by a controller, so
   * that invalidating the session and clearing the cookie are one thing that
   * cannot half-happen. Being a POST is also what puts it behind CSRF.
   */
  async signOut(): Promise<void> {
    await firstValueFrom(this.http.post<void>('/api/auth/logout', null));
  }

  /**
   * PUT, because choosing again replaces the choice: doing it twice leaves the
   * account exactly as doing it once did.
   *
   * Behind CSRF like every other write here, which works only because
   * `CsrfCookieFilter` server-side forces the XSRF-TOKEN cookie to exist for
   * Angular's HttpClient to echo back (ADR 0003).
   */
  async chooseAvatar(avatar: string): Promise<AuthUser> {
    return firstValueFrom(this.http.put<AuthUser>('/api/auth/avatar', { avatar }));
  }

  private returnTarget(view: Window): string {
    const explicit = new URLSearchParams(view.location.search).get('returnTo');
    if (explicit) return explicit;

    return `${view.location.pathname}${view.location.search}`;
  }
}
