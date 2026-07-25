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
  styles: `
    .prose {
      font-size: inherit;
      line-height: inherit;
    }

    .prose :first-child {
      margin-top: 0;
    }

    .prose :last-child {
      margin-bottom: 0;
    }

    .prose p {
      margin: 0 0 0.9em;
    }

    .prose h2,
    .prose h3,
    .prose h4 {
      margin: 1.4em 0 0.5em;
    }

    .prose h2 {
      font-size: 1.25em;
    }

    .prose h3 {
      font-size: 1.1em;
    }

    .prose ul,
    .prose ol {
      margin: 0 0 0.9em;
      padding-left: 1.3em;
      list-style: revert;
    }

    .prose li {
      margin-bottom: 0.3em;
    }

    .prose blockquote {
      margin: 0 0 0.9em;
      padding-left: 14px;
      border-left: 2px solid var(--color-accent-300);
      opacity: 0.85;
    }

    .prose code {
      font-size: 0.9em;
      background: color-mix(in srgb, var(--color-text) 8%, transparent);
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }

    .prose img {
      max-width: 100%;
      border-radius: var(--radius-lg);
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
