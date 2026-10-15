/**
 * THE BALANCE BUBBLE'S GRID — where each account's cell goes inside the Finance
 * bubble, how wide it is, and how big its amount can be.
 *
 * The bubble used to divide its capsule into one equal HALF per account, which is
 * right for the two it was designed with and wrong for anything more: at four
 * accounts each "half" was ~75 dp, the name ellipsized to `…` and the rolling
 * amount, whose digit cells clip rather than wrap, read `4,` and `3(`. So it is a
 * grid now — never more than TWO columns, as many rows as it takes:
 *
 *   1 account   one full-width cell
 *   2 accounts  one row of two (the original look)
 *   3–4         two rows of two; an odd last cell keeps HALF width, LEFT-aligned
 *   5–6         three rows, and so on
 *
 * An odd cell keeps half width rather than spanning the row because a cell that
 * changes size with the account count is a column edge that moves, and the
 * left-hand column is where the eye already goes down; a centred lone cell would
 * sit on neither column.
 *
 * Positions are COMPUTED, not measured: every cell has a fixed width and height,
 * so flex-wrap lays them out exactly here, and the lit thumb can be put on the
 * selected cell from the first frame instead of after an onLayout round-trip.
 * That only holds while these constants are the ones the components use — which
 * is why `FloatingBubble`'s real padding (6, with 8 on the right) lives here and
 * the old `- 10` that assumed 5 does not.
 */

/** `FloatingBubble`'s capsule: 1 dp border, padding 6 with 8 on the right. */
export const BUBBLE_BORDER = 1;
export const BUBBLE_PAD = 6;
export const BUBBLE_PAD_RIGHT = 8;
/** Between cells, both ways. */
export const CELL_GAP = 4;
export const CELL_HEIGHT = 56;
/** Inside a cell: padding, a fixed glyph slot, and the air before the text. */
export const CELL_PAD_LEFT = 12;
export const CELL_PAD_RIGHT = 14;
export const GLYPH_WIDTH = 26;
export const GLYPH_GAP = 10;

/** The amount's design size, and micro — the type scale's floor (U21). */
export const AMOUNT_FONT = 18;
export const AMOUNT_FONT_MIN = 12.5;
/**
 * A value's width in em. Tabular digits are ~0.6 em each, but `tabular-nums`
 * only evens out DIGITS — the separators keep their own narrow advances — and
 * counting `-1,234,567.89` as thirteen digits is what made it look like it
 * needed micro when it fits at 13.5. Anything unknown is counted as a digit.
 */
export function valueEms(value: string): number {
  let ems = 0;
  for (const char of value) {
    if (char === ',' || char === '.') ems += 0.3;
    else if (char === '-' || char === '\u2212') ems += 0.4;
    else ems += 0.6;
  }
  return ems;
}

const MAX_COLUMNS = 2;

export interface GridCell {
  row: number;
  col: number;
  /** From the capsule's content box (inside border and padding). */
  x: number;
  y: number;
}

export interface BubbleGrid {
  columns: number;
  rows: number;
  cellWidth: number;
  cells: GridCell[];
  /**
   * The capsule's corner radius once it is more than one row tall — concentric
   * with the cells' (half their height, plus the padding and border around them),
   * because a full pill radius on a two-row capsule cuts into the corner cells.
   * `null` for a single row, which stays a pill.
   */
  cornerRadius: number | null;
}

/** The capsule's width as `FloatingBubble` caps it: the design's, or the screen minus 32. */
export function bubbleCapsuleWidth(screenWidth: number, design: number): number {
  return Math.min(design, screenWidth - 32);
}

export function bubbleGrid(count: number, capsuleWidth: number): BubbleGrid {
  const n = Math.max(1, Math.floor(count));
  const columns = Math.min(MAX_COLUMNS, n);
  const rows = Math.ceil(n / columns);
  const inner = capsuleWidth - BUBBLE_BORDER * 2 - BUBBLE_PAD - BUBBLE_PAD_RIGHT;
  // Floored: a cell a fraction too wide makes flex-wrap push its neighbour down.
  const cellWidth = Math.max(0, Math.floor((inner - CELL_GAP * (columns - 1)) / columns));
  const cells: GridCell[] = [];
  for (let index = 0; index < n; index++) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    cells.push({ row, col, x: col * (cellWidth + CELL_GAP), y: row * (CELL_HEIGHT + CELL_GAP) });
  }
  return {
    columns,
    rows,
    cellWidth,
    cells,
    cornerRadius: rows > 1 ? CELL_HEIGHT / 2 + BUBBLE_PAD + BUBBLE_BORDER : null,
  };
}

/** What a cell leaves for its name and amount, after padding and the glyph. */
export function cellTextWidth(cellWidth: number): number {
  return Math.max(0, cellWidth - CELL_PAD_LEFT - CELL_PAD_RIGHT - GLYPH_WIDTH - GLYPH_GAP);
}

/**
 * The amount's size: 18 when the whole formatted value fits the cell, smaller in
 * half-steps when it does not, never below micro. The same idea as
 * `figureFontSize` (`stepperFont.ts`) — a size chosen from the string, right on
 * the first frame — but without its −1 letter-spacing allowance, which this
 * figure does not have, and with micro as the floor rather than 16: in a 150 dp
 * cell, 16 is exactly the size that clipped.
 */
export function amountFontSize(value: string, cellWidth: number): number {
  const fits = cellTextWidth(cellWidth) / Math.max(0.6, valueEms(value));
  return Math.max(AMOUNT_FONT_MIN, Math.min(AMOUNT_FONT, Math.floor(fits * 2) / 2));
}

/** Whether `value` at `amountFontSize` fits the cell whole — false only at the floor. */
export function amountFits(value: string, cellWidth: number): boolean {
  const size = amountFontSize(value, cellWidth);
  return valueEms(value) * size <= cellTextWidth(cellWidth);
}
