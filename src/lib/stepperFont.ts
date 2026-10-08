/**
 * The size of the number between a stepper's − and +, picked from its length.
 *
 * It used to be `adjustsFontSizeToFit`, which on Android measures against the
 * width the text had on its FIRST layout pass — and inside a row of three
 * flex-1 wells that pass runs before the row has a width, so every number on the
 * AI review screen opened at the minimum scale (a 4 the size of a full stop) and
 * only grew back once a tap re-rendered that one cell. A size chosen from the
 * string is the same on the first frame as on every later one.
 *
 * The slot is ~34 dp between two 30 dp buttons on a 360 dp phone: two digits fit
 * at 20, `22.5` or `BW` wide glyphs need less.
 */
export function stepperFontSize(value: string): number {
  const length = value.length;
  if (length <= 2) return 20;
  if (length === 3) return 17;
  if (length === 4) return 14;
  // Micro, the type scale's floor (U21): a five-character value is tight in the
  // slot, but text smaller than the app's smallest step is not a size, it's a smudge.
  return 12.5;
}

/**
 * The same decision for a stat in the AI's summary card: ~100 dp of a
 * three-up row, holding anything from `4` to `124,500 ֏`.
 */
export function statFontSize(value: string): number {
  const length = value.length;
  if (length <= 6) return 20;
  if (length <= 9) return 16;
  return 13;
}

/**
 * A segmented control's label: 13.5 when it fits the cell, smaller when a
 * translation runs long (`Выбрать дни` is half again `Pick days`), never below
 * micro (12.5, U21). It was `adjustsFontSizeToFit` too, with exactly the failure above — the
 * four equal cells have no width on the first pass, so every label in the
 * Repeats control opened at the floor, pinned to the cell's top-left corner.
 *
 * `cellWidth` is the room inside one cell, 0 before the track is measured —
 * which answers full size, since a label that is briefly too wide clips rather
 * than shrinking to nothing. 0.6 em is a semibold glyph's average width.
 */
export function segmentFontSize(label: string, cellWidth: number): number {
  const full = 13.5;
  const natural = label.length * 0.6 * full;
  if (cellWidth <= 0 || natural <= cellWidth) return full;
  return Math.max(12.5, Math.floor(((full * cellWidth) / natural) * 2) / 2);
}

/**
 * The big number on a Home tile — the balance, anything from `0` to
 * `-1,234,567` — sized to the tile's inner `width`: 26 when it fits, down to 16.
 * Tabular digits at −1 letter-spacing are ~0.6 em less 1 dp each.
 */
export function figureFontSize(value: string, width: number): number {
  const fits = (width / Math.max(1, value.length) + 1) / 0.6;
  return Math.max(16, Math.min(26, Math.floor(fits)));
}
