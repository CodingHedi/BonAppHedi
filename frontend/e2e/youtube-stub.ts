import type { Page } from '@playwright/test';

/**
 * Replaces YouTube's IFrame API with a stub that records what we asked it to do.
 *
 * Two reasons this is better than letting the real API load:
 *
 *   1. It makes the tests deterministic and offline. Loading the real player
 *      makes every run depend on Google's CDN, which is slow and will fail CI
 *      for reasons that have nothing to do with this codebase.
 *   2. It lets us assert the thing that actually matters and is otherwise
 *      invisible: Angular applies `startSeconds` through a `cueVideoById` call,
 *      not as a URL parameter, so there is nothing in the DOM to check.
 *
 * The trade-off is that this tests our integration, not YouTube's player. That
 * is the correct division: the player working is Google's problem, passing it
 * the right arguments is ours.
 */
export async function stubYouTubeApi(page: Page): Promise<void> {
  await page.route(/youtube\.com\/iframe_api/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.__ytCalls = [];
        window.YT = {
          PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
          Player: function (container, options) {
            window.__ytCalls.push({ type: 'construct', options: options });

            var iframe = document.createElement('iframe');
            iframe.setAttribute('title', 'youtube-stub');
            iframe.src = (options.host || 'https://www.youtube.com') +
                         '/embed/' + (options.videoId || '');
            container.appendChild(iframe);

            var self = this;
            var listeners = {};

            this.addEventListener = function (name, cb) {
              listeners[name] = cb;
              if (name === 'onReady') {
                setTimeout(function () { cb({ target: self }); }, 0);
              }
            };
            this.removeEventListener = function (name) { delete listeners[name]; };
            this.destroy = function () { iframe.remove(); };
            this.getPlayerState = function () { return -1; };
            this.getPlaybackQuality = function () { return 'default'; };
            this.setPlaybackQuality = function () {};
            this.setSize = function () {};
            this.seekTo = function (seconds) {
              window.__ytCalls.push({ type: 'seekTo', seconds: seconds });
            };
            this.playVideo = function () { window.__ytCalls.push({ type: 'playVideo' }); };
            this.pauseVideo = function () {};
            this.cueVideoById = function (opts) {
              window.__ytCalls.push({ type: 'cueVideoById', options: opts });
            };
            this.loadVideoById = function (opts) {
              window.__ytCalls.push({ type: 'loadVideoById', options: opts });
            };
          },
        };
        if (typeof window.onYouTubeIframeAPIReady === 'function') {
          window.onYouTubeIframeAPIReady();
        }
      `,
    }),
  );
}

export interface YouTubeCall {
  type: 'construct' | 'seekTo' | 'playVideo' | 'cueVideoById' | 'loadVideoById';
  seconds?: number;
  options?: { host?: string; videoId?: string; startSeconds?: number };
}

export function youtubeCalls(page: Page): Promise<YouTubeCall[]> {
  return page.evaluate(() => (window as unknown as { __ytCalls?: YouTubeCall[] }).__ytCalls ?? []);
}
