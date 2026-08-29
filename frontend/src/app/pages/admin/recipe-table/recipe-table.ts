import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ADMIN_API } from '../../../core/api/admin-api';
import { LocaleService } from '../../../core/i18n/locale.service';
import { LOCALES } from '../../../core/i18n/locale';
import { TimestampComponent } from '../../../shared/ui/timestamp/timestamp';
import type { AdminRecipeRow, RecipeStatus } from '../../../core/api/models';

/**
 * Every recipe, drafts included, with the two things an author actually scans
 * for: what is published, and what is missing a translation.
 */
@Component({
  selector: 'bah-admin-recipe-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, TimestampComponent],
  template: `
    <div class="bar">
      <a class="btn btn-primary" [routerLink]="newLink()">{{ 'admin.newRecipe' | transloco }}</a>
    </div>

    @if (rows.isLoading()) {
      <p class="muted">{{ 'admin.loading' | transloco }}</p>
    } @else {
      <table>
        <thead>
          <tr>
            <th>{{ 'admin.colTitle' | transloco }}</th>
            <th>{{ 'admin.colStatus' | transloco }}</th>
            <th>{{ 'admin.colLanguages' | transloco }}</th>
            <th class="num">{{ 'admin.colRatings' | transloco }}</th>
            <th class="num">{{ 'admin.colComments' | transloco }}</th>
            <th>{{ 'admin.colPublished' | transloco }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows.value() ?? []; track row.key) {
            <tr>
              <td>
                <a [routerLink]="editLink(row.key)">{{ row.title }}</a>
              </td>
              <td>
                <span class="status" [class]="'status--' + row.status.toLowerCase()">
                  {{ 'admin.status' + row.status | transloco }}
                </span>
              </td>
              <td>
                <!-- A missing language is the thing worth spotting here, so
                     both are always listed and the absent one is struck out
                     rather than simply not drawn. -->
                @for (locale of LOCALES; track locale) {
                  <span class="lang" [class.missing]="!row.translated.includes(locale)">
                    {{ locale.toUpperCase() }}
                  </span>
                }
              </td>
              <td class="num">{{ row.ratingCount }}</td>
              <td class="num">{{ row.commentCount }}</td>
              <td>
                <bah-timestamp [iso]="row.publishedAt" initial="relative" />
              </td>
              <td class="actions">
                <button
                  type="button"
                  class="btn btn-secondary"
                  [disabled]="busy()"
                  (click)="toggle(row)"
                >
                  {{
                    (row.status === 'PUBLISHED' ? 'admin.unpublish' : 'admin.publish') | transloco
                  }}
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7" class="muted">{{ 'admin.noRecipes' | transloco }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    .bar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 18px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      padding: 0 12px 10px;
      font-weight: 600;
    }

    td {
      padding: 12px;
      border-top: 1px solid var(--color-divider);
      vertical-align: middle;
    }

    .num {
      text-align: right;
    }

    .actions {
      text-align: right;
      white-space: nowrap;
    }

    .status {
      font-size: 11.5px;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid var(--color-divider);
    }

    /* The text takes the link colour and the border keeps the fill. They are
       the same wine in the light theme and deliberately different in the dark
       one, where --color-accent is 3.13:1 as text and perfectly good as a
       1px rule around a chip. */
    .status--published {
      color: var(--color-link);
      border-color: var(--color-accent);
    }

    .lang {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin-right: 6px;
      opacity: 0.75;
    }

    .lang.missing {
      opacity: 0.3;
      text-decoration: line-through;
    }

    .muted {
      color: var(--color-text-muted);
      padding: 24px 12px;
    }

    /* A seven-column table cannot shrink to a phone. Scroll it inside its own
       box rather than letting it widen the page. */
    :host {
      display: block;
      overflow-x: auto;
    }
  `,
})
export class RecipeTableComponent {
  private readonly api = inject(ADMIN_API);
  private readonly locale = inject(LocaleService);

  protected readonly LOCALES = LOCALES;
  protected readonly busy = signal(false);

  protected readonly rows = resource({
    params: () => ({ locale: this.locale.locale() }),
    loader: ({ params }) => this.api.recipes(params.locale),
  });

  private readonly base = computed(() => this.locale.link([this.locale.segment('admin')]));

  protected newLink(): unknown[] {
    return [...this.base(), 'recipes', 'new'];
  }

  protected editLink(key: string): unknown[] {
    return [...this.base(), 'recipes', key];
  }

  protected toggle(row: AdminRecipeRow): void {
    const next: RecipeStatus = row.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    void this.write(() => this.api.setStatus(row.key, next));
  }

  private async write(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;

    this.busy.set(true);
    try {
      await action();
      this.rows.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
