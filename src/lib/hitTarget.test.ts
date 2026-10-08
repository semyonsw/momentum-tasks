import { describe, expect, it } from 'vitest';

import { TOUCH_MIN, TOUCH_MIN_WORKOUT, hitSlopFor, reach, slopInsets } from './hitTarget';

/**
 * The touch-target pass (T-U2). The sizes in the last block are the real ones
 * from the screens; if a control shrinks, its row here is where that shows up.
 */

describe('hitSlopFor', () => {
  it('pads a 36 dp stepper button to 44', () => {
    expect(hitSlopFor(36)).toBe(4);
    expect(reach(36, hitSlopFor(36))).toBe(44);
  });

  it('pads it to 48 when the control is used mid-workout', () => {
    expect(hitSlopFor(36, TOUCH_MIN_WORKOUT)).toBe(6);
  });

  it('rounds up, because a target half a dp short is short', () => {
    expect(hitSlopFor(37)).toBe(4);
    expect(reach(37, hitSlopFor(37))).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  it('needs nothing for a control already at or past the floor', () => {
    expect(hitSlopFor(44)).toBe(0);
    expect(hitSlopFor(64)).toBe(0);
  });

  it('answers 0 for nonsense rather than NaN', () => {
    expect(hitSlopFor(Number.NaN)).toBe(0);
    expect(hitSlopFor(30, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('reaches the floor for every size from 0 to the floor', () => {
    for (let visual = 0; visual <= TOUCH_MIN; visual += 0.5) {
      expect(reach(visual, hitSlopFor(visual))).toBeGreaterThanOrEqual(TOUCH_MIN);
    }
  });
});

describe('reach', () => {
  it('ignores negative slop', () => {
    expect(reach(30, -4)).toBe(30);
  });
});

describe('slopInsets', () => {
  it('is the same on all four sides with no caps', () => {
    expect(slopInsets(36, 48)).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
  });

  it('caps the side facing a neighbour so two targets never overlap', () => {
    // The stepper: − and + sit 4 dp apart, so each gives the other at most 2.
    const minus = slopInsets(36, TOUCH_MIN_WORKOUT, { right: 2 });
    const plus = slopInsets(36, TOUCH_MIN_WORKOUT, { left: 2 });
    expect(minus.right + plus.left).toBeLessThanOrEqual(4);
    expect(minus.top).toBe(6);
    expect(plus.right).toBe(6);
  });

  it('never lets a cap grow a side', () => {
    expect(slopInsets(36, 44, { top: 20 }).top).toBe(4);
  });

  it('clamps a negative cap to 0', () => {
    expect(slopInsets(36, 44, { left: -3 }).left).toBe(0);
  });
});

describe('the controls T-U2 touched', () => {
  it('stepper − / + reach 48 vertically', () => {
    const s = slopInsets(36, TOUCH_MIN_WORKOUT, { right: 2 });
    expect(36 + s.top + s.bottom).toBe(48);
  });

  it('the Money chips (38 dp, slop 6) reach 50', () => {
    expect(reach(38, 6)).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  it('the amount editor’s Expense / Income halves (38 dp inside a 3 dp track) reach 44', () => {
    expect(reach(38, hitSlopFor(38))).toBe(44);
    // and the slop never runs past the 3 dp of track around them
    expect(hitSlopFor(38)).toBeLessThanOrEqual(3);
  });
});
