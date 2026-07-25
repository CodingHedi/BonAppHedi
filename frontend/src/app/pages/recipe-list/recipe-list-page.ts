import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RECIPE_API } from '../../core/api/recipe-api';
import { LocaleService } from '../../core/i18n/locale.service';
import type { SortOrder } from '../../core/api/models';
import { matchesQuery } from '../../shared/text';
import { HeroCarouselComponent } from './hero-carousel/hero-carousel';
import { FilterBarComponent } from './filter-bar/filter-bar';
import { RecipeCardComponent } from './recipe-card/recipe-card';

@Component({
  selector: 'bah-recipe-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeroCarouselComponent, FilterBarComponent, RecipeCardComponent, TranslocoPipe],
  template: `
    <!--
      The visible headline lives inside the carousel and changes per slide, so
      the page's stable <h1> is here and visually hidden. Without it the
      document outline would start at <h2>.
    -->
    <h1 class="visually-hidden">{{ 'site.title' | transloco }}</h1>

    @if (heroSlides.value(); as slides) {
      @if (slides.length) {
        <bah-hero-carousel [slides]="slides" />
      }
    } @else {
      <div class="hero-skeleton"></div>
    }

    <bah-filter-bar
      [authors]="authors.value() ?? []"
      [tags]="tags.value() ?? []"
      [(query)]="query"
      [(author)]="author"
      [(tag)]="tag"
      [(sort)]="sort"
    />

    <div class="section-head">
      <h2>{{ 'list.heading' | transloco }}</h2>
      <span class="count">{{ 'list.count' | transloco: { count: visible().length } }}</span>
    </div>

    @if (recipes.isLoading()) {
      <section class="grid">
        @for (placeholder of skeletons; track placeholder) {
          <div class="card-skeleton"></div>
        }
      </section>
    } @else if (visible().length === 0) {
      <section class="empty">
        <p>{{ 'list.empty' | transloco }}</p>
        <button type="button" class="btn btn-secondary" (click)="reset()">
          {{ 'list.emptyAction' | transloco }}
        </button>
      </section>
    } @else {
      <section class="grid">
        @for (recipe of visible(); track recipe.slug) {
          <bah-recipe-card [recipe]="recipe" />
        }
      </section>
    }
  `,
  styles: `
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin: 50px 0 22px;
      gap: 16px;
    }

    h2 {
      font-size: 26px;
      margin: 0;
    }

    .count {
      font-size: 12.5px;
      opacity: 0.55;
      white-space: nowrap;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      padding-bottom: 20px;
    }

    .hero-skeleton {
      height: 440px;
      margin: 40px 0 8px;
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      opacity: 0.55;
      animation: pulse 1.4s ease-in-out infinite;
    }

    .card-skeleton {
      height: 340px;
      border-radius: var(--radius-card);
      background: var(--color-surface);
      opacity: 0.55;
      animation: pulse 1.4s ease-in-out infinite;
    }

    @keyframes pulse {
      50% {
        opacity: 0.3;
      }
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 18px;
      padding: 40px 0 60px;
    }

    .empty p {
      margin: 0;
      opacity: 0.75;
    }

    @media (max-width: 900px) {
      .hero-skeleton {
        height: 380px;
      }
    }
  `,
})
export class RecipeListPage {
  private readonly api = inject(RECIPE_API);
  private readonly localeService = inject(LocaleService);

  protected readonly skeletons = Array.from({ length: 6 }, (_, i) => i);

  protected readonly query = signal('');
  protected readonly author = signal<string | null>(null);
  protected readonly tag = signal<string | null>(null);
  protected readonly sort = signal<SortOrder>('recent');

  private readonly locale = this.localeService.locale;

  protected readonly heroSlides = resource({
    params: () => ({ locale: this.locale() }),
    loader: ({ params }) => this.api.featured(params.locale),
  });

  protected readonly tags = resource({
    params: () => ({ locale: this.locale() }),
    loader: ({ params }) => this.api.tags(params.locale),
  });

  protected readonly authors = resource({
    params: () => ({ locale: this.locale() }),
    loader: () => this.api.authors(),
  });

  /**
   * Locale is the only request parameter. Search, tag, author and sort are
   * applied below in a computed, so typing does not fire a request per
   * keystroke and results update with no perceptible delay.
   *
   * That holds while the catalogue is small. Past a few hundred recipes this
   * should move server-side with real pagination.
   */
  protected readonly recipes = resource({
    params: () => ({ locale: this.locale() }),
    loader: ({ params }) => this.api.list({ locale: params.locale }),
  });

  protected readonly visible = computed(() => {
    const all = this.recipes.value()?.items ?? [];
    const needle = this.query().trim();
    const tag = this.tag();
    const author = this.author();

    const filtered = all.filter((recipe) => {
      if (tag && !recipe.tags.some((candidate) => candidate.slug === tag)) return false;
      if (author && recipe.author.slug !== author) return false;
      // searchText already covers title, excerpt, tags and ingredient names.
      return !needle || matchesQuery([recipe.searchText], needle);
    });

    const direction = this.sort() === 'oldest' ? -1 : 1;
    return [...filtered].sort(
      (a, b) => direction * (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    );
  });

  protected reset(): void {
    this.query.set('');
    this.author.set(null);
    this.tag.set(null);
    this.sort.set('recent');
  }
}
