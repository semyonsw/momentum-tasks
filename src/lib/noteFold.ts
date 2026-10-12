/**
 * WHEN A NOTE IN THE DAY LIST GETS AN ARROW.
 *
 * The note field takes line breaks now (the editor's input is multiline), so a
 * note can be a shopping list rather than a phrase. The day list shows ONE line
 * of it — a row is for scanning — and a note that does not fit that line wears
 * a ⌄ that unfolds the rest in place, without opening the editor.
 *
 * "Does not fit" is decided here from the text rather than from `onTextLayout`:
 * a measured answer arrives a frame late, flickers the arrow in, and differs
 * between a phone's font scales — while a rule on the text is the same answer on
 * every phone and can be pinned by a test. A break always folds (the second line
 * is hidden by definition); a single line folds past `FOLD_AT` characters, which
 * is about what one row holds at the default font size beside the 22 dp indent.
 *
 * Pure, so the rule is a test rather than a screenshot.
 */

/** Roughly one line of `text-label` in a day row, on a 360 dp phone. */
export const FOLD_AT = 40;

export function noteFolds(note: string): boolean {
  const text = note.trim();
  if (text === '') return false;
  return text.includes('\n') || text.length > FOLD_AT;
}
