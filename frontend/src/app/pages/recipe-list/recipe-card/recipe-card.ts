import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ImageComponent } from '../../../shared/ui/image/image';
import { TagChipComponent } from '../../../shared/ui/tag-chip/tag-chip';
import { TimestampComponent } from '../../../shared/ui/timestamp/timestamp';
import { LocaleService } from '../../../core/i18n/locale.service';
import type { RecipeSummary } from '../../../core/api/models';

@Component({
  selector: 'bah-recipe-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ImageComponent, TagChipComponent, TimestampComponent],
  template: `
    <!--
      An article with a link stretched across it, rather than one enormous <a>.

      The card holds a button now — the date swaps between "il y a 4 jours" and
      the published date — and a control inside a link is invalid HTML that
      browsers resolve by navigating, so the swap could never have fired. The
      title carries the real link and .title-link::after covers the card, so a
      press anywhere still opens the recipe while the date is free to be
      pressed on its own.

      It also improves what a screen reader reads out: the link's name used to
      be every word on the card, and is now the recipe title.
    -->
    <article class="card elev-sm">
      <div class="media washed">
        <bah-image [image]="recipe().image" [label]="recipe().title" />

        @if (visibleTags().length) {
          <div class="tag-rail">
            @for (tag of visibleTags(); track tag.slug) {
              <bah-tag-chip [tag]="tag" />
            }
          </div>
        }
      </div>

      <div class="body">
        <h3>
          <a class="title-link" [routerLink]="link()">{{ recipe().title }}</a>
        </h3>
        <p>{{ recipe().excerpt }}</p>

        <div class="meta">
          <div class="author">
            <div class="avatar washed">
              <bah-image
                [image]="avatar()"
                [label]="recipe().author.displayName"
                [compact]="true"
              />
            </div>
            <div class="author-text">
              <b>{{ recipe().author.displayName }}</b>
              <!-- Relative first: a list is scanned for what is new. -->
              <bah-timestamp [iso]="recipe().publishedAt" initial="relative" />
            </div>
          </div>
        </div>
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }

    .card {
      position: relative;
      padding: 0;
      height: 100%;
      color: var(--color-text);
      overflow: hidden;
      transition: transform 0.18s ease;
      /* Was on a.card, which no longer exists as a wrapper. Kept on :hover of
         the card itself so the lift still answers the whole surface rather than
         only the title. */
      display: flex;
      flex-direction: column;
    }

    .card:hover {
      transform: translateY(-4px);
    }

    .title-link {
      text-decoration: none;
      color: inherit;
    }

    /*
     * The stretched link: this covers the card, so a press anywhere opens the
     * recipe. Anything that must stay pressable sits above it — see
     * bah-timestamp below.
     */
    .title-link::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
    }

    bah-timestamp {
      position: relative;
      z-index: 2;
    }

    .media {
      position: relative;
      height: 190px;
      overflow: hidden;
      /* Only the top corners: the card body squares off underneath. */
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      flex: none;
    }

    .tag-rail {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: 80%;
    }

    .body {
      padding: 18px 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }

    h3 {
      font-size: 19px;
      margin: 0;
    }

    p {
      opacity: 0.75;
      font-size: 13.8px;
      line-height: 1.55;
      margin: 0;
      flex: 1;

      /* Two lines, so cards in a row keep their footers aligned. */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 12px;
      margin-top: 4px;
      border-top: 1px solid var(--color-divider);
    }

    .author {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      overflow: hidden;
      flex: none;
    }

    .author-text {
      display: flex;
      flex-direction: column;
    }

    b {
      font-size: 13px;
      font-weight: 700;
    }

    bah-timestamp {
      font-size: 11px;
      color: var(--color-text-muted);
    }
  `,
})
export class RecipeCardComponent {
  private readonly locale = inject(LocaleService);

  readonly recipe = input.required<RecipeSummary>();

  protected readonly link = computed(() => this.locale.recipeLink(this.recipe().slug));

  // The prototype shows at most two; a third would wrap onto its own row and
  // cover the photo.
  protected readonly visibleTags = computed(() => this.recipe().tags.slice(0, 2));

  protected readonly avatar = computed(() => ({
    url: this.recipe().author.avatarUrl,
    alt: this.recipe().author.displayName,
  }));
}
