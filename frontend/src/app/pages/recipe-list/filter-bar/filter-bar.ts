import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';
import type { Author, SortOrder, Tag } from '../../../core/api/models';

/**
 * Search box plus the three filter dropdowns.
 *
 * Presentational in the prototype; here it is wired to real client-side
 * filtering. With a personal blog's worth of recipes, filtering in the browser
 * is instant and avoids a round trip per keystroke.
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
          class="input"
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          [placeholder]="'list.searchPlaceholder' | transloco"
          [attr.aria-label]="'nav.search' | transloco"
        />
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

        <label class="select-wrap">
          <span class="visually-hidden">{{ 'list.filterByTag' | transloco }}</span>
          <select class="input" [value]="tag() ?? ''" (change)="onTag($event)">
            <option value="">{{ 'list.filterByTag' | transloco }}</option>
            @for (item of tags(); track item.slug) {
              <option [value]="item.slug">{{ item.label }}</option>
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
      min-height: 48px;
      font-size: 15px;
    }

    /* Chrome renders a second clear affordance on type=search that sits badly
       inside a pill input. */
    .search .input::-webkit-search-cancel-button {
      appearance: none;
    }

    .selects {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .select-wrap {
      display: block;
    }
  `,
})
export class FilterBarComponent {
  readonly authors = input<readonly Author[]>([]);
  readonly tags = input<readonly Tag[]>([]);

  readonly query = model('');
  readonly author = model<string | null>(null);
  readonly tag = model<string | null>(null);
  readonly sort = model<SortOrder>('recent');

  protected onAuthor(event: Event): void {
    this.author.set((event.target as HTMLSelectElement).value || null);
  }

  protected onTag(event: Event): void {
    this.tag.set((event.target as HTMLSelectElement).value || null);
  }

  protected onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as SortOrder);
  }
}
