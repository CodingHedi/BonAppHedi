import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Politique de confidentialité.
 *
 * Required because of the anonymous visitor cookie used for rating dedupe and
 * the self-hosted view counting. Must state plainly: what the cookie is for,
 * that no raw IP is stored, that fonts are self-hosted, that YouTube only loads
 * on click, and that there is no third-party analytics. Written at M3.
 */
@Component({
  selector: 'bah-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="prose">
      <h1>Confidentialité</h1>
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
export class PrivacyPage {}
