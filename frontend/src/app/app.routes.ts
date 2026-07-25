import { inject } from '@angular/core';
import type { Route, Routes } from '@angular/router';
import { LOCALES, SEGMENTS, type Locale } from './core/i18n/locale';
import { LocaleService } from './core/i18n/locale.service';

/**
 * Routes are generated per locale rather than written once with a `:locale`
 * parameter, because the segments themselves are translated —
 * `/fr/recettes/:slug` and `/en/recipes/:slug` are genuinely different paths.
 * A `:locale` param would only work if every language shared English segments,
 * which defeats the point of localized URLs.
 */
function routesFor(locale: Locale): Route {
  const seg = SEGMENTS[locale];

  return {
    path: locale,
    // Applied on every entry so a deep link straight into /en/... starts in
    // English rather than inheriting whatever locale was active before.
    canActivate: [
      () => {
        inject(LocaleService).apply(locale);
        return true;
      },
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/recipe-list/recipe-list-page').then((m) => m.RecipeListPage),
      },
      {
        path: `${seg.recipes}/:slug`,
        loadComponent: () =>
          import('./pages/recipe-detail/recipe-detail-page').then((m) => m.RecipeDetailPage),
      },
      {
        path: seg.legal,
        loadComponent: () => import('./pages/legal/legal-page').then((m) => m.LegalPage),
      },
      {
        path: seg.privacy,
        loadComponent: () => import('./pages/privacy/privacy-page').then((m) => m.PrivacyPage),
      },
      {
        path: '**',
        loadComponent: () => import('./pages/not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  };
}

export const routes: Routes = [
  ...LOCALES.map(routesFor),
  {
    // A bare `/` carries no language, so pick one from what the visitor has
    // actually told us: a previous explicit choice, then Accept-Language, then FR.
    path: '',
    pathMatch: 'full',
    redirectTo: () => `/${inject(LocaleService).preferred()}`,
  },
  {
    // Anything else unprefixed (someone hand-typing /recettes/babka, or an old
    // inbound link) lands in the default language rather than on a 404.
    path: '**',
    redirectTo: () => `/${inject(LocaleService).preferred()}`,
  },
];
