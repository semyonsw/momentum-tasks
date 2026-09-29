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
  return 12;
}
