import { describe, expect, it } from 'vitest';
import { applyMark, type MarkName } from './markdown-input';

/**
 * The formatting toolbar's arithmetic.
 *
 * Every case here is an off-by-one that looks right in a browser until it does
 * not, which is why this is a pure function with its own tests rather than a
 * method on the component.
 *
 * `|` marks the caret and `[...]` the selection in these helpers, so the
 * expectations read as what a person would see.
 */

/** `'a[bc]d'` → the text `'abcd'` with `bc` selected. */
function parse(marked: string): { text: string; start: number; end: number } {
  const start = marked.indexOf('[');
  const end = marked.indexOf(']');

  if (start === -1) {
    const caret = marked.indexOf('|');
    return { text: marked.replace('|', ''), start: caret, end: caret };
  }

  return {
    text: marked.replace('[', '').replace(']', ''),
    start,
    end: end - 1,
  };
}

/** The inverse, so a failure prints the selection rather than two numbers. */
function show(result: { text: string; start: number; end: number }): string {
  if (result.start === result.end) {
    return result.text.slice(0, result.start) + '|' + result.text.slice(result.start);
  }
  return (
    result.text.slice(0, result.start) +
    '[' +
    result.text.slice(result.start, result.end) +
    ']' +
    result.text.slice(result.end)
  );
}

function apply(marked: string, mark: MarkName, placeholder = 'texte'): string {
  const { text, start, end } = parse(marked);
  return show(applyMark(text, { start, end }, mark, placeholder));
}

describe('wrapping a selection', () => {
  it('wraps the selected words and keeps them selected', () => {
    // Still selected afterwards, so pressing bold then italic gives both rather
    // than italic somewhere else.
    expect(apply('très [bonne] recette', 'bold')).toBe('très **[bonne]** recette');
    expect(apply('très [bonne] recette', 'italic')).toBe('très *[bonne]* recette');
    expect(apply('très [bonne] recette', 'strike')).toBe('très ~~[bonne]~~ recette');
  });

  it('inserts a placeholder when nothing is selected, and selects it', () => {
    // Typing immediately replaces the placeholder, which is the only reason to
    // insert a word rather than an empty pair of markers.
    expect(apply('à |', 'bold')).toBe('à **[texte]**');
  });

  it('unwraps instead of nesting when the selection is already marked', () => {
    // Without this the second press produces ****bold****, which renders as
    // literal asterisks and reads as a broken button.
    expect(apply('très **[bonne]** recette', 'bold')).toBe('très [bonne] recette');
    expect(apply('très ~~[bonne]~~ recette', 'strike')).toBe('très [bonne] recette');
  });

  it('does not mistake the inside of bold for italic', () => {
    // The characters either side of `bonne` in `**bonne**` are single asterisks,
    // so a naive check unwraps one from each side and silently turns bold into
    // italic.
    expect(apply('très **[bonne]** recette', 'italic')).toBe('très ***[bonne]*** recette');
  });

  it('still unwraps genuine italic', () => {
    expect(apply('très *[bonne]* recette', 'italic')).toBe('très [bonne] recette');
  });
});

describe('prefixing lines', () => {
  it('prefixes the line the caret is on, without a selection', () => {
    expect(apply('une note|', 'quote')).toBe('[> une note]');
    expect(apply('une note|', 'bullet')).toBe('[- une note]');
  });

  it('prefixes every line the selection touches', () => {
    // Partially selecting the first and last line still marks both in full: a
    // quote marker halfway through a line is a stray angle bracket.
    expect(apply('un[e\ndeux\ntro]is', 'bullet')).toBe('[- une\n- deux\n- trois]');
  });

  it('removes the prefix when every touched line already has it', () => {
    expect(apply('[- une\n- deux]', 'bullet')).toBe('[une\ndeux]');
  });

  it('adds rather than removes when only some lines are prefixed', () => {
    // The half-marked case has to resolve one way, and marking is what the
    // person pressing a list button is asking for.
    expect(apply('[- une\ndeux]', 'bullet')).toBe('[- - une\n- deux]');
  });

  it('leaves the lines around the selection alone', () => {
    expect(apply('avant\n[milieu]\naprès', 'quote')).toBe('avant\n[> milieu]\naprès');
  });
});

describe('links', () => {
  it('wraps the selection and leaves the address to type', () => {
    // The words are written and the address is what is missing, so that is what
    // comes back selected.
    expect(apply('voir [la recette] ici', 'link')).toBe('voir [la recette]([https://]) ici');
  });

  it('selects the label when there was no selection', () => {
    expect(apply('voir |', 'link')).toBe('voir [[texte]](https://)');
  });
});

describe('round trips', () => {
  it('returns the text to exactly what it was', () => {
    // Applying and removing a mark is the operation people do most often by
    // accident, and it must not leave stray characters behind.
    for (const mark of ['bold', 'italic', 'strike', 'quote', 'bullet'] as const) {
      const original = 'une note';
      const once = applyMark(original, { start: 0, end: original.length }, mark, 'texte');
      const twice = applyMark(once.text, { start: once.start, end: once.end }, mark, 'texte');

      expect(twice.text, `${mark} did not round-trip`).toBe(original);
    }
  });
});
