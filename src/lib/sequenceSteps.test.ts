import { describe, expect, it } from 'vitest';

import { moveToIndex } from './reorder';
import { stepIndexOf, stepKey, swapsToMove } from './sequenceSteps';

/** Apply the swaps the way the store does: one adjacent exchange at a time. */
function apply<T>(list: T[], swaps: { index: number; direction: -1 | 1 }[]): T[] {
  const out = [...list];
  for (const { index, direction } of swaps) {
    const target = index + direction;
    [out[index], out[target]] = [out[target], out[index]];
  }
  return out;
}

describe('swapsToMove', () => {
  // Distinct, so the reference move can find each one by value.
  const steps = ['push', 'pull', 'legs', 'core', 'box'];

  it('lands the step exactly where a one-shot move would, in both directions', () => {
    for (let from = 0; from < steps.length; from++) {
      for (let to = 0; to < steps.length; to++) {
        const expected = moveToIndex(steps, (s) => s === steps[from], to);
        expect(apply(steps, swapsToMove(from, to, steps.length))).toEqual(expected);
      }
    }
  });

  it('is nothing for a drop where it started', () => {
    expect(swapsToMove(2, 2, 5)).toEqual([]);
  });

  it('names each swap from where the step is at that moment', () => {
    expect(swapsToMove(1, 3, 5)).toEqual([
      { index: 1, direction: 1 },
      { index: 2, direction: 1 },
    ]);
    expect(swapsToMove(3, 0, 5)).toEqual([
      { index: 3, direction: -1 },
      { index: 2, direction: -1 },
      { index: 1, direction: -1 },
    ]);
  });

  it('clamps a target past either end and ignores a step that is not there', () => {
    expect(swapsToMove(0, 9, 3)).toHaveLength(2);
    expect(swapsToMove(2, -4, 3)).toHaveLength(2);
    expect(swapsToMove(7, 0, 3)).toEqual([]);
  });
});

describe('stepKey', () => {
  it('round-trips a position, and refuses anything else', () => {
    expect(stepIndexOf(stepKey(0))).toBe(0);
    expect(stepIndexOf(stepKey(12))).toBe(12);
    expect(stepIndexOf('r_abc')).toBe(-1);
  });
});
