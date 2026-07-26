import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { LocaleService } from '../i18n/locale.service';

/**
 * Keeps the admin area out of the public site's way.
 *
 * This is not the security boundary and must never be mistaken for one. The
 * session is resolved before the router runs — `AuthService.init()` is awaited
 * in an app initializer — so this only decides whether to *render* a screen. In
 * milestone 2 every admin endpoint checks the session's role again server-side,
 * because anything a browser decides about its own permissions is a suggestion.
 *
 * A visitor who is not an admin is sent home rather than shown a 403. There is
 * nothing useful to tell them: either they are signed out, in which case the
 * page they wanted does not concern them, or they are signed in without the
 * role, in which case confirming the area exists tells them only that.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const locale = inject(LocaleService);
  const router = inject(Router);

  return auth.isAdmin() ? true : router.createUrlTree(locale.link());
};
