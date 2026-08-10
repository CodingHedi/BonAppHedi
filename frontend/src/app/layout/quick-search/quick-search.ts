import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../core/icons/icon';
import { RECIPE_API } from '../../core/api/recipe-api';
import { LocaleService } from '../../core/i18n/locale.service';
import { matchesFuzzy, matchesQuery } from '../../shared/text';
import type { RecipeSummary } from '../../core/api/models';

/** More than a screenful is a list to scroll, not a shortcut. */
const MAX_RESULTS = 6;

/**
 * The header's magnifier: opens in place and answers where you stand.
 *
 * <p>It used to navigate to the recipe list and put the cursor in that page's
 * filter bar — a reasonable reading of "there is one search on this site", and
 * wrong for the thing people press it for. Wanting to jump to a recipe from
 * halfway down another one should not cost you the page you were reading.
 *
 * <p>Nothing navigates until a result is chosen. Escape and a click outside
 * both close it, and closing restores the page exactly as it was.
 *
 * <p><b>The same matching as the list page, deliberately.</b> Exact first over
 * the precomputed `searchText`, then `matchesFuzzy` only when exact found
 * nothing, and the near-miss case says so out loud rather than silently
 * widening. Two searches on one site that disagreed about what matches would be
 * worse than one search in the wrong place.
 */
@Component({
  selector: 'bah-quick-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink, TranslocoPipe],
  template: `
    <div class="quick" [class.is-open]="open()">
      <button
        type="button"
        class="btn btn-icon btn-secondary trigger"
        [attr.aria-label]="'nav.search' | transloco"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()"
      >
        <bah-icon name="search" />
      </button>

      <!--
        Always rendered, never merely hidden: an input that is created on open
        cannot be focused in the same tick, and one that is width-animated from
        a display:none start does not animate at all.
      -->
      <input
        #box
        type="search"
        class="box"
        role="combobox"
        aria-controls="quick-results"
        [attr.aria-expanded]="open()"
        [attr.aria-activedescendant]="active() >= 0 ? 'quick-option-' + active() : null"
        [attr.tabindex]="open() ? 0 : -1"
        [attr.aria-hidden]="open() ? null : 'true'"
        [placeholder]="'list.searchPlaceholder' | transloco"
        [value]="query()"
        (input)="onType($event)"
        (keydown)="onKey($event)"
      />

      @if (open() && query().trim()) {
        <div class="panel" id="quick-results" role="listbox">
          @if (approximate()) {
            <p class="note" role="status">
              {{ 'list.approximate' | transloco: { query: query().trim() } }}
            </p>
          }

          @for (hit of results(); track hit.slug; let i = $index) {
            <a
              class="hit"
              [id]="'quick-option-' + i"
              role="option"
              [attr.aria-selected]="i === active()"
              [class.is-active]="i === active()"
              [routerLink]="link(hit.slug)"
              (click)="close()"
            >
              <span class="hit-title">{{ hit.title }}</span>
              <span class="hit-excerpt">{{ hit.excerpt }}</span>
            </a>
          } @empty {
            <p class="note">{{ 'list.empty' | transloco }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .quick {
      position: relative;
      display: flex;
      align-items: center;
    }

    /*
     * Width rather than transform, because the neighbouring buttons have to
     * move aside rather than be covered — the header is a flex row and an
     * overlaid input would sit on top of the language and theme controls.
     */
    .box {
      width: 0;
      padding: 0;
      border: 1px solid transparent;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      font-size: 14px;
      opacity: 0;
      pointer-events: none;
      transition:
        width 0.26s cubic-bezier(0.65, 0, 0.35, 1),
        opacity 0.18s ease,
        margin 0.26s cubic-bezier(0.65, 0, 0.35, 1);
    }

    .is-open .box {
      width: 240px;
      margin-left: 8px;
      padding: 9px 14px;
      border-color: var(--color-divider);
      opacity: 1;
      pointer-events: auto;
    }

    .box:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    .panel {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      width: min(380px, calc(100vw - 32px));
      max-height: 60vh;
      overflow-y: auto;
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 6px;
      z-index: 20;
    }

    .hit {
      display: block;
      padding: 9px 12px;
      border-radius: calc(var(--radius-lg) - 8px);
      text-decoration: none;
      color: var(--color-text);
    }

    .hit:hover,
    .hit.is-active {
      background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
    }

    .hit-title {
      display: block;
      font-weight: 600;
      font-size: 14px;
    }

    .hit-excerpt {
      display: block;
      font-size: 12.5px;
      opacity: 0.65;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .note {
      margin: 0;
      padding: 10px 12px;
      font-size: 13px;
      opacity: 0.7;
    }

    /* The panel is the feature; the sliding open is decoration. */
    @media (prefers-reduced-motion: reduce) {
      .box {
        transition: none;
      }
    }

    @media (max-width: 640px) {
      .is-open .box {
        width: 150px;
      }
    }
  `,
})
export class QuickSearchComponent {
  private readonly locale = inject(LocaleService);
  private readonly api = inject(RECIPE_API);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  /** Index into results(), or -1 for "nothing chosen, Enter does nothing". */
  protected readonly active = signal(-1);

  /**
   * The same catalogue the list page loads, and for the same reason: the whole
   * of it is ~27KB gzipped at three hundred recipes, so searching what was
   * loaded beats a request per keystroke.
   */
  private readonly recipes = resource({
    params: () => ({ locale: this.locale.locale() }),
    loader: ({ params }) => this.api.list({ locale: params.locale }),
  });

  private readonly exact = computed(() => {
    const term = this.query().trim();
    const all = this.recipes.value()?.items ?? [];
    if (!term) return [];

    return all.filter((r) => matchesQuery([r.searchText], term));
  });

  private readonly fuzzy = computed(() => {
    const term = this.query().trim();
    const all = this.recipes.value()?.items ?? [];
    if (!term) return [];

    return all.filter((r) => matchesFuzzy([r.searchText], term));
  });

  /** True when nothing matched exactly and these are near misses instead. */
  protected readonly approximate = computed(
    () => this.query().trim().length > 0 && this.exact().length === 0 && this.fuzzy().length > 0,
  );

  protected readonly results = computed<readonly RecipeSummary[]>(() => {
    const hits = this.exact().length > 0 ? this.exact() : this.fuzzy();
    return hits.slice(0, MAX_RESULTS);
  });

  constructor() {
    // Focus follows opening, and the input must already exist for that to work
    // — which is why it is rendered always and hidden with width rather than
    // created on demand.
    effect(() => {
      if (this.open()) this.box().nativeElement.focus();
    });

    // A new query invalidates whatever was highlighted: keeping the index would
    // leave Enter opening a recipe that is no longer the one under the cursor.
    effect(() => {
      this.query();
      this.active.set(-1);
    });
  }

  protected link(slug: string): unknown[] {
    return this.locale.recipeLink(slug);
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
    this.query.set('');
    this.active.set(-1);
  }

  protected onType(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }

    const hits = this.results();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (hits.length === 0) return;
      event.preventDefault();

      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Wraps, so holding either arrow cannot strand the cursor at an end.
      const next = (this.active() + step + hits.length + 1) % (hits.length + 1);
      this.active.set(next === hits.length ? -1 : next);
      return;
    }

    if (event.key === 'Enter') {
      const chosen = hits[this.active()] ?? hits[0];
      if (!chosen) return;

      event.preventDefault();
      const target = this.link(chosen.slug);
      this.close();
      void this.router.navigate(target);
    }
  }

  /**
   * Closing on an outside click is a document listener rather than a backdrop
   * element: a backdrop that covers the page to catch the click also swallows
   * it, so dismissing the panel would cost a second click to press whatever was
   * underneath.
   */
  private readonly dismiss = (event: MouseEvent): void => {
    if (!this.open()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.close();
  };

  ngOnInit(): void {
    document.addEventListener('click', this.dismiss, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.dismiss, true);
  }
}
