import { inject } from '@angular/core';
import type { Route, Routes } from '@angular/router';
import { LOCALES, SEGMENTS, type Locale } from './core/i18n/locale';
import { LocaleService } from './core/i18n/locale.service';
import { adminGuard } from './core/auth/admin.guard';
import { signedInGuard } from './core/auth/signed-in.guard';

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
        /*
         * No guard, deliberately. Saved recipes are the whole feature for a
         * reader with no account - the list lives in their browser - so a
         * signedInGuard here would hide the thing from most of the people it is
         * for. It is also the landing page for a shared `?r=` link, which
         * arrives from outside and cannot be asked to sign in first.
         */
        path: seg.bookmarks,
        loadComponent: () =>
          import('./pages/bookmarks/bookmarks-page').then((m) => m.BookmarksPage),
      },
      {
        /*
         * The admin's own sub-paths are NOT localized, unlike every public
         * route above. They are behind a sign-in, never linked and never
         * crawled, so translating them buys nothing and would mean adding a
         * RouteKey per screen. Only the section label the author reads is
         * translated.
         */
        path: seg.admin,
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin-page').then((m) => m.AdminPage),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'recipes' },
          {
            path: 'recipes',
            loadComponent: () =>
              import('./pages/admin/recipe-table/recipe-table').then((m) => m.RecipeTableComponent),
          },
          {
            path: 'recipes/new',
            loadComponent: () =>
              import('./pages/admin/recipe-editor/recipe-editor').then(
                (m) => m.RecipeEditorComponent,
              ),
          },
          {
            path: 'recipes/:key',
            loadComponent: () =>
              import('./pages/admin/recipe-editor/recipe-editor').then(
                (m) => m.RecipeEditorComponent,
              ),
          },
          {
            path: 'comments',
            loadComponent: () =>
              import('./pages/admin/moderation/moderation').then((m) => m.ModerationComponent),
          },
          {
            path: 'stats',
            loadComponent: () =>
              import('./pages/admin/analytics/analytics').then((m) => m.AnalyticsComponent),
          },
        ],
      },
      {
        /*
         * A sign-in page of its own, because until it existed the only way into
         * an account was the provider row inside a recipe's comment box — so
         * reaching the admin area meant opening a recipe and scrolling to its
         * comments. It also gives the footer somewhere to link to without
         * putting a second provider row on every page.
         */
        path: seg.signIn,
        loadComponent: () => import('./pages/sign-in/sign-in-page').then((m) => m.SignInPage),
      },
      {
        /*
         * The account page: choose an avatar, and sign out. Localized like every
         * other public route, unlike the admin area's sub-paths — this one is
         * reachable by an ordinary visitor, so its URL is part of the site rather
         * than an internal detail (ADR 7).
         */
        path: seg.profile,
        canActivate: [signedInGuard],
        loadComponent: () => import('./pages/profile/profile-page').then((m) => m.ProfilePage),
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
