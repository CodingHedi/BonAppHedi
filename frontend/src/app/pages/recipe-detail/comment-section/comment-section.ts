import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { applyMark, type MarkName } from '../../../shared/markdown-input';
import type { IconName } from '../../../core/icons/icons.data';
import { IconComponent } from '../../../core/icons/icon';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar';
import { MarkdownComponent } from '../../../shared/ui/markdown/markdown';
import { SignInRowComponent } from '../../../shared/ui/sign-in-row/sign-in-row';
import { RelativeTimePipe } from '../../../shared/pipes';
import { AuthService } from '../../../core/auth/auth.service';
import type { Comment } from '../../../core/api/models';

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
    AvatarComponent,
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
            <!--
              A real toolbar, on the same pattern as the tablist above: one tab
              stop, arrow keys between the buttons. Six separate tab stops in
              front of the textarea would make reaching the box by keyboard
              slower for everyone in order to help nobody.

              It offers only marks both renderers keep, so nothing it produces
              can survive the preview and then be stripped on the way into the
              database.
            -->
            <div class="toolbar" role="toolbar" [attr.aria-label]="'comments.formatting' | transloco">
              @for (mark of MARKS; track mark.name) {
                <button
                  type="button"
                  class="tool"
                  [attr.aria-label]="'comments.mark.' + mark.name | transloco"
                  [attr.title]="'comments.mark.' + mark.name | transloco"
                  [tabindex]="focused() === $index ? 0 : -1"
                  [disabled]="busy()"
                  (click)="applyMark(mark.name)"
                  (keydown)="onToolKeydown($event, $index)"
                >
                  @if (mark.letter) {
                    <span [class]="'letter letter--' + mark.name">{{ mark.letter }}</span>
                  } @else {
                    <bah-icon [name]="mark.icon!" [size]="15" />
                  }
                </button>
              }
            </div>

            <textarea
              #editor
              class="input body"
              [attr.placeholder]="'comments.placeholder' | transloco"
              [attr.aria-label]="'comments.placeholder' | transloco"
              [attr.aria-describedby]="'comment-markdown-hint'"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
              (keydown)="onEditorKeydown($event)"
              [disabled]="busy()"
            ></textarea>

            <p id="comment-markdown-hint" class="hint">
              {{ 'comments.markdownHint' | transloco }}
            </p>
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
              <bah-avatar
                class="avatar"
                [avatar]="comment.author.avatar"
                [name]="comment.author.displayName"
                [size]="40"
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

    .toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 8px 14px 0;
      flex-wrap: wrap;
    }

    .tool {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border: none;
      border-radius: var(--radius-pill);
      background: none;
      color: inherit;
      opacity: 0.65;
      cursor: pointer;
      font: inherit;
    }

    .tool:hover:not(:disabled) {
      opacity: 1;
      background: color-mix(in srgb, var(--color-text) 8%, transparent);
    }

    .tool:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: -2px;
      opacity: 1;
    }

    .tool:disabled {
      opacity: 0.3;
      cursor: default;
    }

    /* The letterforms carry their own meaning, so each is styled as the thing it
       does rather than relying on the label alone. */
    .letter {
      font-family: var(--font-heading);
      font-size: 14px;
      line-height: 1;
    }

    .letter--bold {
      font-weight: 700;
    }

    .letter--italic {
      font-style: italic;
      font-weight: 600;
    }

    .letter--strike {
      text-decoration: line-through;
      font-weight: 600;
    }

    .composer .body {
      display: block;
      width: 100%;
      min-height: 90px;
      border: none;
      border-radius: 0;
      background: none;
      padding: 12px 20px 20px;
      font: inherit;
      font-size: 14px;
      resize: vertical;
    }

    .hint {
      margin: 0;
      padding: 0 20px 14px;
      font-size: 12px;
      opacity: 0.5;
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
  private readonly transloco = inject(TranslocoService);

  readonly comments = input<readonly Comment[]>([]);
  readonly busy = input(false);

  readonly post = output<string>();
  readonly remove = output<number>();

  protected readonly TABS = ['write', 'preview'] as const;

  /**
   * The toolbar, in the order it is drawn.
   *
   * Bold, italic and strikethrough are letters; the rest are icons. That is the
   * convention in every editor toolbar and it is not laziness: a B drawn from
   * 2.75px strokes at this size is a smudge, whereas the letter is exactly the
   * shape it needs to be.
   */
  protected readonly MARKS: readonly {
    name: MarkName;
    letter?: string;
    icon?: IconName;
  }[] = [
    { name: 'bold', letter: 'B' },
    { name: 'italic', letter: 'I' },
    { name: 'strike', letter: 'S' },
    { name: 'link', icon: 'link' },
    { name: 'bullet', icon: 'list-bullet' },
    { name: 'quote', icon: 'quote' },
  ];

  protected readonly tab = signal<CommentTab>('write');
  protected readonly draft = signal('');

  /** Which toolbar button holds the single tab stop. */
  protected readonly focused = signal(0);

  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  protected readonly canSubmit = computed(() => this.draft().trim().length > 0 && !this.busy());

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

  /**
   * Applies a mark to whatever is selected in the textarea.
   *
   * The edit is written through `execCommand('insertText')` rather than by
   * assigning the value. It is deprecated and it is still the only way to change
   * a textarea while keeping the browser's own undo stack: assigning `value`, or
   * pushing a new string through the signal, wipes it, so Ctrl+Z after pressing
   * Bold would throw away everything the person had typed. `setRangeText` is the
   * modern API and has the same problem. The fallback below covers the day a
   * browser finally drops it — losing undo, which is the lesser failure.
   */
  protected applyMark(mark: MarkName): void {
    const field = this.editor()?.nativeElement;
    if (!field || this.busy()) return;

    const result = applyMark(
      field.value,
      { start: field.selectionStart, end: field.selectionEnd },
      mark,
      this.transloco.translate('comments.markPlaceholder'),
    );

    // The whole field is replaced rather than the selected fragment, because a
    // line prefix edits text outside the selection and one insertText call is
    // one undo step.
    field.focus();
    field.setSelectionRange(0, field.value.length);

    if (!document.execCommand('insertText', false, result.text)) {
      field.value = result.text;
    }

    field.setSelectionRange(result.start, result.end);
    this.draft.set(field.value);
  }

  /**
   * Ctrl/Cmd+B and Ctrl/Cmd+I, because everybody tries them.
   *
   * Only the two that are universal. Binding more would start colliding with
   * what the browser and the operating system already use.
   */
  protected onEditorKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

    const mark = event.key === 'b' ? 'bold' : event.key === 'i' ? 'italic' : null;
    if (!mark) return;

    event.preventDefault();
    this.applyMark(mark);
  }

  /** Left/Right move between toolbar buttons, as the toolbar pattern requires. */
  protected onToolKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const next = (index + delta + this.MARKS.length) % this.MARKS.length;
    this.focused.set(next);

    // Focus follows, or a second arrow press does nothing — the roving tabindex
    // having moved out from under the focused element.
    const bar = (event.target as HTMLElement).parentElement;
    bar?.querySelectorAll<HTMLElement>('.tool')[next]?.focus();
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
