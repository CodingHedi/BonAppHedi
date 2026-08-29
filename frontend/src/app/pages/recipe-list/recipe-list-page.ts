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
import { matchesFuzzy, matchesQuery } from '../../shared/text';
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
      <!-- Two elements rather than one, mirroring bah-hero-carousel's own
           .hero > .frame. See the styles for why the nesting is load-bearing. -->
      <div class="hero-skeleton"><div class="hero-skeleton-frame"></div></div>
    }

    <bah-filter-bar
      [authors]="authors.value() ?? []"
      [tags]="tags.value() ?? []"
      [(query)]="query"
      [(author)]="author"
      [(selectedTags)]="selectedTags"
      [(sort)]="sort"
    />

    <div class="section-head">
      <h2>{{ 'list.heading' | transloco }}</h2>
      <span class="count">{{ 'list.count' | transloco: { count: visible().length } }}</span>
    </div>

    @if (approximate()) {
      <!-- Said out loud rather than silently widening the search. A visitor who
           mistyped needs to know these are near misses, not exact matches. -->
      <p class="approximate" role="status">
        {{ 'list.approximate' | transloco: { query: query().trim() } }}
      </p>
    }

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
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .approximate {
      margin: -8px 0 18px;
      font-size: 13.8px;
      opacity: 0.7;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      padding-bottom: 20px;
    }

    /*
     * Shaped to match bah-hero-carousel exactly, because a skeleton that is not
     * the size of the thing it stands in for is not reserving space, it is
     * scheduling a jump.
     *
     * Padding, not margin, and the outer element exists only for that. The
     * carousel's own wrapper is .hero, at padding 40px 0 8px. A margin here
     * instead collapses its 8px bottom into .filters' 56px top, so the gap was
     * 56px under the skeleton and 64px under the carousel - the skeleton stood
     * 8px shorter than what replaced it, and the filters, the section heading
     * and the whole grid dropped 8px on every single load. That was the entire
     * remaining layout shift on the page once the footer was dealt with.
     */
    .hero-skeleton {
      padding: 40px 0 8px;
    }

    .hero-skeleton-frame {
      height: 440px;
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

    /*
     * Both breakpoints, and they are the carousel's own - .slide is 440/380/340
     * at exactly these widths. Only the first of the two was mirrored here, so
     * below 640px the skeleton stood 40px taller than the carousel.
     *
     * That cost nothing measurable, and the reason is worth knowing rather than
     * relying on: on a phone the filters and the grid are already below the fold
     * while the hero loads, and a layout shift is only counted for what is on
     * screen. It is invisible at 390x844 and would not be on a shorter window at
     * the same width.
     */
    @media (max-width: 900px) {
      .hero-skeleton-frame {
        height: 380px;
      }
    }

    @media (max-width: 640px) {
      .hero-skeleton-frame {
        height: 340px;
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
  protected readonly selectedTags = signal<readonly string[]>([]);
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
   * This holds for far longer than it looks. At ~715 bytes a recipe, three
   * hundred of them are 27 KB gzipped — against an initial bundle of 156 KB, the
   * payload is not what will end this arrangement. Rendering is: a list that
   * needs pagination cannot be filtered client-side, because the pages that were
   * never fetched cannot be searched. `Docs/backlog.md` has the measurements and
   * the middle path.
   */
  protected readonly recipes = resource({
    params: () => ({ locale: this.locale() }),
    loader: ({ params }) => this.api.list({ locale: params.locale }),
  });

  /**
   * Everything except the search term, which is applied after.
   *
   * Tags narrow rather than widen: selecting "dessert" and "chocolate" asks for
   * recipes that are both, which is what picking a second filter means
   * everywhere else on the web. Or-semantics would make each extra chip return
   * *more*, and a filter that grows the result set reads as broken.
   */
  private readonly narrowed = computed(() => {
    const all = this.recipes.value()?.items ?? [];
    const tags = this.selectedTags();
    const author = this.author();

    return all.filter((recipe) => {
      if (author && recipe.author.slug !== author) return false;
      return tags.every((wanted) => recipe.tags.some((candidate) => candidate.slug === wanted));
    });
  });

  /**
   * The search, strictly first and forgivingly second.
   *
   * A typo-tolerant search that ran on every query would quietly answer
   * questions nobody asked — `poivron` is a couple of edits from `poivre`. So
   * the exact search runs alone, and the tolerant one is reached only when it
   * found nothing at all, which is the moment a search box looks broken and the
   * only moment guessing is welcome.
   */
  private readonly matched = computed(() => {
    const needle = this.query().trim();
    const candidates = this.narrowed();
    if (!needle) return { items: candidates, approximate: false };

    // searchText already covers title, excerpt, tags and ingredient names.
    const exact = candidates.filter((recipe) => matchesQuery([recipe.searchText], needle));
    if (exact.length > 0) return { items: exact, approximate: false };

    const near = candidates.filter((recipe) => matchesFuzzy([recipe.searchText], needle));
    return { items: near, approximate: near.length > 0 };
  });

  /** Whether what is on screen is a best guess rather than a match. */
  protected readonly approximate = computed(() => this.matched().approximate);

  protected readonly visible = computed(() => {
    const direction = this.sort() === 'oldest' ? -1 : 1;

    // Sorted by date even when the match was approximate. Relevance ranking
    // would quietly override the order the visitor picked in the sort control,
    // and with a catalogue this size it would decide almost nothing.
    return [...this.matched().items].sort(
      (a, b) => direction * (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    );
  });

  protected reset(): void {
    this.query.set('');
    this.author.set(null);
    this.selectedTags.set([]);
    this.sort.set('recent');
  }
}
