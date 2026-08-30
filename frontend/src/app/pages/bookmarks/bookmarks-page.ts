import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { RECIPE_API } from '../../core/api/recipe-api';
import { AuthService } from '../../core/auth/auth.service';
import { BookmarksService } from '../../core/bookmarks/bookmarks.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { SEGMENTS } from '../../core/i18n/locale';
import { RecipeCardComponent } from '../recipe-list/recipe-card/recipe-card';

/**
 * The recipes a reader has kept (ADR 16).
 *
 * <p><b>No request of its own.</b> The catalogue is already fetched once per
 * locale for the list page — 27 KB gzipped at three hundred recipes — so this is
 * that same catalogue filtered by a different predicate. An endpoint returning
 * saved recipes would be a second copy of data the browser is holding, and one
 * that could disagree with it.
 *
 * <p>Which also means the filter is by <b>key</b> and not by slug, so the list
 * survives a language switch. That is the entire reason the key is on
 * `RecipeSummary`.
 *
 * <p>Two sources for the list, and the URL wins when it has one. `?r=` is a
 * shared list: it renders read-only and offers to be saved, rather than being
 * merged into the reader's own the moment they open somebody's link.
 */
@Component({
  selector: 'bah-bookmarks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RecipeCardComponent, RouterLink, TranslocoPipe],
  template: `
    <div class="head">
      <h1>{{ 'bookmarks.heading' | transloco }}</h1>

      @if (shared()) {
        <p class="note" role="status">{{ 'bookmarks.shared' | transloco }}</p>
      } @else if (!bookmarks.available()) {
        <!--
          The browser refuses to store anything. Said plainly rather than shown
          as an empty list, which would read as "you have saved nothing" and be
          a different, untrue claim.
        -->
        <p class="note" role="status">{{ 'bookmarks.unavailable' | transloco }}</p>
      } @else {
        <p class="note">{{ 'bookmarks.local' | transloco }}</p>
      }
    </div>

    @if (recipes.isLoading()) {
      <section class="grid">
        @for (placeholder of skeletons; track placeholder) {
          <div class="card-skeleton"></div>
        }
      </section>
    } @else if (visible().length) {
      <section class="grid">
        @for (recipe of visible(); track recipe.key) {
          <bah-recipe-card [recipe]="recipe" />
        }
      </section>

      @if (shared()) {
        <button type="button" class="btn btn-secondary adopt" (click)="adopt()">
          {{ 'bookmarks.adopt' | transloco }}
        </button>
      }
    } @else {
      <section class="empty">
        <p>{{ 'bookmarks.empty' | transloco }}</p>

        <!--
          Never "you have no saved recipes": on a second device that is false,
          and false in the direction that makes the feature look broken. It says
          where they live and that signing in may find more.
        -->
        @if (!auth.signedIn()) {
          <p class="muted">{{ 'bookmarks.emptySignedOut' | transloco }}</p>
          <a class="btn btn-secondary" [routerLink]="signInLink()">
            {{ 'bookmarks.signInPrompt' | transloco }}
          </a>
        }
      </section>
    }
  `,
  styles: `
    .head {
      margin: 40px 0 28px;
    }

    h1 {
      font-size: 26px;
      margin: 0 0 6px;
    }

    .note {
      margin: 0;
      font-size: 13.8px;
      color: var(--color-text-muted);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      padding-bottom: 20px;
    }

    .card-skeleton {
      height: 340px;
      border-radius: var(--radius-card);
      background: var(--color-surface);
      opacity: 0.55;
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 14px;
      padding: 30px 0 60px;
    }

    .empty p {
      margin: 0;
    }

    .muted {
      color: var(--color-text-muted);
      font-size: 13.8px;
      max-width: 46ch;
    }

    .adopt {
      margin: 8px 0 40px;
    }
  `,
})
export class BookmarksPage {
  private readonly api = inject(RECIPE_API);
  private readonly localeService = inject(LocaleService);
  private readonly route = inject(ActivatedRoute);

  protected readonly bookmarks = inject(BookmarksService);
  protected readonly auth = inject(AuthService);

  protected readonly skeletons = Array.from({ length: 3 }, (_, i) => i);

  private readonly locale = this.localeService.locale;

  /**
   * The keys in the URL, if any. Read as a signal off the query map rather than
   * once, so arriving on a second link without a navigation away still updates.
   */
  private readonly fromUrl = toSignal(this.route.queryParamMap, { initialValue: null });

  protected readonly shared = computed(() => this.sharedKeys().length > 0);

  private readonly sharedKeys = computed(() => {
    const raw = this.fromUrl()?.get('r');
    if (!raw) return [];

    // Unknown and malformed entries are dropped rather than refused. A link can
    // outlive a recipe, and a reader who was sent one should see whatever of it
    // still exists instead of an error page.
    return raw
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0 && key.length <= 80);
  });

  protected readonly recipes = resource({
    params: () => ({ locale: this.locale() }),
    loader: ({ params }) => this.api.list({ locale: params.locale }),
  });

  protected readonly visible = computed(() => {
    const wanted = this.shared() ? this.sharedKeys() : this.bookmarks.keys();
    const all = this.recipes.value()?.items ?? [];

    // Ordered by the list rather than by the catalogue, so the most recently
    // saved is first and a shared link keeps the order it was written in.
    return wanted.flatMap((key) => all.filter((recipe) => recipe.key === key));
  });

  protected signInLink(): unknown[] {
    const locale = this.locale();
    return ['/', locale, SEGMENTS[locale].signIn];
  }

  protected adopt(): void {
    void this.bookmarks.adopt(this.sharedKeys());
  }
}
