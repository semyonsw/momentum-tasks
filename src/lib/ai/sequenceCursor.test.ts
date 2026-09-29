import { describe, expect, it } from 'vitest';

import { keepSteps } from './sequenceCursor';

const all = () => true;

describe('keepSteps', () => {
  it('leaves a loop with nothing dropped exactly as it was', () => {
    expect(keepSteps(['A', 'B', 'C'], 1, all)).toEqual({ routineIds: ['A', 'B', 'C'], next: 1 });
  });

  it('keeps "next" on the same routine when an earlier step is dropped', () => {
    const kept = keepSteps(['A', 'B', 'C'], 1, (id) => id !== 'A');
    expect(kept.routineIds[kept.next]).toBe('B');
  });

  it('moves on to the following step when the next one itself is dropped', () => {
    const kept = keepSteps(['A', 'B', 'C'], 1, (id) => id !== 'B');
    expect(kept.routineIds[kept.next]).toBe('C');
  });

  it('wraps round when the dropped next step was the last', () => {
    const kept = keepSteps(['A', 'B', 'C'], 2, (id) => id !== 'C');
    expect(kept.routineIds[kept.next]).toBe('A');
  });

  it('reads an out-of-range or junk index as a step of the loop', () => {
    expect(keepSteps(['A', 'B'], 9, all).next).toBe(1);
    expect(keepSteps(['A', 'B'], Number.NaN, all).next).toBe(0);
  });

  it('is empty when nothing is kept', () => {
    expect(keepSteps(['A'], 0, () => false)).toEqual({ routineIds: [], next: 0 });
  });
});
