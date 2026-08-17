import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ADMIN_API } from '../../../core/api/admin-api';
import { LocaleService } from '../../../core/i18n/locale.service';
import { MarkdownComponent } from '../../../shared/ui/markdown/markdown';
import { TimestampComponent } from '../../../shared/ui/timestamp/timestamp';

/**
 * The moderation queue.
 *
 * An empty queue is the normal state and is treated as good news rather than as
 * an absence — nothing here needs a "no data" apology.
 *
 * Bodies render through the same sanitizing markdown component the public
 * thread uses. Moderating a comment means reading exactly what a visitor would
 * see, not a raw source view that hides what the markup does.
 */
@Component({
  selector: 'bah-admin-moderation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, MarkdownComponent, TimestampComponent],
  template: `
    @if (queue.isLoading()) {
      <p class="muted">{{ 'admin.loading' | transloco }}</p>
    } @else if (queue.value(); as items) {
      @if (items.length) {
        <ul>
          @for (item of items; track item.comment.id) {
            <li class="card elev-sm item">
              <div class="meta">
                <b>{{ item.comment.author.displayName }}</b>
                <span class="on">{{ item.recipeTitle }}</span>
                <bah-timestamp [iso]="item.comment.createdAt" initial="relative" />
              </div>

              <bah-markdown class="body" [markdown]="item.comment.bodyMarkdown" />

              <div class="actions">
                <button
                  type="button"
                  class="btn btn-secondary"
                  [disabled]="busy()"
                  (click)="decide(item.comment.id, false)"
                >
                  {{ 'admin.reject' | transloco }}
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="busy()"
                  (click)="decide(item.comment.id, true)"
                >
                  {{ 'admin.approve' | transloco }}
                </button>
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="empty">{{ 'admin.queueEmpty' | transloco }}</p>
      }
    }
  `,
  styles: `
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 720px;
    }

    .item {
      padding: 18px 20px;
    }

    .meta {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-size: 13px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .on {
      opacity: 0.7;
    }

    .meta time {
      opacity: 0.5;
      margin-left: auto;
    }

    .body {
      font-size: 14.5px;
      line-height: 1.7;
      opacity: 0.85;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 14px;
    }

    .empty,
    .muted {
      opacity: 0.55;
      font-size: 14px;
    }
  `,
})
export class ModerationComponent {
  private readonly api = inject(ADMIN_API);
  private readonly locale = inject(LocaleService);

  protected readonly busy = signal(false);

  protected readonly queue = resource({
    params: () => ({ locale: this.locale.locale() }),
    loader: ({ params }) => this.api.pending(params.locale),
  });

  protected decide(id: number, approve: boolean): void {
    if (this.busy()) return;

    this.busy.set(true);
    void this.api
      .moderate(id, approve)
      .then(() => this.queue.reload())
      .finally(() => this.busy.set(false));
  }
}
