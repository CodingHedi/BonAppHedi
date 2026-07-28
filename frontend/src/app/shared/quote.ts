/**
 * Building the blockquote that a "Quote" button drops into the composer.
 *
 * Pure and separate for the reason the mark helpers next door are: the
 * interesting cases are all edge cases that look fine until they do not. Quoting
 * a comment that is itself a quote, quoting a selection that stops mid-sentence,
 * and quoting into a draft that already has text in it are three different
 * answers, and none of them is "concatenate two strings".
 *
 * `>` and `**` are the only marks used, and both survive the round trip: the
 * server's `MarkdownRenderer` and the DOMPurify list in
 * `shared/ui/markdown/markdown.ts` each keep `blockquote` and `strong`, so a
 * quote previews as it will be stored.
 */

/** How much of a long comment a quote carries before it is cut short. */
export const QUOTE_LIMIT = 400;

/**
 * `> ` in front of every line, with the attribution as a bolded first line.
 *
 * Whole lines, because a `>` halfway down a paragraph is not a quote — it is a
 * stray angle bracket, which is the same reason `applyMark`'s prefix marks widen
 * to line boundaries.
 *
 * Blank lines inside the quoted text get a bare `>` rather than being dropped:
 * `>` on its own is how a blockquote keeps a paragraph break, and dropping the
 * line would silently join two paragraphs into one.
 */
export function quoteMarkdown(text: string, attribution?: string | null): string {
  const trimmed = collapse(text);
  if (!trimmed) return '';

  const body = truncate(trimmed);

  const lines = body.split('\n').map((line) => (line.trim() === '' ? '>' : `> ${line}`));

  // The attribution is inside the quote rather than above it, so that it travels
  // with the text: a line above the blockquote reads as the quoter's own words
  // once anything else is typed in between.
  if (attribution?.trim()) {
    lines.unshift(`> **${escapeEmphasis(attribution.trim())}** :`);
  }

  return lines.join('\n');
}

/**
 * Adds a quote to whatever is already in the box, and says where the caret goes.
 *
 * A blank line before, when there is existing text, because markdown needs one to
 * start a blockquote — without it the quote is swallowed into the preceding
 * paragraph and renders as literal `>` characters. Two newlines after, so the
 * caret lands on an empty line outside the quote: continuing to type inside it
 * would attribute the reply to the person being quoted.
 */
export function appendQuote(draft: string, quote: string): { text: string; caret: number } {
  if (!quote) return { text: draft, caret: draft.length };

  const before = draft.trimEnd();
  const separator = before === '' ? '' : '\n\n';
  const text = `${before}${separator}${quote}\n\n`;

  return { text, caret: text.length };
}

/**
 * The visitor's selection if it lies inside `root`, otherwise null.
 *
 * This is what lets one button mean both "quote this step" and "quote just this
 * phrase": the caller falls back to the whole block when there is no selection,
 * so there is no second control and no floating bubble to position, and the
 * keyboard path is the same button.
 *
 * Both ends are checked, not just the anchor. A selection that starts in this
 * step and ends three paragraphs later is not a quote of this step, and taking
 * `toString()` of it would quietly include everything in between.
 */
export function selectionWithin(root: Element, view: Window): string | null {
  const selection = view.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const text = collapse(selection.toString());
  return text === '' ? null : text;
}

/** Trailing spaces gone and Windows line endings normalised, nothing else. */
function collapse(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
}

/**
 * Cut at a word boundary rather than mid-word, and only when it actually saves
 * something: a limit that trims four characters off a 404-character comment adds
 * an ellipsis for no reason.
 */
function truncate(text: string): string {
  if (text.length <= QUOTE_LIMIT) return text;

  const cut = text.slice(0, QUOTE_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');

  return `${(lastSpace > QUOTE_LIMIT * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A name containing `*` or `_` would otherwise close the bold it is wrapped in
 * and leave asterisks in the byline of the quote. Escaped rather than stripped,
 * because it is somebody's chosen name and it should read as they wrote it.
 */
function escapeEmphasis(name: string): string {
  return name.replace(/([*_`[\]])/g, '\\$1');
}
