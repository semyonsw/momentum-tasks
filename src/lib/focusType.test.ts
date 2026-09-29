import { describe, expect, it } from 'vitest';

import {
  LETTER_ADVANCE,
  NUMERAL_ADVANCE,
  UNIT_GAP,
  UNIT_RATIO,
  workNumeralSize,
} from './focusType';

/**
 * The size of the two numbers focus mode exists to show.
 *
 * Every assertion here is really checking one of two things: the line FITS the
 * width, and the lines FIT THE PHONE. The constant this replaced was safe on both
 * counts by being small enough for the worst set anybody does — which is how the
 * number you read between every pair of ordinary sets ended up sized for a set
 * you do twice a year.
 */

/** What the component draws, in dp, at a given size. The model, inverted. */
function advance(text: string): number {
  let ems = 0;
  for (const ch of text) ems += /[0-9+\-.,:]/.test(ch) ? NUMERAL_ADVANCE : LETTER_ADVANCE;
  return ems;
}

function drawnWidth(value: string, unit: string, size: number): number {
  const tail = unit === '' ? 0 : UNIT_GAP * size + advance(unit) * UNIT_RATIO * size;
  return advance(value) * size + tail;
}

describe('the working numerals', () => {
  /* A 360 dp phone, inside the gutter, with the ± box taken off. */
  const NARROW = 284;

  it('takes the ceiling when the line is short enough to have it', () => {
    expect(workNumeralSize([{ value: '5', unit: 'REPS' }], NARROW, 96)).toBe(96);
  });

  it('comes down for the worst realistic weight rather than clipping it', () => {
    const size = workNumeralSize([{ value: '+120', unit: 'KG' }], NARROW, 140);
    expect(size).toBeLessThan(140);
    expect(drawnWidth('+120', 'KG', size)).toBeLessThanOrEqual(NARROW);
  });

  it('draws both lines at one size — the smallest that fits both', () => {
    const lines = [
      { value: '+120', unit: 'KG' },
      { value: '12', unit: 'REPS' },
    ];
    const size = workNumeralSize(lines, NARROW, 140);
    const alone = workNumeralSize([lines[0]], NARROW, 140);
    expect(size).toBe(alone);
    for (const line of lines) {
      expect(drawnWidth(line.value, line.unit, size)).toBeLessThanOrEqual(NARROW);
    }
  });

  it('keeps every line inside the width, over every set and every phone', () => {
    // `MAX` and `МАКС` are in here because the one value on this screen that is
    // a WORD is the one a digit-width model gets wrong by half a line.
    for (const value of ['5', '12', '100', '32.5', '+120', '-22.5', 'MAX', 'МАКС']) {
      for (const unit of ['', 'KG', 'REPS', 'SEC', 'ПОВТ']) {
        for (const width of [120, 180, 220, 284, 340, 600]) {
          const size = workNumeralSize([{ value, unit }], width, 140);
          // Under the floor the contract changes and says so: a phone too narrow
          // for a legible number gets a legible number and clips it, rather than
          // a number nobody can read from the bench. Nothing sold reaches here.
          if (size > 40) expect(drawnWidth(value, unit, size)).toBeLessThanOrEqual(width);
          else expect(size).toBe(40);
        }
      }
    }
  });

  it('never goes under the size the same numbers have everywhere else', () => {
    expect(workNumeralSize([{ value: '+120.5', unit: 'REPS' }], 40, 140)).toBe(40);
  });

  it('falls to the floor on a width nobody has measured yet', () => {
    // Not the ceiling: one frame of a small number beats one frame of a number
    // running off the edge of the screen.
    expect(workNumeralSize([{ value: '5', unit: '' }], 0, 96)).toBe(40);
    expect(workNumeralSize([{ value: '5', unit: '' }], Number.NaN, 96)).toBe(40);
  });

  it('is the ceiling when there is nothing to measure', () => {
    expect(workNumeralSize([], 284, 96)).toBe(96);
  });
});
