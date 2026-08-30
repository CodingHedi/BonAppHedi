import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';
import type { Author, SortOrder, Tag } from '../../../core/api/models';

/**
 * Search box, tag chips, and the two dropdowns.
 *
 * Presentational in the prototype; here it is wired to real client-side
 * filtering. With a personal blog's worth of recipes, filtering in the browser
 * is instant and avoids a round trip per keystroke.
 *
 * Tags keep the prototype's dropdown shape but hold a list of checkboxes rather
 * than one choice, because they are the one filter that is genuinely multiple:
 * "vegetarian *and* dessert" is an ordinary thing to want and a single-select
 * cannot express it. The trade a dropdown makes is that the active tags are not
 * visible while it is shut, which is why the trigger carries a count.
 *
 * Everything clears two ways, deliberately: each control on its own — the x in
 * the search box, a checkbox unticked — and all of them together. Only offering
 * "clear all" makes removing one tag a matter of rebuilding the whole query.
 */
@Component({
  selector: 'bah-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TranslocoPipe],
  host: {
    // Closing on an outside press and on Escape are what make a dropdown feel
    // like one. Bound on the document because the press that should close it is
    // by definition not on this component.
    '(document:pointerdown)': 'onDocumentPress($event)',
    '(document:keydown.escape)': 'closeTagMenu(true)',
  },
  template: `
    <section class="filters">
      <div class="search">
        <bah-icon name="search" [size]="17" />
        <input
          #searchBox
          class="input"
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          [placeholder]="'list.searchPlaceholder' | transloco"
          [attr.aria-label]="'nav.search' | transloco"
        />
        @if (query()) {
          <button
            type="button"
            class="clear-search"
            [attr.aria-label]="'list.clearSearch' | transloco"
            (click)="clearSearch()"
          >
            <bah-icon name="x" [size]="14" />
          </button>
        }
      </div>

      <div class="selects">
        <label class="select-wrap">
          <span class="visually-hidden">{{ 'list.filterByAuthor' | transloco }}</span>
          <select class="input" [value]="author() ?? ''" (change)="onAuthor($event)">
            <option value="">{{ 'list.filterByAuthor' | transloco }}</option>
            @for (item of authors(); track item.slug) {
              <option [value]="item.slug">{{ item.displayName }}</option>
            }
          </select>
        </label>

        <!--
          Three states, not two, and the middle one is the whole reason the tags
          input is optional rather than defaulting to an empty array.

          undefined is "not loaded yet" and gets a hidden copy of the trigger,
          holding exactly the space the real one will need. An empty array is
          "this site has no tags" and gets nothing at all, which is right and is
          what the condition here always meant.

          Collapsing those two into a length check is what made the filter bar
          grow by a row when its data arrived - on a narrow viewport the control
          appearing pushed the heading and the whole grid down 59px, which was
          the last layout shift left on this page.
        -->
        @if (tags(); as loaded) {
          @if (loaded.length) {
            <!--
              A disclosure button over a list of real checkboxes, rather than the
              listbox pattern. Native checkboxes bring their own keyboard handling,
              their own announcement of checked state, and their own behaviour on
              a touch screen; the listbox pattern would mean reimplementing all
              three by hand and getting one of them subtly wrong.
            -->
            <div class="tag-filter">
              <button
                #tagTrigger
                type="button"
                class="input trigger"
                [attr.aria-expanded]="tagsOpen()"
                [attr.aria-label]="'list.filterByTag' | transloco"
                (click)="toggleTagMenu()"
              >
                <span>
                  {{ 'list.filterByTag' | transloco }}
                  @if (selectedTags().length) {
                    <span class="count-badge">{{ selectedTags().length }}</span>
                  }
                </span>
                <bah-icon name="chevron-down" [size]="15" />
              </button>

              @if (tagsOpen()) {
                <!--
                  A real <ul>, so it is announced as a list of four rather than as
                  four loose controls, and the count on the trigger says how many
                  are on without the list having to be opened to find out.
                -->
                <ul
                  class="tag-menu card elev-sm"
                  [attr.aria-label]="'list.filterByTag' | transloco"
                >
                  @for (item of loaded; track item.slug) {
                    <li>
                      <label class="tag-option">
                        <input
                          type="checkbox"
                          [checked]="isSelected(item.slug)"
                          (change)="toggleTag(item.slug)"
                        />
                        <span class="tag tag--{{ item.colorVariant }}">{{ item.label }}</span>
                      </label>
                    </li>
                  }
                </ul>
              }
            </div>
          }
        } @else {
          <!--
            The same button, hidden rather than absent. visibility: hidden keeps
            the box and takes it out of the tab order and the accessibility tree
            in one go, so nothing announces a control that cannot yet be used
            and nothing can focus it.

            The same markup rather than a sized placeholder, deliberately: a
            hand-written box only holds the right space until somebody changes
            the trigger's padding, and then it is wrong in a way nothing reports.
          -->
          <div class="tag-filter">
            <button type="button" class="input trigger reserving">
              <span>{{ 'list.filterByTag' | transloco }}</span>
              <bah-icon name="chevron-down" [size]="15" />
            </button>
          </div>
        }

        <label class="select-wrap">
          <span class="visually-hidden">{{ 'list.filterByDate' | transloco }}</span>
          <select class="input" [value]="sort()" (change)="onSort($event)">
            <option value="recent">{{ 'list.sortNewest' | transloco }}</option>
            <option value="oldest">{{ 'list.sortOldest' | transloco }}</option>
          </select>
        </label>

        <!--
          Only once there is something to clear. A permanently visible reset is
          a control that does nothing most of the time, and one that appears
          exactly when it becomes useful is easier to notice than one that has
          always been there.
        -->
        @if (anyActive()) {
          <button type="button" class="btn clear-all" (click)="clearAll()">
            <bah-icon name="x" [size]="14" />
            {{ 'list.clearAll' | transloco }}
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    .filters {
      margin: 56px 0 6px;
      display: grid;
      gap: 12px;
    }

    .search {
      position: relative;
    }

    .search bah-icon {
      position: absolute;
      left: 18px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0.55;
      pointer-events: none;
    }

    .search .input {
      padding-left: 46px;
      padding-right: 46px;
      min-height: 48px;
      font-size: 15px;
    }

    /* Chrome renders a second clear affordance on type=search that sits badly
       inside a pill input, and there is now one of our own. */
    .search .input::-webkit-search-cancel-button {
      appearance: none;
    }

    .clear-search {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border: none;
      border-radius: 50%;
      background: none;
      color: inherit;
      opacity: 0.55;
      cursor: pointer;
    }

    .clear-search:hover {
      opacity: 1;
      background: color-mix(in srgb, var(--color-text) 10%, transparent);
    }

    /* A row rather than a grid of equal columns, so the clear button can sit at
       its own width instead of being stretched to match a dropdown. */
    .selects {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .select-wrap,
    .tag-filter {
      flex: 1 1 180px;
      min-width: 180px;
    }

    .select-wrap {
      display: block;
    }

    .tag-filter {
      position: relative;
    }

    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      cursor: pointer;
      text-align: left;
      font-weight: 400;
    }

    .trigger bah-icon {
      opacity: 0.55;
      flex: none;
    }

    /*
     * Holds the trigger's box while the tags are still arriving.
     *
     * visibility rather than opacity: opacity: 0 leaves a fully interactive,
     * focusable, screen-reader-visible control that simply cannot be seen,
     * which is worse than either showing it or not having it.
     */
    .reserving {
      visibility: hidden;
    }

    .count-badge {
      display: inline-grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      margin-left: 6px;
      padding: 0 5px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-2);
      color: var(--on-photo);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }

    .tag-menu {
      position: absolute;
      z-index: 20;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      margin: 0;
      padding: 8px;
      list-style: none;
      display: grid;
      gap: 2px;
    }

    .tag-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 8px;
      border-radius: var(--radius-lg);
      cursor: pointer;
    }

    .tag-option:hover {
      background: color-mix(in srgb, var(--color-text) 6%, transparent);
    }

    .tag-option input {
      accent-color: var(--color-accent-2);
      width: 15px;
      height: 15px;
      flex: none;
      cursor: pointer;
    }

    /* The second accent rather than the neutral secondary, so the one control
       that undoes everything is not the same shape and colour as the ones that
       set it. A colour the palette already has, not a new one: red would be the
       convention for something destructive, and this deletes nothing. */
    .clear-all {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 9px 16px;
      font-size: 13px;
      white-space: nowrap;
      color: var(--color-accent-2);
      background: transparent;
      border-color: color-mix(in srgb, var(--color-accent-2) 45%, transparent);
    }

    .clear-all:hover {
      background: var(--color-accent-2);
      border-color: var(--color-accent-2);
      color: var(--on-photo);
    }

    :host-context([data-theme='dark']) .clear-all {
      /* accent-2-500 on the dark background is too dark to read; the ramp's
         lighter end is what carries there, exactly as the avatar discs do. */
      color: var(--color-accent-2-300);
      border-color: color-mix(in srgb, var(--color-accent-2-300) 40%, transparent);
    }

    :host-context([data-theme='dark']) .clear-all:hover {
      background: var(--color-accent-2-300);
      border-color: var(--color-accent-2-300);
      color: var(--color-accent-2-900);
    }
  `,
})
export class FilterBarComponent {
  readonly authors = input<readonly Author[]>([]);
  /**
   * `undefined` while the tags are still being fetched, and an empty array only
   * when this site genuinely has none. The template needs to tell those apart -
   * see the three-state comment on the tag control - so this deliberately has
   * no default. Giving it `[]` would erase the distinction at the boundary,
   * which is exactly what it used to do.
   */
  readonly tags = input<readonly Tag[] | undefined>(undefined);

  readonly query = model('');
  readonly author = model<string | null>(null);
  readonly selectedTags = model<readonly string[]>([]);
  readonly sort = model<SortOrder>('recent');

  /** Whether anything is worth offering to clear. Sort is a view, not a filter. */
  protected readonly anyActive = computed(
    () => this.query().length > 0 || this.author() !== null || this.selectedTags().length > 0,
  );

  protected readonly tagsOpen = signal(false);

  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');
  private readonly tagTrigger = viewChild<ElementRef<HTMLButtonElement>>('tagTrigger');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected toggleTagMenu(): void {
    this.tagsOpen.update((open) => !open);
  }

  /**
   * `restoreFocus` is true for Escape and false for an outside press: dismissing
   * with the keyboard has to put the cursor back on the trigger, or focus is
   * left on an element that no longer exists and the next Tab starts from the
   * top of the document. A press has already moved focus wherever it was aimed.
   */
  protected closeTagMenu(restoreFocus = false): void {
    if (!this.tagsOpen()) return;

    this.tagsOpen.set(false);
    if (restoreFocus) this.tagTrigger()?.nativeElement.focus();
  }

  protected onDocumentPress(event: Event): void {
    if (!this.tagsOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.closeTagMenu();
  }

  protected isSelected(slug: string): boolean {
    return this.selectedTags().includes(slug);
  }

  protected toggleTag(slug: string): void {
    const current = this.selectedTags();
    this.selectedTags.set(
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  }

  protected clearSearch(): void {
    this.query.set('');
  }

  protected clearAll(): void {
    this.query.set('');
    this.author.set(null);
    this.selectedTags.set([]);
    // Sort is deliberately untouched: it is how the list is ordered rather than
    // what it contains, so resetting it would undo a choice the visitor made
    // about a different question.
  }

  protected onAuthor(event: Event): void {
    this.author.set((event.target as HTMLSelectElement).value || null);
  }

  protected onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as SortOrder);
  }
}
