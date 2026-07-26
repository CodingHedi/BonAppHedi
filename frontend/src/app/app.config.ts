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
import { provideTransloco } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';

import { routes } from './app.routes';
import { DEFAULT_LOCALE, LOCALES, LOCALE_IDS } from './core/i18n/locale';
import { LocaleService } from './core/i18n/locale.service';
import { HttpTranslocoLoader } from './core/i18n/transloco-loader';
import { ThemeService } from './core/theme/theme.service';
import { RECIPE_API } from './core/api/recipe-api';
import { SOCIAL_API } from './core/api/social-api';
import { AUTH_API } from './core/api/auth-api';
import { AuthService } from './core/auth/auth.service';
import { MockRecipeApi } from './mock/mock-recipe-api';
import { MockSocialApi } from './mock/mock-social-api';
import { MockAuthApi } from './mock/mock-auth-api';

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
    // ("0 réaction") and English does not ("0 reactions"), and no hand-rolled
    // pluralizer gets that right for both.
    provideTranslocoMessageformat(),

    // Read from the URL prefix at bootstrap so DatePipe and number formatting
    // agree with the page's language.
    {
      provide: LOCALE_ID,
      useFactory: () => LOCALE_IDS[inject(LocaleService).locale()],
    },

    // The milestone-1 → milestone-2 seam. Components inject RECIPE_API and
    // never learn which implementation they got. M2 adds HttpRecipeApi here as
    // the `useMocks === false` branch; nothing in the component tree changes.
    { provide: RECIPE_API, useClass: MockRecipeApi },
    { provide: SOCIAL_API, useClass: MockSocialApi },
    { provide: AUTH_API, useExisting: MockAuthApi },

    provideAppInitializer(() => {
      inject(ThemeService).init();
      inject(LocaleService).init();
      // Awaited: the comment box must not paint its signed-out prompt to
      // someone who is in fact signed in, and every other initializer here is
      // synchronous, so this costs one storage read at bootstrap.
      return inject(AuthService).init();
    }),
  ],
};
