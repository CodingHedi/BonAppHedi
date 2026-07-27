import { Injectable, signal } from '@angular/core';

/**
 * Carries "take me to the search box" from the header to the filter bar.
 *
 * The header's magnifier had been inert since the prototype was transcribed:
 * a labelled button, on every page, that did nothing when pressed. There is only
 * one search on this site and it lives on the recipe list, so the button's job
 * is to go there and put the cursor in it rather than to open a second one.
 *
 * A one-shot flag rather than a plain event, because the two ends are usually
 * not alive at the same time. Pressing the button on a recipe page starts a
 * navigation, and the filter bar that has to do the focusing does not exist
 * until that navigation finishes — an EventEmitter would fire into an empty room
 * and a counter would have to be remembered per subscriber. This is set by the
 * caller and consumed exactly once by whoever arrives to serve it.
 */
@Injectable({ providedIn: 'root' })
export class SearchFocusService {
  private readonly pending = signal(false);

  /** Read by the filter bar so it knows to look; cleared by `consume`. */
  readonly requested = this.pending.asReadonly();

  request(): void {
    this.pending.set(true);
  }

  /**
   * True once per request, then false until the next one.
   *
   * The clearing is what stops the list page grabbing focus every later time it
   * happens to be rendered — a flag left standing would mean that visiting the
   * home page, at any point after the button had ever been pressed, moved the
   * cursor into the search box unasked.
   */
  consume(): boolean {
    if (!this.pending()) return false;

    this.pending.set(false);
    return true;
  }
}
