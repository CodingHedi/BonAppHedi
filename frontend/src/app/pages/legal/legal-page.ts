import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Mentions légales.
 *
 * Legally required for a French site: publisher identity, contact, and the
 * host's name and address. Content is filled in at M3 once the domain and
 * hosting details are settled.
 */
@Component({
  selector: 'bah-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container prose">
      <h1>Mentions légales</h1>
      <p>À compléter avant la mise en ligne.</p>
    </section>
  `,
  styles: `
    .prose {
      padding: 48px 0 40px;
      max-width: 680px;
    }

    h1 {
      font-size: 34px;
      margin-bottom: 20px;
    }
  `,
})
export class LegalPage {}
