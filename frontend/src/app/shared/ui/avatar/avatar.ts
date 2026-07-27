import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../core/icons/icon';
import { ImageComponent } from '../image/image';
import { AVATAR_TINT_HUES, parseAvatar } from '../../../core/avatar/avatar-token';

/**
 * Renders a chosen avatar — an icon on a tint, from a token such as `carrot/3`.
 *
 * ADR 7 replaced the commenter's provider picture with this, so that reading a
 * recipe stops disclosing the visitor's IP address to Google. Nothing here
 * fetches anything: the drawing comes from the icon registry the app already
 * ships, and the tint is a hue in a stylesheet.
 *
 * An absent or unrecognised token falls through to `bah-image`'s compact
 * placeholder — the initial in a tint — rather than being a special case here.
 * That is the same placeholder the recipe author's avatar uses when there is no
 * photograph, so an account that has never opened the profile page looks
 * deliberate rather than empty, and one carrying a token from a later build
 * degrades instead of breaking.
 */
@Component({
  selector: 'bah-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ImageComponent],
  template: `
    @if (chosen(); as avatar) {
      <div class="disc washed tinted" [style.--seed-hue]="hue()">
        <bah-icon [name]="avatar.icon" [size]="iconSize()" />
      </div>
    } @else {
      <bah-image [image]="{ url: null, alt: name() }" [label]="name()" [compact]="true" />
    }
  `,
  styles: `
    :host {
      display: block;
      /* The caller sizes the slot — 40px in a comment, 64px on the profile page
         — and both branches fill it, so switching avatars causes no reflow. */
      width: 100%;
      height: 100%;
      border-radius: 50%;
      overflow: hidden;
    }

    .disc {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      /* Dark end of the accent ramp on the light surface and the light end on
         the dark one, matching the compact placeholder's initial: accent-800 on
         #332c24 is effectively invisible. */
      color: var(--color-accent-800);
    }

    :host-context([data-theme='dark']) .disc {
      color: var(--color-accent-200);
    }
  `,
})
export class AvatarComponent {
  /** The stored token. Anything unparseable renders the placeholder. */
  readonly avatar = input<string | null>(null);

  /** The person's display name — the placeholder's initial and its hue. */
  readonly name = input<string>('');

  /**
   * The slot's size in px, which the icon is drawn at 55% of.
   *
   * Passed rather than measured: the icon is an <svg> with explicit width and
   * height, so it cannot be sized in CSS relative to a container, and a
   * ResizeObserver for a number the caller already knows would be absurd.
   */
  readonly size = input(40);

  protected readonly chosen = computed(() => parseAvatar(this.avatar()));

  protected readonly iconSize = computed(() => Math.round(this.size() * 0.55));

  protected readonly hue = computed(() => AVATAR_TINT_HUES[this.chosen()?.tint ?? 0]);
}
