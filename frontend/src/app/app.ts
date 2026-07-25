import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SiteHeaderComponent } from './layout/site-header/site-header';
import { SiteFooterComponent } from './layout/site-footer/site-footer';

@Component({
  selector: 'bah-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiteHeaderComponent, SiteFooterComponent, TranslocoPipe],
  template: `
    <a class="btn btn-secondary skip-link" href="#main">{{ 'site.skipToContent' | transloco }}</a>

    <bah-site-header />

    <main id="main" class="container" tabindex="-1">
      <router-outlet />
    </main>

    <bah-site-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    main {
      flex: 1;
      padding-bottom: 60px;
      outline: none;
    }
  `,
})
export class App {}
