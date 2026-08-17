import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { YouTubePlayer } from '@angular/youtube-player';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';
import { ImageComponent } from '../../../shared/ui/image/image';
import type { ImageRef } from '../../../core/api/models';

/**
 * Recipe photo, and — when the recipe has one — a YouTube video behind a
 * click-to-load facade.
 *
 * The facade is the whole point, and it happens to be exactly what the design
 * already draws: our own photo with a glass play badge over it. Nothing is
 * requested from Google until the visitor presses play. Consequences:
 *
 *   - no YouTube cookies are set on page view, so no consent banner is owed
 *   - no third-party request on every page load, so no visitor IP is disclosed
 *     to Google merely for reading a recipe
 *
 * Two settings are load-bearing:
 *
 *   disablePlaceholder — the component ships its own facade, but its thumbnail
 *                        comes from i.ytimg.com, a Google domain hit on load.
 *                        That would defeat the entire purpose, so we use our
 *                        own poster instead.
 *   disableCookies     — points the embed at youtube-nocookie.com.
 */
@Component({
  selector: 'bah-recipe-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [YouTubePlayer, IconComponent, ImageComponent, TranslocoPipe],
  template: `
    <div class="media washed">
      @if (activated()) {
        <youtube-player
          [videoId]="youtubeVideoId()!"
          [startSeconds]="startSeconds()"
          [disableCookies]="true"
          [disablePlaceholder]="true"
          [playerVars]="playerVars"
          [width]="960"
          [height]="540"
        />
      } @else {
        <!--
          Not the component's grid-card default. This box is the wide half of a
          two-column row on a desktop and the full width of a phone, so the
          default's 33vw would have the browser fetch the 400px file for a slot
          around 800 and show it soft.
        -->
        <bah-image
          [image]="image()"
          [label]="title()"
          [priority]="true"
          sizes="(max-width: 900px) 100vw, 60vw"
        />

        @if (youtubeVideoId()) {
          <button
            type="button"
            class="play"
            [attr.aria-label]="'recipe.playVideo' | transloco"
            (click)="activate()"
          >
            <span class="badge">
              <bah-icon name="play" [size]="20" />
            </span>
          </button>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      flex: 2 1 480px;
      min-width: 0;
    }

    .media {
      position: relative;
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-md);
      min-height: 340px;
      height: 100%;
      /* Reserved so swapping the placeholder for a real photo, or for the
         player, shifts nothing on the page. */
      aspect-ratio: 16 / 9;
      /*
       * Load-bearing on phones. Without an explicit width the box has no
       * definite inline size, so the aspect ratio runs the other way and
       * transfers min-height into a *minimum width* of 340 ÷ 9 × 16 = 604px —
       * wider than any phone, which scrolled the whole document sideways.
       * Pinning the width makes the ratio derive the height, and min-height
       * then only ever makes the box taller.
       */
      width: 100%;
    }

    /*
     * The prototype drew this as a decorative overlay with pointer-events:none.
     * It is a control, so it is a real button covering the whole surface —
     * clicking anywhere on the photo starts the video, which is what people
     * expect from a play badge.
     */
    .play {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
    }

    .badge {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border-strong);
      backdrop-filter: blur(4px);
      display: grid;
      place-items: center;
      color: var(--on-photo);
      transition:
        transform 0.18s ease,
        background-color 0.18s ease;
    }

    .play:hover .badge {
      transform: scale(1.08);
      background: color-mix(in srgb, var(--color-accent) 55%, var(--glass-bg));
    }

    youtube-player {
      display: block;
      width: 100%;
      height: 100%;
    }

    /*
     * The player drops its iframe into a bare wrapper div that it owns and we
     * cannot style through an input. That wrapper has no height, so a plain
     * height:100% here resolves against auto and collapses the video to the
     * 150px iframe default — a letterboxed strip inside a 16/9 box. Filling
     * .media absolutely skips the wrapper entirely; .media is already the
     * positioned ancestor for the play button.
     */
    :host ::ng-deep youtube-player iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
  `,
})
export class RecipeMediaComponent {
  readonly image = input<ImageRef | null>(null);
  readonly title = input('');
  readonly youtubeVideoId = input<string | null>(null);

  private readonly player = viewChild(YouTubePlayer);

  protected readonly activated = signal(false);
  protected readonly startSeconds = signal<number | undefined>(undefined);

  protected readonly playerVars: YT.PlayerVars = {
    // Keep YouTube's own branding and related-video chrome to a minimum; this
    // is our page, not a YouTube page.
    modestbranding: 1,
    rel: 0,
    playsinline: 1,
  };

  protected readonly hasVideo = computed(() => this.youtubeVideoId() !== null);

  protected activate(seconds?: number): void {
    if (seconds !== undefined) this.startSeconds.set(seconds);
    this.activated.set(true);
  }

  /**
   * Called by the step list when a visitor clicks a "(02:14)" timestamp.
   *
   * If the player has not been created yet this loads it positioned at that
   * moment, so a click from a cold page jumps straight there instead of
   * starting from zero and needing a second interaction.
   */
  seekTo(seconds: number): void {
    if (!this.youtubeVideoId()) return;

    if (!this.activated()) {
      this.activate(seconds);
      return;
    }

    const player = this.player();
    // seekTo is queued internally until the player reports ready, so this is
    // safe to call during the load.
    player?.seekTo(seconds, true);
    player?.playVideo();
  }
}
