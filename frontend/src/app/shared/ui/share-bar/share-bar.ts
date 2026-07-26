import { DOCUMENT, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';

/**
 * Share this recipe.
 *
 * **No third-party SDK, ever.** Facebook's `sdk.js` and X's `widgets.js` are the
 * usual way to build this, and both would defeat the whole privacy stance of the
 * site: they load on page view, set cookies, and disclose the visitor's IP to a
 * network that never asked to read a recipe. The YouTube facade next to this
 * component exists precisely to prevent that, and a share button is a far weaker
 * reason to give it up than a video is.
 *
 * So every target here is a plain `<a href>` to a documented share URL. Nothing
 * is requested until the visitor clicks, and what they get is a normal
 * navigation to a site they chose.
 *
 * On phones the native share sheet replaces all of it — it is the better
 * affordance where it exists, and it reaches apps (Signal, WhatsApp, Mail) that
 * no hardcoded link list could cover.
 */

interface ShareTarget {
  readonly id: 'facebook' | 'whatsapp' | 'email';
  readonly label: string;
  readonly href: string;
}

@Component({
  selector: 'bah-share-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, IconComponent],
  template: `
    <div class="share">
      <span class="label">{{ 'share.label' | transloco }}</span>

      @if (canShareNatively()) {
        <button type="button" class="btn btn-secondary" (click)="shareNatively()">
          <bah-icon name="share" [size]="16" />
          {{ 'share.action' | transloco }}
        </button>
      } @else {
        <ul class="targets">
          @for (target of targets(); track target.id) {
            <li>
              <!-- rel=noopener is not optional alongside target=_blank: without
                   it the opened page gets a handle back on this window. -->
              <a
                class="btn btn-icon btn-secondary"
                [href]="target.href"
                target="_blank"
                rel="noopener noreferrer"
                [attr.aria-label]="'share.on' | transloco: { network: target.label }"
              >
                <bah-icon [name]="iconFor(target.id)" [size]="16" />
              </a>
            </li>
          }
        </ul>
      }

      <button
        type="button"
        class="btn btn-icon btn-secondary"
        [attr.aria-label]="'share.copyLink' | transloco"
        (click)="copyLink()"
      >
        <bah-icon [name]="copied() ? 'check' : 'link'" [size]="16" />
      </button>

      <!-- Announced rather than drawn: the icon swap is invisible to a screen
           reader, so the confirmation has to be said out loud. -->
      <span class="sr-only" role="status" aria-live="polite">
        {{ copied() ? ('share.copied' | transloco) : '' }}
      </span>
    </div>
  `,
  styles: `
    .share {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .label {
      font-size: 13px;
      opacity: 0.55;
    }

    .targets {
      display: flex;
      gap: 8px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class ShareBarComponent {
  private readonly document = inject(DOCUMENT);

  readonly title = input('');
  /** Defaults to the page's own address, which is what sharing a recipe means. */
  readonly url = input<string | null>(null);

  protected readonly copied = signal(false);

  protected readonly shareUrl = computed(
    () => this.url() ?? this.document.defaultView?.location.href ?? '',
  );

  protected readonly canShareNatively = computed(
    () => typeof this.document.defaultView?.navigator?.share === 'function',
  );

  protected readonly targets = computed<readonly ShareTarget[]>(() => {
    const url = encodeURIComponent(this.shareUrl());
    const text = encodeURIComponent(this.title());

    return [
      {
        id: 'facebook',
        label: 'Facebook',
        href: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp',
        href: `https://api.whatsapp.com/send?text=${text}%20${url}`,
      },
      {
        id: 'email',
        label: 'Email',
        href: `mailto:?subject=${text}&body=${url}`,
      },
    ];
  });

  /**
   * Each target needs its own glyph. Falling back to one generic share icon
   * gave WhatsApp and Email the same button, so the row read as a duplicate
   * rather than as a choice.
   */
  protected iconFor(id: ShareTarget['id']): 'facebook' | 'message' | 'mail' {
    return id === 'facebook' ? 'facebook' : id === 'whatsapp' ? 'message' : 'mail';
  }

  protected async shareNatively(): Promise<void> {
    try {
      await this.document.defaultView?.navigator.share({
        title: this.title(),
        url: this.shareUrl(),
      });
    } catch {
      // Dismissing the sheet rejects. That is a decision, not a failure, and it
      // must not reach the global error listener as an unhandled rejection.
    }
  }

  protected async copyLink(): Promise<void> {
    const view = this.document.defaultView;

    try {
      await view?.navigator.clipboard.writeText(this.shareUrl());
      this.copied.set(true);
      view?.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard access can be denied outright, and there is no second way to
      // do this that a browser would allow. The link is in the address bar.
    }
  }
}
