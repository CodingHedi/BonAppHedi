import {
  type ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withXsrfConfiguration } from '@angular/common/http';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { TRANSLOCO_TRANSPILER, provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { DEFAULT_LOCALE, LOCALES, LOCALE_IDS } from './core/i18n/locale';
import { LocaleService } from './core/i18n/locale.service';
import { PluralTranspiler } from './core/i18n/plural-transpiler';
import { HttpTranslocoLoader } from './core/i18n/transloco-loader';
import { ThemeService } from './core/theme/theme.service';
import { LogoPaletteService } from './core/brand/logo-palette.service';
import { RECIPE_API } from './core/api/recipe-api';
import { SOCIAL_API } from './core/api/social-api';
import { AUTH_API } from './core/api/auth-api';
import { AuthService } from './core/auth/auth.service';
import { MockRecipeApi } from './mock/mock-recipe-api';
import { MockSocialApi } from './mock/mock-social-api';
import { MockAuthApi } from './mock/mock-auth-api';
import { ADMIN_API } from './core/api/admin-api';
import { MockAdminApi } from './mock/mock-admin-api';
import { HttpRecipeApi } from './http/http-recipe-api';
import { HttpSocialApi } from './http/http-social-api';
import { HttpAuthApi } from './http/http-auth-api';
import { HttpAdminApi } from './http/http-admin-api';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),

    provideHttpClient(
      withFetch(),
      // Matches Spring Security's CookieCsrfTokenRepository defaults, so the
      // M2 swap needs no interceptor of our own.
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),

    provideTransloco({
      config: {
        availableLangs: [...LOCALES],
        defaultLang: DEFAULT_LOCALE,
        fallbackLang: DEFAULT_LOCALE,
        reRenderOnLangChange: true,
        prodMode: false,
      },
      loader: HttpTranslocoLoader,
    }),
    // ICU plural rules. Not optional: French treats zero as singular
    // ("0 étoile") and English does not ("0 stars"), and no hand-rolled
    // pluralizer gets that right for both — so this one does not try, and asks
    // Intl.PluralRules instead.
    //
    // Must stay after provideTransloco(), which registers DefaultTranspiler
    // against the same token; the later provider is the one that wins.
    { provide: TRANSLOCO_TRANSPILER, useClass: PluralTranspiler },

    // Read from the URL prefix at bootstrap so DatePipe and number formatting
    // agree with the page's language.
    {
      provide: LOCALE_ID,
      useFactory: () => LOCALE_IDS[inject(LocaleService).locale()],
    },

    // The milestone-1 → milestone-2 seam, now with both sides of it present.
    // Components inject RECIPE_API and never learn which implementation they
    // got; this is the only place that knows, and `useMocks` is the only line
    // that decides. Nothing in the component tree changes either way.
    //
    // Still defaulting to the mocks: flipping it is what the acceptance test
    // does, and the e2e suite cannot run against the real API until signing in
    // has an answer that does not involve a live Google.
    ...(environment.useMocks
      ? [
          { provide: RECIPE_API, useClass: MockRecipeApi },
          { provide: SOCIAL_API, useClass: MockSocialApi },
          { provide: AUTH_API, useExisting: MockAuthApi },
          { provide: ADMIN_API, useClass: MockAdminApi },
        ]
      : [
          { provide: RECIPE_API, useClass: HttpRecipeApi },
          { provide: SOCIAL_API, useClass: HttpSocialApi },
          { provide: AUTH_API, useClass: HttpAuthApi },
          { provide: ADMIN_API, useClass: HttpAdminApi },
        ]),

    provideAppInitializer(() => {
      inject(ThemeService).init();
      inject(LocaleService).init();
      // After ThemeService: the shuffle picks colours legible against the
      // resolved theme's ground, so it must not run while that is still the
      // default.
      inject(LogoPaletteService).init();
      // Awaited: the comment box must not paint its signed-out prompt to
      // someone who is in fact signed in, and every other initializer here is
      // synchronous, so this costs one storage read at bootstrap.
      return inject(AuthService).init();
    }),
  ],
};
