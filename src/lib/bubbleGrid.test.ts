import { describe, expect, it } from 'vitest';

import {
  AMOUNT_FONT,
  AMOUNT_FONT_MIN,
  BUBBLE_BORDER,
  BUBBLE_PAD,
  BUBBLE_PAD_RIGHT,
  CELL_GAP,
  CELL_HEIGHT,
  amountFits,
  amountFontSize,
  bubbleCapsuleWidth,
  bubbleGrid,
  cellTextWidth,
  valueEms,
} from './bubbleGrid';

/**
 * The bug this replaces: four accounts split into four ~75 dp "halves", names
 * read `…` and amounts clipped to `4,`. Every case below is a count or a screen
 * the user actually has, or the next one up.
 */

const FINANCE = 326;
const capsuleAt = (screen: number) => bubbleCapsuleWidth(screen, FINANCE);

describe('the capsule width', () => {
  it('is the design width on ordinary phones', () => {
    expect(capsuleAt(360)).toBe(326);
    expect(capsuleAt(411)).toBe(326);
  });

  it('is the screen minus 32 on a narrow one', () => {
    expect(capsuleAt(320)).toBe(288);
  });
});

describe('the cell width matches the real FloatingBubble padding', () => {
  it('fills the content box exactly: border 1 each side, padding 6 and 8 on the right', () => {
    expect(BUBBLE_BORDER).toBe(1);
    expect(BUBBLE_PAD).toBe(6);
    expect(BUBBLE_PAD_RIGHT).toBe(8);
    const grid = bubbleGrid(4, 326);
    const inner = 326 - 2 - 6 - 8;
    expect(grid.cellWidth * 2 + CELL_GAP).toBe(inner);
  });

  it('never rounds a row past the content box, so flex-wrap cannot push a cell down', () => {
    for (let width = 250; width <= 340; width++) {
      const grid = bubbleGrid(4, width);
      expect(grid.cellWidth * 2 + CELL_GAP).toBeLessThanOrEqual(width - 16);
      expect(Number.isInteger(grid.cellWidth)).toBe(true);
    }
  });
});

describe('the layout per account count', () => {
  it('1 account: one full-width cell, still a pill', () => {
    const grid = bubbleGrid(1, 326);
    expect(grid).toMatchObject({ columns: 1, rows: 1, cellWidth: 310, cornerRadius: null });
    expect(grid.cells).toEqual([{ row: 0, col: 0, x: 0, y: 0 }]);
  });

  it('2 accounts: one row of two, the original look', () => {
    const grid = bubbleGrid(2, 326);
    expect(grid).toMatchObject({ columns: 2, rows: 1, cellWidth: 153, cornerRadius: null });
    expect(grid.cells).toEqual([
      { row: 0, col: 0, x: 0, y: 0 },
      { row: 0, col: 1, x: 157, y: 0 },
    ]);
  });

  it('3 accounts: the odd one keeps half width, alone on the left of row two', () => {
    const grid = bubbleGrid(3, 326);
    expect(grid).toMatchObject({ columns: 2, rows: 2, cellWidth: 153 });
    expect(grid.cells[2]).toEqual({ row: 1, col: 0, x: 0, y: CELL_HEIGHT + CELL_GAP });
  });

  it('4 accounts: a 2x2 grid of 153 dp cells on both a 360 and a 411 screen', () => {
    for (const screen of [360, 411]) {
      const grid = bubbleGrid(4, capsuleAt(screen));
      expect(grid).toMatchObject({ columns: 2, rows: 2, cellWidth: 153 });
      expect(grid.cells).toEqual([
        { row: 0, col: 0, x: 0, y: 0 },
        { row: 0, col: 1, x: 157, y: 0 },
        { row: 1, col: 0, x: 0, y: 60 },
        { row: 1, col: 1, x: 157, y: 60 },
      ]);
    }
  });

  it('5 accounts: three rows; 7 accounts: four, the last one alone', () => {
    expect(bubbleGrid(5, 326)).toMatchObject({ columns: 2, rows: 3 });
    const seven = bubbleGrid(7, 326);
    expect(seven).toMatchObject({ columns: 2, rows: 4 });
    expect(seven.cells).toHaveLength(7);
    expect(seven.cells[6]).toEqual({ row: 3, col: 0, x: 0, y: 180 });
  });

  it('never more than two columns', () => {
    for (let count = 1; count <= 12; count++) {
      expect(bubbleGrid(count, 326).columns).toBeLessThanOrEqual(2);
    }
  });

  it('treats no accounts as one, so the screen never divides by zero', () => {
    expect(bubbleGrid(0, 326)).toMatchObject({ columns: 1, rows: 1, cellWidth: 310 });
  });

  it('rounds a multi-row capsule concentrically with its cells', () => {
    expect(bubbleGrid(4, 326).cornerRadius).toBe(CELL_HEIGHT / 2 + BUBBLE_PAD + BUBBLE_BORDER);
    expect(bubbleGrid(4, 326).cornerRadius).toBe(35);
  });
});

describe('the amount size', () => {
  it('a 2x2 cell leaves 91 dp of text room at 326, 72 at 288', () => {
    expect(cellTextWidth(153)).toBe(91);
    expect(cellTextWidth(134)).toBe(72);
  });

  it('keeps an ordinary balance at the design size', () => {
    expect(amountFontSize('48,500', 153)).toBe(AMOUNT_FONT);
    expect(amountFontSize('9,020', 153)).toBe(AMOUNT_FONT);
    expect(amountFits('48,500', 153)).toBe(true);
  });

  it('shrinks -1,234,567.89 until it fits a 2x2 cell whole', () => {
    const size = amountFontSize('-1,234,567.89', 153);
    expect(size).toBe(13.5);
    expect(valueEms('-1,234,567.89') * size).toBeLessThanOrEqual(cellTextWidth(153));
    expect(amountFits('-1,234,567.89', 153)).toBe(true);
  });

  it('fits a seven-figure debt on a 320 screen', () => {
    const cell = bubbleGrid(4, capsuleAt(320)).cellWidth;
    expect(cell).toBe(134);
    expect(amountFontSize('-1,234,567', cell)).toBe(13.5);
    expect(amountFits('-1,234,567', cell)).toBe(true);
  });

  it('stops at micro, and says so, when even that is too wide', () => {
    expect(amountFontSize('-1,234,567.89', 134)).toBe(AMOUNT_FONT_MIN);
    expect(amountFits('-1,234,567.89', 134)).toBe(false);
    expect(amountFontSize('-123,456,789,012,345.67', 153)).toBe(12.5);
  });

  it('a full-width cell holds anything at the design size', () => {
    expect(amountFontSize('-1,234,567.89', bubbleGrid(1, 326).cellWidth)).toBe(AMOUNT_FONT);
  });

  it('steps in halves, so a balance does not resize by a hair as it changes', () => {
    for (const value of ['1,234,567', '-12,345,678', '123,456.78']) {
      const size = amountFontSize(value, 153);
      expect(size * 2).toBe(Math.round(size * 2));
    }
  });

  it('counts separators narrower than digits', () => {
    expect(valueEms('1,000')).toBeCloseTo(2.7);
    expect(valueEms('-5')).toBeCloseTo(1.0);
    expect(valueEms('')).toBe(0);
    expect(amountFontSize('', 153)).toBe(AMOUNT_FONT);
  });
});
