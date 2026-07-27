import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
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
 * Tags are chips rather than the prototype's third `<select>`, because they are
 * the one filter that is genuinely multiple: "vegetarian *and* dessert" is an
 * ordinary thing to want, and a single-select cannot express it. Chips also make
 * every active tag visible at once and removable on its own, which a
 * multi-select listbox does neither of.
 *
 * Everything clears two ways, deliberately: each control on its own, and all of
 * them together. Only offering "clear all" makes removing one tag a matter of
 * rebuilding the whole query.
 */
@Component({
  selector: 'bah-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TranslocoPipe],
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

      <!--
        A group rather than a listbox: each chip is an independent on/off, and
        aria-pressed says so on the control itself. Screen readers then announce
        the state without the visitor having to open anything.
      -->
      @if (tags().length) {
        <div class="tag-row" role="group" [attr.aria-label]="'list.filterByTag' | transloco">
          @for (item of tags(); track item.slug) {
            <button
              type="button"
              class="tag tag--{{ item.colorVariant }} chip"
              [class.on]="isSelected(item.slug)"
              [attr.aria-pressed]="isSelected(item.slug)"
              (click)="toggleTag(item.slug)"
            >
              {{ item.label }}
              @if (isSelected(item.slug)) {
                <bah-icon name="x" [size]="11" />
              }
            </button>
          }
        </div>
      }

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
          <button type="button" class="btn btn-secondary clear-all" (click)="clearAll()">
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

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      gap: 5px;
      border: 1px solid transparent;
      cursor: pointer;
      font-family: var(--font-body);
      /* The tag palette is a tint, so unselected chips read as quiet until one
         is chosen and the others recede further. */
      opacity: 0.75;
    }

    .chip:hover {
      opacity: 1;
    }

    .chip.on {
      opacity: 1;
      border-color: currentColor;
    }

    .chip:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    .selects {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .select-wrap {
      display: block;
    }

    .clear-all {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      white-space: nowrap;
    }
  `,
})
export class FilterBarComponent {
  readonly authors = input<readonly Author[]>([]);
  readonly tags = input<readonly Tag[]>([]);

  readonly query = model('');
  readonly author = model<string | null>(null);
  readonly selectedTags = model<readonly string[]>([]);
  readonly sort = model<SortOrder>('recent');

  /** Whether anything is worth offering to clear. Sort is a view, not a filter. */
  protected readonly anyActive = computed(
    () => this.query().length > 0 || this.author() !== null || this.selectedTags().length > 0,
  );

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
