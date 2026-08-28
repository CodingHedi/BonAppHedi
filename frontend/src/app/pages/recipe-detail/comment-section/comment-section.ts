import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  Injector,
  afterNextRender,
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
import { appendQuote, quoteMarkdown, selectionWithin } from '../../../shared/quote';
import type { IconName } from '../../../core/icons/icons.data';
import { IconComponent } from '../../../core/icons/icon';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar';
import { MarkdownComponent } from '../../../shared/ui/markdown/markdown';
import { SignInRowComponent } from '../../../shared/ui/sign-in-row/sign-in-row';
import { TimestampComponent } from '../../../shared/ui/timestamp/timestamp';
import { AuthService } from '../../../core/auth/auth.service';
import type { Comment } from '../../../core/api/models';

type CommentTab = 'write' | 'preview';

/**
 * How tall the box may grow to fit a quote, in px.
 *
 * Enough for an attribution, a few lines of quote and a reply. Past it the field
 * scrolls instead, so quoting a long comment cannot push Publier out of reach —
 * which would be a worse failure than a scrollbar.
 */
const QUOTE_BOX_MAX = 260;

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
    TimestampComponent,
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
            <div
              class="toolbar"
              role="toolbar"
              [attr.aria-label]="'comments.formatting' | transloco"
            >
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
            <!-- The id is how quoteComment finds this comment's element again, to
                 ask whether the visitor's selection lies inside it. -->
            <li
              class="comment"
              [id]="'comment-' + comment.id"
              [class.pending]="comment.status === 'PENDING'"
            >
              <bah-avatar
                class="avatar"
                [avatar]="comment.author.avatar"
                [name]="comment.author.displayName"
                [size]="40"
              />

              <div class="content">
                <div class="byline">
                  <b>{{ comment.author.displayName }}</b>
                  <bah-timestamp [iso]="comment.createdAt" initial="relative" />

                  @if (comment.status === 'PENDING') {
                    <span class="badge-pending">{{ 'comments.pending' | transloco }}</span>
                  }

                  <!--
                    A real button in the byline rather than a bubble that appears
                    over a selection: reachable by keyboard, visible without a
                    gesture, and no positioning code to get wrong.

                    It quotes the selection when there is one inside this comment
                    and the whole comment otherwise, so one control covers both
                    "quote them" and "quote that bit of what they said".

                    Only when there is somebody to quote *as*. Rendering it
                    disabled would advertise a feature and explain nothing, which
                    is the same reason the composer shows a sentence rather than a
                    textarea nobody can type in.
                  -->
                  @if (auth.signedIn()) {
                    <button
                      type="button"
                      class="btn btn-icon btn-secondary quote"
                      [attr.aria-label]="
                        'comments.quoteAuthor' | transloco: { name: comment.author.displayName }
                      "
                      [attr.title]="'comments.quote' | transloco"
                      [disabled]="busy()"
                      (click)="quoteComment(comment)"
                    >
                      <bah-icon name="quote" [size]="14" />
                    </button>
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

    /* The first of the byline's actions takes the slack, so both sit at the right
       whether or not the delete button is there. */
    .quote {
      margin-left: auto;
    }

    .delete {
      margin-left: 0;
    }

    /* Quiet until wanted: the byline is somebody's name and a date, and two solid
       buttons in it would compete with the comment. Full strength on hover, on
       focus, and whenever the comment is hovered — so it is discoverable by
       pointer and never hidden from the keyboard. */
    .quote,
    .delete {
      opacity: 0.5;
      transition: opacity 120ms ease;
    }

    .comment:hover .quote,
    .comment:hover .delete,
    .quote:hover,
    .delete:hover,
    .quote:focus-visible,
    .delete:focus-visible {
      opacity: 1;
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
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

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
    const next =
      this.TABS[(this.TABS.indexOf(this.tab()) + delta + this.TABS.length) % this.TABS.length];
    this.tab.set(next);

    // Focus has to follow the selection or a second arrow press does nothing,
    // the roving tabindex having moved out from under the focused element.
    const list = (event.target as HTMLElement).parentElement;
    list?.querySelector<HTMLElement>(`#comment-tab-${next}`)?.focus();
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

    this.replaceThroughUndoStack(result.text);
    field.setSelectionRange(result.start, result.end);
  }

  /**
   * Replaces the whole field in a way the browser's own undo can reverse.
   *
   * `execCommand('insertText')` is deprecated and is still the only way to change
   * a textarea while keeping the native undo stack: assigning `value`, or pushing
   * a new string through the signal, wipes it — so Ctrl+Z after pressing Bold, or
   * after quoting, would throw away everything the person had typed.
   * `setRangeText` is the modern API and has the same problem. The fallback covers
   * the day a browser finally drops it, losing undo, which is the lesser failure.
   *
   * The whole field rather than the selected fragment, because a line prefix edits
   * text outside the selection and one `insertText` call is one undo step.
   *
   * It also writes synchronously, which is what lets the caller measure the field
   * immediately afterwards.
   */
  private replaceThroughUndoStack(text: string): void {
    const field = this.editor()?.nativeElement;
    if (!field) return;

    field.focus();
    field.setSelectionRange(0, field.value.length);

    if (!this.document.execCommand('insertText', false, text)) {
      field.value = text;
    }

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

  /**
   * Quotes a comment — the selection inside it if there is one, otherwise all of
   * it.
   *
   * The selection is read before anything else happens, because clicking the
   * button is a mousedown and a mousedown collapses the selection in some
   * browsers. By the time an effect or a microtask ran, there would be nothing
   * left to read.
   */
  protected quoteComment(comment: Comment): void {
    const element = this.document.getElementById(`comment-${comment.id}`);
    const view = this.document.defaultView;

    const selected = element && view ? selectionWithin(element, view) : null;

    this.insertQuote(quoteMarkdown(selected ?? comment.bodyMarkdown, comment.author.displayName));
  }

  /**
   * Drops a quote into the box and puts the caret below it.
   *
   * Public because the recipe page calls it: quoting a step or the description is
   * the same act from the visitor's side, and routing it through here keeps one
   * definition of what a quote looks like and where the caret ends up.
   */
  quote(text: string, attribution?: string | null): void {
    this.insertQuote(quoteMarkdown(text, attribution));
  }

  private insertQuote(quote: string): void {
    if (!quote || !this.auth.signedIn()) return;

    const { text, caret } = appendQuote(this.draft(), quote);

    // Write first, or the quote lands in a box the visitor cannot see and the
    // button looks as though it did nothing.
    const fromPreview = this.tab() !== 'write';
    this.tab.set('write');

    if (fromPreview) {
      // There is no textarea to write through while Preview is showing, so the
      // signal carries the text and the rest waits for the field to exist. Undo
      // cannot be preserved on this path; the alternative is refusing to quote
      // from the Preview tab, which is worse.
      this.draft.set(text);
      afterNextRender(() => this.settleEditor(caret), { injector: this.injector });
      return;
    }

    this.replaceThroughUndoStack(text);
    this.settleEditor(caret);
  }

  /**
   * Focuses the box, puts the caret where it belongs, and grows the box to fit.
   *
   * The growth is measured from `scrollHeight`, which only reports the content
   * once the content is actually in the DOM — writing through the undo stack above
   * puts it there synchronously, which is half of why that path is used. Measuring
   * after a signal write instead read the height of an empty field and set the box
   * back to its 90px minimum, clipping the reply through the middle of its letters.
   */
  private settleEditor(caret: number): void {
    const field = this.editor()?.nativeElement;
    if (!field) return;

    field.focus();
    field.setSelectionRange(caret, caret);

    // Reset before measuring, or the box can only ever grow: a second, shorter
    // quote would keep the height of the first.
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, QUOTE_BOX_MAX)}px`;

    // Past the cap the field scrolls instead of growing, so the caret has to be
    // brought back into view or the box looks empty.
    field.scrollTop = field.scrollHeight;
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
