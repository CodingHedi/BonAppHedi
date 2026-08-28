/**
 * Applying a formatting mark to a selection in a plain textarea.
 *
 * Pure on purpose, and separated from the component for the usual reason this
 * codebase separates things: every interesting case here is an off-by-one that
 * looks fine in a browser until the one time it does not. Wrapping a selection
 * is easy; unwrapping the mark you just applied, toggling a prefix across three
 * lines, and telling `*italic*` from the inner half of `**bold**` are not.
 *
 * The marks offered are exactly the ones both renderers keep. `MarkdownRenderer`
 * on the server and the DOMPurify list in `shared/ui/markdown/markdown.ts` both
 * allow `strong`, `em`, `del`, `blockquote`, `ul` and `a` — so nothing the
 * toolbar can produce is stripped after posting, which would be a worse failure
 * than having no toolbar: the preview would show formatting the stored comment
 * then lost.
 */

export type MarkName = 'bold' | 'italic' | 'strike' | 'link' | 'quote' | 'bullet';

export interface TextSelection {
  readonly start: number;
  readonly end: number;
}

export interface EditResult {
  readonly text: string;
  /** Where the caret and selection should end up, so the next keystroke lands right. */
  readonly start: number;
  readonly end: number;
}

/** Marks that wrap the selection on both sides. */
const WRAPPERS: Partial<Record<MarkName, string>> = {
  bold: '**',
  italic: '*',
  strike: '~~',
};

/** Marks that prefix every line the selection touches. */
const PREFIXES: Partial<Record<MarkName, string>> = {
  quote: '> ',
  bullet: '- ',
};

/**
 * Applies (or removes) a mark, returning the new text and where to put the
 * selection afterwards.
 *
 * `placeholder` is the word inserted when nothing is selected — localized, so it
 * arrives from the caller rather than being spelled here. It comes back selected,
 * so typing replaces it.
 */
export function applyMark(
  text: string,
  selection: TextSelection,
  mark: MarkName,
  placeholder: string,
): EditResult {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);

  if (mark === 'link') return applyLink(text, start, end, placeholder);

  const prefix = PREFIXES[mark];
  if (prefix) return applyPrefix(text, start, end, prefix);

  return applyWrapper(text, start, end, WRAPPERS[mark]!, mark, placeholder);
}

function applyWrapper(
  text: string,
  start: number,
  end: number,
  marker: string,
  mark: MarkName,
  placeholder: string,
): EditResult {
  const selected = text.slice(start, end);

  // Already wrapped? Then this press is "off", not a second layer. Without it a
  // toolbar produces ****bold**** on the second click, which renders as literal
  // asterisks and looks like the button is broken.
  if (isWrapped(text, start, end, marker, mark)) {
    return {
      text: text.slice(0, start - marker.length) + selected + text.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }

  // Selection wrapped in place, or the placeholder inserted and selected so the
  // next keystroke replaces it.
  const body = selected || placeholder;
  return {
    text: text.slice(0, start) + marker + body + marker + text.slice(end),
    start: start + marker.length,
    end: start + marker.length + body.length,
  };
}

/**
 * Whether the selection is already surrounded by this marker.
 *
 * The `italic` case is the one worth the extra condition: in `**bold**` the
 * characters either side of `bold` are single asterisks, so a naive check reads
 * it as italic and "unwrapping" turns bold into italic. Looking one character
 * further out tells the two apart.
 */
function isWrapped(
  text: string,
  start: number,
  end: number,
  marker: string,
  mark: MarkName,
): boolean {
  const before = text.slice(start - marker.length, start);
  const after = text.slice(end, end + marker.length);

  if (before !== marker || after !== marker) return false;

  if (mark === 'italic') {
    const outerBefore = text.charAt(start - marker.length - 1);
    const outerAfter = text.charAt(end + marker.length);
    if (outerBefore === '*' && outerAfter === '*') return false;
  }

  return true;
}

/**
 * Prefixes every line the selection touches, or removes the prefix when all of
 * them already have it.
 *
 * Whole lines, not the selected characters: a quote marker halfway through a
 * line is not a quote, it is a stray angle bracket. So the range is widened to
 * line boundaries first, which is also what makes clicking the button with no
 * selection at all quote the line the caret sits on.
 */
function applyPrefix(text: string, start: number, end: number, prefix: string): EditResult {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const toIndex = text.indexOf('\n', end);
  const to = toIndex === -1 ? text.length : toIndex;

  const lines = text.slice(from, to).split('\n');
  const allMarked = lines.every((line) => line.startsWith(prefix));

  const next = lines
    .map((line) => (allMarked ? line.slice(prefix.length) : prefix + line))
    .join('\n');

  return {
    text: text.slice(0, from) + next + text.slice(to),
    // The whole affected block, so pressing again toggles exactly what was
    // just changed rather than a range that has drifted.
    start: from,
    end: from + next.length,
  };
}

/**
 * `[text](url)` with the part you still have to type left selected.
 *
 * With a selection that is the URL, because the words are already written and
 * the address is what is missing. With no selection it is the text, because
 * nothing is written yet.
 */
function applyLink(text: string, start: number, end: number, placeholder: string): EditResult {
  const selected = text.slice(start, end);
  const label = selected || placeholder;
  const url = 'https://';

  const inserted = `[${label}](${url})`;
  const selectFrom = selected ? start + label.length + 3 : start + 1;
  const selectTo = selected ? selectFrom + url.length : start + 1 + label.length;

  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    start: selectFrom,
    end: selectTo,
  };
}
