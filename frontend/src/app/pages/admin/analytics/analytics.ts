import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ADMIN_API } from '../../../core/api/admin-api';
import { LocaleService } from '../../../core/i18n/locale.service';
import { decimal } from '../../../shared/format';

/**
 * What the site has accumulated.
 *
 * Counts, not charts. Six recipes and a handful of ratings do not need a
 * visualisation — a chart here would be decoration standing in for data, and
 * would make a quiet month look like a broken graph. When the numbers grow
 * enough to have a shape worth seeing, that is the point to draw one.
 */
@Component({
  selector: 'bah-admin-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (stats.isLoading()) {
      <p class="muted">{{ 'admin.loading' | transloco }}</p>
    } @else if (stats.value(); as s) {
      <div class="tiles">
        <div class="card elev-sm tile">
          <span class="value">{{ s.recipes.PUBLISHED }}</span>
          <span class="label">{{ 'admin.statPublished' | transloco }}</span>
        </div>
        <div class="card elev-sm tile">
          <span class="value">{{ s.recipes.DRAFT }}</span>
          <span class="label">{{ 'admin.statDrafts' | transloco }}</span>
        </div>
        <div class="card elev-sm tile">
          <span class="value">{{ s.ratings.count }}</span>
          <span class="label">{{ 'admin.statRatings' | transloco }}</span>
          <span class="sub">{{
            'recipe.ratingSummary' | transloco: { average: average(s.ratings.average) }
          }}</span>
        </div>
        <div class="card elev-sm tile">
          <span class="value">{{ s.comments.total }}</span>
          <span class="label">{{ 'admin.statComments' | transloco }}</span>
          @if (s.comments.pending) {
            <span class="sub pending">{{
              'admin.statPending' | transloco: { count: s.comments.pending }
            }}</span>
          }
        </div>
        <div class="card elev-sm tile">
          <span class="value">{{ s.reactions }}</span>
          <span class="label">{{ 'admin.statReactions' | transloco }}</span>
        </div>
      </div>

      <h2>{{ 'admin.topRated' | transloco }}</h2>
      @if (s.top.length) {
        <ol class="top">
          @for (row of s.top; track row.key) {
            <li>
              <span class="name">{{ row.title }}</span>
              <span class="score">
                {{ 'recipe.ratingSummary' | transloco: { average: average(row.ratingAverage) } }}
                <span class="muted">
                  · {{ 'recipe.reviews' | transloco: { count: row.ratingCount } }}
                </span>
              </span>
            </li>
          }
        </ol>
      } @else {
        <!-- Distinct from "everything scored zero", which is a different fact. -->
        <p class="muted">{{ 'admin.noRatingsYet' | transloco }}</p>
      }
    }
  `,
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
    }

    .tile {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .value {
      font-family: var(--font-heading);
      font-size: 32px;
      line-height: 1;
    }

    .label {
      font-size: 12.5px;
      opacity: 0.6;
    }

    .sub {
      font-size: 12px;
      opacity: 0.55;
    }

    .pending {
      color: var(--color-accent);
      opacity: 1;
    }

    h2 {
      font-size: 18px;
      margin: 36px 0 14px;
    }

    .top {
      margin: 0;
      padding-left: 20px;
      max-width: 520px;
    }

    .top li {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0;
      border-bottom: 1px solid var(--color-divider);
      font-size: 14px;
    }

    .muted {
      color: var(--color-text-muted);
      font-size: 14px;
    }
  `,
})
export class AnalyticsComponent {
  private readonly api = inject(ADMIN_API);
  private readonly locale = inject(LocaleService);

  protected readonly stats = resource({
    params: () => ({ locale: this.locale.locale() }),
    loader: ({ params }) => this.api.stats(params.locale),
  });

  // Same rule as the recipe page, and the same reason: these tiles render
  // through `recipe.ratingSummary`, so a toFixed here would print "4.5 / 5" on
  // a console that writes every other number French.
  protected average(value: number): string {
    return decimal(value, this.locale.locale(), 1, 1);
  }
}
