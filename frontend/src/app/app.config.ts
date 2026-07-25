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

    provideAppInitializer(() => {
      inject(ThemeService).init();
      inject(LocaleService).init();
    }),
  ],
};
