import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';
import { SEGMENTS } from '../../core/i18n/locale';

/**
 * Politique de confidentialité.
 *
 * <p>Every claim on this page is a claim about code in this repository, and the
 * page is only worth having if that stays true. What it asserts, and where:
 *
 * <ul>
 *   <li>nothing stored for a reader — {@code VisitorIdentity.existing()}, which
 *       reads a cookie and never creates one;
 *   <li>the visitor cookie, its lifetime and its purpose — {@code VisitorIdentity};
 *   <li>the address is fingerprinted, never stored — {@code fingerprint()},
 *       an HMAC whose input is discarded;
 *   <li>no request to Google before a click — the YouTube facade (ADR 0006);
 *   <li>self-hosted typefaces — {@code styles/_fonts.scss};
 *   <li>no audience measurement — there is no view counter anywhere in the
 *       schema, and the admin statistics count rows that visitors created
 *       themselves.
 * </ul>
 *
 * <p>Two facts it deliberately does not carry: the contact address and the name
 * of the host. Both belong to the mentions légales, which is where French law
 * expects them and the only place they should need updating. This page links
 * there instead of repeating them.
 *
 * <p>One disclosure is not flattering and is here anyway: a commenter's picture
 * is served from their identity provider, so displaying a signed comment does
 * reach Google. That is the one third-party request the rest of the site is
 * built to avoid, and the fix is in the backlog. A privacy page that omitted it
 * would be worth less than no page at all.
 */
@Component({
  selector: 'bah-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink],
  template: `
    <section class="container prose">
      <h1>{{ 'privacy.title' | transloco }}</h1>
      <p class="updated">{{ 'privacy.updated' | transloco }}</p>
      <p class="lead">{{ 'privacy.lead' | transloco }}</p>

      <h2>{{ 'privacy.nothingTitle' | transloco }}</h2>
      <ul>
        <li>{{ 'privacy.nothingAnalytics' | transloco }}</li>
        <li>{{ 'privacy.nothingAds' | transloco }}</li>
        <li>{{ 'privacy.nothingWidgets' | transloco }}</li>
        <li>{{ 'privacy.nothingFonts' | transloco }}</li>
      </ul>

      <h2>{{ 'privacy.readingTitle' | transloco }}</h2>
      <p>{{ 'privacy.readingBody' | transloco }}</p>

      <h2>{{ 'privacy.ratingTitle' | transloco }}</h2>
      <p>{{ 'privacy.ratingCookie' | transloco }}</p>
      <p>{{ 'privacy.ratingFingerprint' | transloco }}</p>
      <p>{{ 'privacy.ratingConsent' | transloco }}</p>

      <h2>{{ 'privacy.commentTitle' | transloco }}</h2>
      <p>{{ 'privacy.commentIdentity' | transloco }}</p>
      <p>{{ 'privacy.commentEmail' | transloco }}</p>
      <p>{{ 'privacy.commentPublic' | transloco }}</p>
      <p>{{ 'privacy.commentAvatar' | transloco }}</p>
      <p>{{ 'privacy.commentCookies' | transloco }}</p>

      <h2>{{ 'privacy.videoTitle' | transloco }}</h2>
      <p>{{ 'privacy.videoBody' | transloco }}</p>

      <h2>{{ 'privacy.localTitle' | transloco }}</h2>
      <p>{{ 'privacy.localBody' | transloco }}</p>

      <h2>{{ 'privacy.storageTitle' | transloco }}</h2>
      <p>{{ 'privacy.storageBody' | transloco }}</p>
      <p>{{ 'privacy.storageRetention' | transloco }}</p>

      <h2>{{ 'privacy.rightsTitle' | transloco }}</h2>
      <p>{{ 'privacy.rightsBody' | transloco }}</p>
      <p>{{ 'privacy.rightsContact' | transloco }}</p>

      <!-- On its own line rather than trailing the sentence above, which already
           ends in the words "mentions légales" and read as if it had been said
           twice. -->
      <p class="more">
        <a [routerLink]="legalLink()">{{ 'privacy.rightsLink' | transloco }}</a>
      </p>
    </section>
  `,
  styles: `
    .prose {
      padding: 48px 0 80px;
      /* Narrower than the site's grid on purpose: this is the only page on the
         site that is read line after line, and a 1180px measure is unreadable. */
      max-width: 680px;
    }

    h1 {
      margin: 0 0 6px;
    }

    h2 {
      font-size: 20px;
      margin: 34px 0 12px;
    }

    p,
    li {
      line-height: 1.55;
      opacity: 0.75;
    }

    p {
      margin: 0 0 12px;
    }

    .updated {
      font-size: 13px;
      opacity: 0.5;
      margin-bottom: 20px;
    }

    .lead {
      font-size: 16px;
      opacity: 0.85;
    }

    ul {
      margin: 0 0 12px;
      padding-left: 20px;
    }

    li {
      margin-bottom: 8px;
    }

    .more {
      margin-top: 18px;
      opacity: 1;
    }

    a {
      color: inherit;
      text-underline-offset: 3px;
    }
  `,
})
export class PrivacyPage {
  private readonly locale = inject(LocaleService);

  /**
   * The legal notice in the language being read. Built from SEGMENTS rather
   * than hardcoded, because the segment itself is translated —
   * `/fr/mentions-legales` and `/en/legal-notice` are different paths.
   */
  protected readonly legalLink = computed(() => {
    const locale = this.locale.locale();
    return ['/', locale, SEGMENTS[locale].legal];
  });
}
