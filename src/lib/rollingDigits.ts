/**
 * ROLLING DIGITS — how a number is cut into columns that can each slide.
 *
 *   "9,020"  →  [9] [,] [0] [2] [0]
 *                p5  p4c p3  p2  p1      ← keys, counted from the RIGHT
 *
 * Each digit is a clipped column of 0–9 translated to its value, so a change is
 * every column that moved sliding to its new place at once. That only reads as a
 * number changing if a column keeps its identity across renders — and the trap
 * is which end identity is counted from.
 *
 * ── WHY THE KEYS COUNT FROM THE RIGHT ─────────────────────────────────────
 *
 * Keyed from the left, `9 → 10` makes the column that held the 9 hold the 1 of
 * ten, and a brand-new column appear on the right for the 0: the ones digit
 * seems to jump to the tens and a zero pops in from nowhere. Keyed from the
 * right, the ones column goes 9 → 0 in place and the new tens digit is the one
 * that appears, on the left — which is what a number gaining a digit is.
 *
 * A non-digit keeps its position key AND its character in the key, so `1:05 →
 * 10:05` does not animate the colon as though it were a digit that changed.
 */

export type DigitCell =
  { kind: 'digit'; key: string; digit: number } | { kind: 'glyph'; key: string; char: string };

export function digitCells(value: string): DigitCell[] {
  const chars = Array.from(value);
  return chars.map((char, index) => {
    const position = `p${chars.length - index}`;
    if (char >= '0' && char <= '9') return { kind: 'digit', key: position, digit: Number(char) };
    return { kind: 'glyph', key: `${position}${char}`, char };
  });
}

/**
 * Where a column sits to show `digit`: one cell per digit, translated up.
 */
export function columnOffset(digit: number, lineHeight: number): number {
  return -digit * lineHeight;
}

/**
 * WHAT A COLUMN DOES WHEN ITS PROPS CHANGE — roll, snap, or nothing.
 *
 *   same digit, same size  ─►  nothing
 *   new digit,  same size  ─►  roll        (a number you can see change)
 *   any digit,  new size   ─►  snap        (no animation at all)
 *
 * The snap is the fix. Focus mode sizes its numerals to the width they need
 * (`lib/focusType.ts`), so `9 → 10` reps or `97.5 → 100` kg changes the line
 * height in the same render as the digits. Rolling across a size change animated
 * from an offset measured in the OLD cell height to one in the new, and a roll
 * that was interrupted there — a re-render mid-flight, the sheet closing — could
 * stop between two cells: the clipped box showed half of one digit over half of
 * another until the next ± moved the column again. A size change is not a value
 * change, so nothing is animated across it.
 */
export type ColumnMove = 'none' | 'roll' | 'snap';

export function columnMove(
  prev: { digit: number; lineHeight: number },
  next: { digit: number; lineHeight: number },
): ColumnMove {
  if (prev.lineHeight !== next.lineHeight) return 'snap';
  if (prev.digit !== next.digit) return 'roll';
  return 'none';
}

/**
 * WHETHER A FINISHED ROLL MAY PIN ITS COLUMN — only if it is still the latest.
 *
 * A roll ends by setting its target outright, so a column a native frame left a
 * hair short still lands on its cell. But on the native driver the `finished`
 * callback arrives asynchronously, and on fast ± taps it can arrive AFTER the
 * next roll has started: pinning then stops the new roll and parks the column on
 * the OLD digit — or, if the size changed in between (`9 → 10` reps), on an
 * offset measured in the old cell height, which is half of one digit over half
 * of another. That was the "stuck number" in focus mode. Each roll carries the
 * generation it was started in, and only the current generation may pin.
 */
export function mayPin(
  rollGeneration: number,
  currentGeneration: number,
  finished: boolean,
): boolean {
  return finished && rollGeneration === currentGeneration;
}
