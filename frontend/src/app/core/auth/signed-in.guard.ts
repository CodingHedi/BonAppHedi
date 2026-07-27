import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { LocaleService } from '../i18n/locale.service';
import { SEGMENTS } from '../i18n/locale';

/**
 * Keeps the profile page from being a screen about nobody.
 *
 * Like `adminGuard`, this decides what to *render* and is not a security
 * boundary: the endpoint behind the page checks the session itself, because
 * anything a browser decides about its own permissions is a suggestion. The
 * session is resolved before the router runs — `AuthService.init()` is awaited in
 * an app initializer — so this never has to deal with "not asked yet".
 *
 * Unlike `adminGuard` it sends the visitor to the sign-in page rather than home,
 * carrying where they were going. Being signed out here is an ordinary state with
 * an obvious remedy, and there is no reason to hide that a profile page exists —
 * whereas an admin area confirming itself to a stranger tells them only that.
 */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const locale = inject(LocaleService);
  const router = inject(Router);

  if (auth.signedIn()) return true;

  const active = locale.locale();
  return router.createUrlTree(['/', active, SEGMENTS[active].signIn], {
    queryParams: { returnTo: state.url },
  });
};
