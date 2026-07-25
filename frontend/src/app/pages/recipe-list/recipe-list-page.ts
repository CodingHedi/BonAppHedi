import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Placeholder — the hero carousel, filters and card grid land in M1b. */
@Component({
  selector: 'bah-recipe-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <h1 class="visually-hidden">{{ 'site.title' | transloco }}</h1>
    <div class="section-head">
      <h2>{{ 'list.heading' | transloco }}</h2>
    </div>
  `,
  styles: `
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin: 50px 0 22px;
    }

    h2 {
      font-size: 26px;
      margin: 0;
    }
  `,
})
export class RecipeListPage {}
