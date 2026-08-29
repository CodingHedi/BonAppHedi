import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';
import { inject } from '@angular/core';
import { SEGMENTS } from '../../core/i18n/locale';
import { LEGAL_DETAILS } from './legal-details';

/**
 * Mentions légales.
 *
 * Legally required of a French site, and required of this one whether or not it
 * makes money: LCEN covers any service de communication au public en ligne, and
 * a personal recipe notebook is one.
 *
 * The facts live in `legal-details.ts` and the reasoning about which of them may
 * be withheld is there too. This file is the presentation, and the prose is
 * translated like everything else — a French visitor and an English one are
 * entitled to the same information, and a notice nobody can read is not
 * published in any sense that counts.
 */
@Component({
  selector: 'bah-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink],
  template: `
    <section class="container page">
      <h1>{{ 'legal.title' | transloco }}</h1>

      <h2>{{ 'legal.publisherTitle' | transloco }}</h2>
      <p>
        <b>{{ details.publisher }}</b
        ><br />
        {{ 'legal.publisherCapacity' | transloco }}<br />
        @if (details.contactEmail) {
          <a [href]="'mailto:' + details.contactEmail">{{ details.contactEmail }}</a>
        }
      </p>
      <!--
        Why no postal address: LCEN 6-III-2 lets someone publishing
        non-professionally give the host's details instead, provided the host
        holds their identity. Said out loud rather than left as a gap, because a
        missing address reads as an oversight otherwise.
      -->
      <p class="note">{{ 'legal.addressWithheld' | transloco }}</p>

      <h2>{{ 'legal.directorTitle' | transloco }}</h2>
      <p>{{ details.publicationDirector }}</p>

      <h2>{{ 'legal.hostTitle' | transloco }}</h2>
      <p>
        <b>{{ details.host.name }}</b
        ><br />
        {{ details.host.address }}<br />
        {{ details.host.phone }}<br />
        <a [href]="details.host.url" target="_blank" rel="noopener noreferrer">
          {{ details.host.url }}
        </a>
      </p>

      <h2>{{ 'legal.contentTitle' | transloco }}</h2>
      <p>{{ 'legal.contentBody' | transloco }}</p>

      <h2>{{ 'legal.dataTitle' | transloco }}</h2>
      <p>
        {{ 'legal.dataBody' | transloco }}
        <!-- Its own string, not the footer's label. "Confidentialité" works as
             a footer link and reads as a fragment mid-sentence. -->
        <a [routerLink]="privacyLink()">{{ 'legal.privacyLink' | transloco }}</a
        >.
      </p>
    </section>
  `,
  styles: `
    .page {
      padding: 48px 0 80px;
      max-width: 680px;
    }

    h1 {
      font-size: 34px;
      margin: 0 0 8px;
    }

    h2 {
      font-size: 17px;
      margin: 34px 0 10px;
    }

    p {
      margin: 0;
      line-height: 1.7;
      font-size: 14.5px;
      /* The clearest case for colour over opacity anywhere here. opacity:
         0.85 was aimed at the prose and barely changed it — but this page is
         mostly links, and it took each of them from a passing 5.29:1 to
         3.96:1. Nobody chose that number; it was a side effect of a rule about
         something else. */
      color: color-mix(in srgb, var(--color-text) 85%, var(--color-bg));
    }

    .note {
      font-size: 13.8px;
      color: var(--color-text-muted);
      margin-top: 10px;
    }
  `,
})
export class LegalPage {
  private readonly locale = inject(LocaleService);

  protected readonly details = LEGAL_DETAILS;

  protected privacyLink(): unknown[] {
    const active = this.locale.locale();
    return ['/', active, SEGMENTS[active].privacy];
  }
}
