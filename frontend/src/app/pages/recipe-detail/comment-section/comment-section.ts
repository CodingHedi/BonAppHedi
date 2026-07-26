import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../core/icons/icon';
import { ImageComponent } from '../../../shared/ui/image/image';
import { MarkdownComponent } from '../../../shared/ui/markdown/markdown';
import { SignInRowComponent } from '../../../shared/ui/sign-in-row/sign-in-row';
import { RelativeTimePipe } from '../../../shared/pipes';
import { AuthService } from '../../../core/auth/auth.service';
import type { Comment, ImageRef } from '../../../core/api/models';

type CommentTab = 'write' | 'preview';

/**
 * The comment block from the prototype: a count heading, a write/preview card,
 * and the thread.
 *
 * The Write/Preview tabs are drawn in the prototype and are not decoration — a
 * comment is markdown, so there has to be a way to see what it will look like
 * before it is public. Preview renders through the same sanitizing component the
 * recipe body uses, which is also what the admin editor will use.
 */
@Component({
  selector: 'bah-comment-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslocoPipe,
    RelativeTimePipe,
    IconComponent,
    ImageComponent,
    MarkdownComponent,
    SignInRowComponent,
  ],
  template: `
    <section class="comments">
      <h2>{{ 'comments.heading' | transloco: { count: comments().length } }}</h2>

      <div class="card elev-sm composer">
        <!--
          A real tablist: roving tabindex, arrow keys, and a panel that names the
          tab controlling it. Two <span>s with a border, as the prototype draws
          them, would be unreachable by keyboard and unannounced.

          Both tabs are disabled while signed out. Leaving Preview live would
          offer to preview a comment that cannot be written yet.
        -->
        <div class="tabs" role="tablist" [attr.aria-label]="'comments.write' | transloco">
          @for (name of TABS; track name) {
            <button
              type="button"
              role="tab"
              class="tab"
              [id]="'comment-tab-' + name"
              [class.active]="tab() === name"
              [attr.aria-selected]="tab() === name"
              [attr.aria-controls]="'comment-panel'"
              [tabindex]="tab() === name ? 0 : -1"
              [disabled]="!auth.signedIn()"
              (click)="tab.set(name)"
              (keydown)="onTabKeydown($event)"
            >
              {{ 'comments.' + name | transloco }}
            </button>
          }
        </div>

        <div id="comment-panel" role="tabpanel" [attr.aria-labelledby]="'comment-tab-' + tab()">
          @if (!auth.signedIn()) {
            <!-- The prompt and the provider row, exactly where the prototype put
                 them. Nothing is disabled-but-visible: a textarea you cannot use
                 explains less than a sentence saying why. -->
            <div class="prompt">{{ 'comments.signInPrompt' | transloco }}</div>
          } @else if (tab() === 'write') {
            <textarea
              class="input body"
              [attr.placeholder]="'comments.placeholder' | transloco"
              [attr.aria-label]="'comments.placeholder' | transloco"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
              [disabled]="busy()"
            ></textarea>
          } @else {
            <div class="preview">
              @if (draft().trim()) {
                <bah-markdown [markdown]="draft()" />
              } @else {
                <span class="muted">{{ 'comments.placeholder' | transloco }}</span>
              }
            </div>
          }
        </div>

        <div class="foot">
          @if (auth.signedIn()) {
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!canSubmit()"
              (click)="submit()"
            >
              {{ 'comments.submit' | transloco }}
            </button>
          } @else {
            <bah-sign-in-row />
          }
        </div>
      </div>

      @if (comments().length) {
        <ul class="thread">
          @for (comment of comments(); track comment.id) {
            <li class="comment" [class.pending]="comment.status === 'PENDING'">
              <bah-image
                class="avatar"
                [image]="avatarFor(comment)"
                [label]="comment.author.displayName"
                [compact]="true"
              />

              <div class="content">
                <div class="byline">
                  <b>{{ comment.author.displayName }}</b>
                  <time [attr.datetime]="comment.createdAt">
                    {{ comment.createdAt | relativeTime }}
                  </time>

                  @if (comment.status === 'PENDING') {
                    <span class="badge-pending">{{ 'comments.pending' | transloco }}</span>
                  }

                  @if (comment.mine) {
                    <button
                      type="button"
                      class="btn btn-icon btn-secondary delete"
                      [attr.aria-label]="'comments.delete' | transloco"
                      [disabled]="busy()"
                      (click)="remove.emit(comment.id)"
                    >
                      <bah-icon name="trash" [size]="14" />
                    </button>
                  }
                </div>

                <bah-markdown
                  class="body"
                  [markdown]="comment.bodyMarkdown"
                  [html]="comment.bodyHtml"
                />
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="empty">{{ 'comments.empty' | transloco }}</p>
      }
    </section>
  `,
  styles: `
    .comments {
      margin-top: 44px;
    }

    h2 {
      font-size: 20px;
      margin: 0 0 20px;
    }

    .composer {
      padding: 0;
      overflow: hidden;
    }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--color-divider);
      font-size: 13px;
    }

    .tab {
      padding: 12px 18px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: inherit;
      opacity: 0.55;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
    }

    .tab.active {
      color: var(--color-accent);
      border-bottom-color: var(--color-accent);
      opacity: 1;
    }

    .prompt,
    .preview {
      padding: 20px;
      font-size: 14px;
      min-height: 90px;
    }

    .prompt {
      opacity: 0.55;
    }

    .muted {
      opacity: 0.45;
    }

    .composer .body {
      display: block;
      width: 100%;
      min-height: 90px;
      border: none;
      border-radius: 0;
      background: none;
      padding: 20px;
      font: inherit;
      font-size: 14px;
      resize: vertical;
    }

    .composer .body:focus {
      outline: 2px solid var(--color-accent);
      outline-offset: -2px;
    }

    .foot {
      display: flex;
      justify-content: flex-end;
      padding: 14px 20px;
      border-top: 1px solid var(--color-divider);
    }

    .thread {
      list-style: none;
      margin: 28px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .comment {
      display: flex;
      gap: 14px;
    }

    .comment.pending {
      opacity: 0.7;
    }

    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      overflow: hidden;
      flex: none;
    }

    .content {
      min-width: 0;
      flex: 1;
    }

    .byline {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }

    .byline time {
      opacity: 0.55;
    }

    .badge-pending {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--color-divider);
      opacity: 0.7;
    }

    .delete {
      margin-left: auto;
    }

    .comment .body {
      font-size: 14.5px;
      line-height: 1.7;
      opacity: 0.8;
    }

    .empty {
      margin: 24px 0 0;
      opacity: 0.55;
      font-size: 14px;
    }
  `,
})
export class CommentSectionComponent {
  protected readonly auth = inject(AuthService);

  readonly comments = input<readonly Comment[]>([]);
  readonly busy = input(false);

  readonly post = output<string>();
  readonly remove = output<number>();

  protected readonly TABS = ['write', 'preview'] as const;

  protected readonly tab = signal<CommentTab>('write');
  protected readonly draft = signal('');

  protected readonly canSubmit = computed(() => this.draft().trim().length > 0 && !this.busy());

  /**
   * Commenters have no photo yet, so this is an alt text and a null URL — the
   * same shape recipes use, which gets the initial-in-a-tint placeholder rather
   * than a broken image.
   */
  protected avatarFor(comment: Comment): ImageRef {
    return { url: comment.author.avatarUrl, alt: comment.author.displayName };
  }

  /** Left/Right move between tabs, as the tablist pattern requires. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const next = this.TABS[(this.TABS.indexOf(this.tab()) + delta + this.TABS.length) % this.TABS.length];
    this.tab.set(next);

    // Focus has to follow the selection or a second arrow press does nothing,
    // the roving tabindex having moved out from under the focused element.
    const list = (event.target as HTMLElement).parentElement;
    (list?.querySelector<HTMLElement>(`#comment-tab-${next}`))?.focus();
  }

  protected submit(): void {
    if (!this.canSubmit()) return;

    this.post.emit(this.draft().trim());
    this.draft.set('');
    // Back to Write, or posting from Preview leaves an empty preview pane
    // looking like the comment vanished.
    this.tab.set('write');
  }
}
