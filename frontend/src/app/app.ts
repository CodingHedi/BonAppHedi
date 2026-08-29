import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
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

    <main id="main" class="container" tabindex="-1" [class.unrouted]="!routed()">
      <router-outlet (activate)="routed.set(true)" />
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

    /* Reserved only until a route has rendered anything, and it is worth being
       precise about which frame that is.

       The shell paints before the lazy route chunk arrives, so for one frame
       <main> is empty. min-height: 100vh above then does exactly what it is
       meant to and pins the footer to the bottom of the viewport - and the next
       frame, when the route's own loading skeleton appears, pushes it back out
       of sight. That single move was 0.065 of the page's 0.083 CLS, measured at
       6, 100 and 300 recipes: the largest shift on the page by a factor of
       nearly four, and nothing to do with the grid or the images it was assumed
       to be.

       Note which two frames those are. Docs/backlog.md recorded this as the
       skeleton being replaced by taller content; it is not - the skeleton is
       tall, and it is what ends the shift rather than what causes it. Instrument
       it and the shift lands with .hero-skeleton and .card-skeleton already in
       the DOM and no bah-recipe-card yet.

       So the fix is to make that first frame as tall as the ones on either side
       of it, rather than to change any skeleton. A blanket min-height on main
       would also work and is wrong: it would put the footer below the fold on
       every short page for ever, and the mentions legales being reachable is
       the one thing this footer exists for. */
    main.unrouted {
      min-height: 100vh;
    }
  `,
})
export class App {
  /**
   * Whether a route has put anything inside `main` yet.
   *
   * Driven off the outlet's own `activate` rather than a `NavigationEnd`
   * subscription: navigation ends before a lazily loaded component has been
   * created, so that would drop the reservation during the frame it exists for.
   */
  protected readonly routed = signal(false);
}
