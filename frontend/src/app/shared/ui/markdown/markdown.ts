import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Renders recipe and comment bodies.
 *
 * Two mutually exclusive inputs, and the distinction matters:
 *
 *   [markdown] — untrusted source, rendered here and sanitized here. Used for
 *                the admin editor's live preview, the comment "preview" tab,
 *                and in milestone 1 for recipe bodies, since with no server
 *                there is nothing that could have pre-rendered them.
 *
 *   [html]     — already rendered AND sanitized server-side (milestone 2).
 *                Reads are then a plain column select rather than a parse on
 *                every request.
 *
 * Both paths still pass through Angular's own sanitizer on binding, so this is
 * defence in depth rather than a single point of trust.
 */
@Component({
  selector: 'bah-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="prose" [innerHTML]="rendered()"></div>`,
  /*
   * Only the wrapper is styled here, because only the wrapper exists in this
   * template. Everything inside it arrives through [innerHTML] and therefore
   * carries no `_ngcontent-*` attribute, so a scoped rule for it compiles to a
   * selector that matches nothing — which is exactly what happened: the whole
   * `.prose *` block lived here and had never once applied.
   *
   * The rules for the rendered markup are in `styles/_typography.scss`.
   */
  styles: `
    .prose {
      font-size: inherit;
      line-height: inherit;
    }
  `,
})
export class MarkdownComponent {
  readonly markdown = input<string | null>(null);
  readonly html = input<string | null>(null);

  protected readonly rendered = computed(() => {
    const trusted = this.html();
    if (trusted) return trusted;

    const source = this.markdown();
    if (!source) return '';

    // `async: false` keeps this synchronous — marked returns a Promise by
    // default when any async extension is registered, which would otherwise
    // silently render "[object Promise]".
    const parsed = marked.parse(source, { async: false }) as string;

    return DOMPurify.sanitize(parsed, {
      // Deliberately narrow. Recipe bodies are prose; anything that can execute,
      // frame, or phone home has no business here.
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4', 'hr', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    });
  });
}
