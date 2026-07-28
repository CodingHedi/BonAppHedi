import { describe, expect, it } from 'vitest';
import { QUOTE_LIMIT, appendQuote, quoteMarkdown, selectionWithin } from './quote';

/**
 * The quoted text ends up in a comment body, so these are mostly about markdown
 * that renders as something other than a quote — which looks like the button
 * being broken rather than like a formatting subtlety.
 */

describe('quoteMarkdown', () => {
  it('prefixes every line', () => {
    expect(quoteMarkdown('one\ntwo')).toBe('> one\n> two');
  });

  it('keeps a paragraph break as a bare marker', () => {
    // A dropped blank line joins two paragraphs into one; a `> ` with a trailing
    // space is a line with whitespace on it. `>` alone is the correct spelling.
    expect(quoteMarkdown('one\n\ntwo')).toBe('> one\n>\n> two');
  });

  it('puts the attribution inside the quote, not above it', () => {
    // Above it, the name reads as the quoter's own words as soon as anything is
    // typed in between.
    expect(quoteMarkdown('Bonne recette.', 'Camille')).toBe('> **Camille** :\n> Bonne recette.');
  });

  it('escapes emphasis characters in a name', () => {
    // A chosen name is free text. `*Bob*` would close the bold wrapping it and
    // leave stray asterisks in the byline.
    expect(quoteMarkdown('x', '*Bob*')).toBe('> **\\*Bob\\*** :\n> x');
  });

  it('ignores an attribution that is only whitespace', () => {
    expect(quoteMarkdown('x', '   ')).toBe('> x');
    expect(quoteMarkdown('x', null)).toBe('> x');
  });

  it('is empty for text that is empty or only whitespace', () => {
    // So the caller can treat "nothing to quote" as falsy rather than inserting
    // a lone `>` that renders as an empty grey bar.
    expect(quoteMarkdown('')).toBe('');
    expect(quoteMarkdown('   \n  ')).toBe('');
  });

  it('normalises Windows line endings', () => {
    expect(quoteMarkdown('one\r\ntwo')).toBe('> one\n> two');
  });

  it('nests when quoting something that is already a quote', () => {
    // Correct markdown, and the right meaning: the outer quote contains an inner
    // one. Stripping the inner marker would attribute it to the wrong person.
    expect(quoteMarkdown('> Camille a dit')).toBe('> > Camille a dit');
  });

  describe('length', () => {
    it('leaves anything within the limit alone', () => {
      const text = 'x'.repeat(QUOTE_LIMIT);
      expect(quoteMarkdown(text)).toBe(`> ${text}`);
    });

    it('cuts a long quote at a word boundary', () => {
      const text = `${'word '.repeat(120)}end`;
      const quoted = quoteMarkdown(text);

      expect(quoted.endsWith('…')).toBe(true);
      // Cut between words, not through one.
      expect(quoted).not.toMatch(/wor…$/);
      expect(quoted.length).toBeLessThan(QUOTE_LIMIT + 10);
    });

    it('cuts mid-word when there is no word boundary worth using', () => {
      // One enormous word — a pasted URL is the realistic case. Cutting at the
      // last space would throw almost all of it away, so the character limit wins
      // and the cut lands mid-word, still ellipsised.
      const quoted = quoteMarkdown('y'.repeat(QUOTE_LIMIT + 50));
      expect(quoted.endsWith('…')).toBe(true);
      expect(quoted.length).toBe(QUOTE_LIMIT + 3); // '> ' + limit + ellipsis
    });
  });
});

describe('appendQuote', () => {
  it('leaves the caret on an empty line after the quote', () => {
    // Inside the quote, the reply would be attributed to the person quoted.
    const { text, caret } = appendQuote('', '> hello');
    expect(text).toBe('> hello\n\n');
    expect(caret).toBe(text.length);
  });

  it('separates from existing text with a blank line', () => {
    // Markdown needs one, or the blockquote is swallowed into the paragraph above
    // and renders as literal angle brackets.
    expect(appendQuote('Already typing.', '> hello').text).toBe('Already typing.\n\n> hello\n\n');
  });

  it('does not stack blank lines when the draft already ends with them', () => {
    expect(appendQuote('Typing.\n\n\n', '> hello').text).toBe('Typing.\n\n> hello\n\n');
  });

  it('is a no-op for an empty quote', () => {
    expect(appendQuote('kept', '')).toEqual({ text: 'kept', caret: 'kept'.length });
  });
});

describe('selectionWithin', () => {
  /** The smallest thing that behaves like the bits of Selection this reads. */
  function fakeView(selection: Partial<Selection> | null): Window {
    return { getSelection: () => selection as Selection | null } as unknown as Window;
  }

  const root = { contains: (node: unknown) => node === 'inside' } as unknown as Element;

  it('returns the selected text when it lies inside the root', () => {
    const view = fakeView({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ commonAncestorContainer: 'inside' }) as unknown as Range,
      toString: () => ' a phrase ',
    });

    expect(selectionWithin(root, view)).toBe('a phrase');
  });

  it('returns null when the selection is somewhere else on the page', () => {
    // Both ends are checked through commonAncestorContainer, so a selection that
    // starts here and ends three paragraphs down is not a quote of this block —
    // and toString() of it would silently include everything in between.
    const view = fakeView({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ commonAncestorContainer: 'elsewhere' }) as unknown as Range,
      toString: () => 'not mine',
    });

    expect(selectionWithin(root, view)).toBeNull();
  });

  it('returns null for a collapsed selection, which is just a caret', () => {
    const view = fakeView({ isCollapsed: true, rangeCount: 1 });
    expect(selectionWithin(root, view)).toBeNull();
  });

  it('returns null when there is no selection at all', () => {
    expect(selectionWithin(root, fakeView(null))).toBeNull();
  });

  it('returns null when the selection is only whitespace', () => {
    // Double-clicking a gap between words selects a space. That is not a quote.
    const view = fakeView({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ commonAncestorContainer: 'inside' }) as unknown as Range,
      toString: () => '   ',
    });

    expect(selectionWithin(root, view)).toBeNull();
  });
});
