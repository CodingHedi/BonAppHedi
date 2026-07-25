import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder — steps, ingredient scaler and media land in M1c. */
@Component({
  selector: 'bah-recipe-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <h1>{{ slug() }}</h1> `,
  styles: `
    h1 {
      font-size: 42px;
      line-height: 1.05;
      padding-top: 36px;
    }
  `,
})
export class RecipeDetailPage {
  /** Bound from the route by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();
}
