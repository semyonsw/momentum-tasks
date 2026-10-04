import { describe, expect, it } from 'vitest';

import { columnMove, columnOffset, digitCells } from './rollingDigits';
import { workNumeralSize } from './focusType';

/**
 * The columns, not the animation. The animation is only right if the columns
 * keep their identity, and that is arithmetic — see the file header.
 */

describe('cutting a number into columns', () => {
  it('makes a column per digit and a glyph per separator', () => {
    expect(digitCells('9,020')).toEqual([
      { kind: 'digit', key: 'p5', digit: 9 },
      { kind: 'glyph', key: 'p4,', char: ',' },
      { kind: 'digit', key: 'p3', digit: 0 },
      { kind: 'digit', key: 'p2', digit: 2 },
      { kind: 'digit', key: 'p1', digit: 0 },
    ]);
  });

  it('keeps the ones column when the number gains a digit', () => {
    const before = digitCells('9');
    const after = digitCells('10');
    // The ones digit is p1 on both sides: it rolls 9 → 0 in place.
    expect(before[0]).toEqual({ kind: 'digit', key: 'p1', digit: 9 });
    expect(after[1]).toEqual({ kind: 'digit', key: 'p1', digit: 0 });
    // And the new digit is the one on the left.
    expect(after[0]).toEqual({ kind: 'digit', key: 'p2', digit: 1 });
  });

  it('does not reuse a separator key for a digit', () => {
    const keys = digitCells('1:05').map((cell) => cell.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('p3:');
  });

  it('treats a sign and a percent as glyphs', () => {
    expect(digitCells('+2%').map((cell) => cell.kind)).toEqual(['glyph', 'digit', 'glyph']);
  });

  it('is empty for an empty string', () => {
    expect(digitCells('')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Where a column comes to rest                                        */
/* ------------------------------------------------------------------ */

describe('a column moving', () => {
  it('sits one cell up per digit', () => {
    expect(columnOffset(0, 60)).toBeCloseTo(0);
    expect(columnOffset(1, 60)).toBe(-60);
    expect(columnOffset(9, 92)).toBe(-828);
  });

  it('does nothing when neither the digit nor the size changed', () => {
    expect(columnMove({ digit: 4, lineHeight: 92 }, { digit: 4, lineHeight: 92 })).toBe('none');
  });

  it('rolls to a new digit at the same size', () => {
    expect(columnMove({ digit: 4, lineHeight: 92 }, { digit: 5, lineHeight: 92 })).toBe('roll');
    expect(columnMove({ digit: 9, lineHeight: 92 }, { digit: 0, lineHeight: 92 })).toBe('roll');
  });

  it('SNAPS when the size changes, digit or no digit', () => {
    expect(columnMove({ digit: 7, lineHeight: 132 }, { digit: 0, lineHeight: 110 })).toBe('snap');
    expect(columnMove({ digit: 7, lineHeight: 132 }, { digit: 7, lineHeight: 110 })).toBe('snap');
  });
});

/**
 * A column the way `DigitColumn` drives it. A render that brings a new value
 * arrives while the last roll is `progressed` of the way there; the effect stops
 * that roll where it is and starts the next one from that spot (`stopAnimation`).
 * A render with the same digit and size leaves an in-flight roll running. When
 * everything settles, every column must rest on exactly its own cell — the box
 * showing half of two digits is the bug.
 */
class Column {
  offset: number;
  private shown: { digit: number; lineHeight: number };
  private target: number | null = null;

  constructor(digit: number, lineHeight: number) {
    this.offset = columnOffset(digit, lineHeight);
    this.shown = { digit, lineHeight };
  }

  set(digit: number, lineHeight: number, progressed = 1) {
    if (this.target != null) this.offset += (this.target - this.offset) * progressed;
    const move = columnMove(this.shown, { digit, lineHeight });
    this.shown = { digit, lineHeight };
    if (move === 'none') return; // the roll in flight keeps going
    const to = columnOffset(digit, lineHeight);
    if (move === 'snap') {
      this.offset = to;
      this.target = null;
      return;
    }
    this.target = to;
  }

  /** The roll runs out; the finished callback sets the value outright. */
  settle() {
    if (this.target == null) return;
    this.offset = this.target;
    this.target = null;
  }
}

/** Focus mode's numeral and line height for one weight string — `FocusMode`'s arithmetic. */
function focusLineHeight(value: string): number {
  const numeral = Math.max(40, Math.min(120, workNumeralSize([{ value, unit: 'KG' }], 250, 120)));
  return Math.round(numeral * 1.1);
}

describe('columns always come to rest on a cell', () => {
  it('rolling 9 → 0 lands on 0', () => {
    const col = new Column(9, 92);
    col.set(0, 92);
    col.settle();
    expect(col.offset).toBeCloseTo(0);
  });

  it('a size change mid-roll snaps straight to the new cell, with nothing left in flight', () => {
    const col = new Column(7, 132);
    col.set(8, 132);
    col.set(0, 110, 0.3); // `97.5` → `100`: the numeral shrinks with the digits
    expect(col.offset).toBeCloseTo(columnOffset(0, 110));
    col.settle();
    expect(col.offset).toBeCloseTo(columnOffset(0, 110));
  });

  it('a roll cut short by the next value ends on the next value', () => {
    const col = new Column(2, 92);
    col.set(5, 92);
    col.set(6, 92, 0.37);
    col.settle();
    expect(col.offset).toBe(columnOffset(6, 92));
  });

  it('a re-render with the same value does not stop a roll half-way', () => {
    const col = new Column(2, 92);
    col.set(5, 92);
    col.set(5, 92, 0.4); // a parent re-render mid-roll
    col.settle();
    expect(col.offset).toBe(columnOffset(5, 92));
  });

  it('the focus-mode numeral really does change size with the digits (why the snap exists)', () => {
    expect(focusLineHeight('100')).not.toBe(focusLineHeight('97.5'));
  });

  it('400 presses of the weight chips, cut short at random, every column ends on its digit', () => {
    const steps = [2, 0.5, -0.5, -2, 2, 2, -0.5, 2];
    const progress = [0.1, 0.5, 1, 0.33, 0.9];
    let kg = 0;
    const cols = new Map<string, Column>();
    const render = (value: string, fraction: number) => {
      const lh = focusLineHeight(value);
      for (const cell of digitCells(value)) {
        if (cell.kind !== 'digit') continue;
        const col = cols.get(cell.key);
        if (col) col.set(cell.digit, lh, fraction);
        else cols.set(cell.key, new Column(cell.digit, lh));
      }
      // A column whose key left the number unmounts; one that returns mounts fresh.
      const live = new Set(digitCells(value).map((c) => c.key));
      for (const key of [...cols.keys()]) if (!live.has(key)) cols.delete(key);
    };
    for (let i = 0; i < 400; i++) {
      kg = Math.max(0, Number((kg + steps[i % steps.length]).toFixed(2)));
      render(String(kg), progress[i % progress.length]);
      render(String(kg), 0.2); // and an unrelated re-render while it rolls
    }
    const final = String(kg);
    const lh = focusLineHeight(final);
    for (const col of cols.values()) col.settle();
    for (const cell of digitCells(final)) {
      if (cell.kind !== 'digit') continue;
      expect(cols.get(cell.key)!.offset).toBeCloseTo(columnOffset(cell.digit, lh));
    }
  });
});
