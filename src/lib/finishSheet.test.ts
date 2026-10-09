import { describe, expect, it } from 'vitest';

import { finishOpensSheet } from './finishSheet';
import { milestoneDue } from './milestones';

const quiet = { unlogged: 0, ladderMoved: false, records: 0, milestone: null };

describe('finishOpensSheet', () => {
  it('saves in one tap when there is nothing to say', () => {
    expect(finishOpensSheet(quiet)).toBe(false);
  });

  it('opens for unlogged sets, a moved ladder or a record', () => {
    expect(finishOpensSheet({ ...quiet, unlogged: 1 })).toBe(true);
    expect(finishOpensSheet({ ...quiet, ladderMoved: true })).toBe(true);
    expect(finishOpensSheet({ ...quiet, records: 2 })).toBe(true);
  });

  it('opens for a due milestone even with every set logged and no record', () => {
    const milestone = milestoneDue({ on: true, workoutNumber: 100, shown: 50 });
    expect(milestone).toBe(100);
    expect(finishOpensSheet({ ...quiet, milestone })).toBe(true);
  });

  it('stays one tap with the switch off, even at workout 100', () => {
    const milestone = milestoneDue({ on: false, workoutNumber: 100, shown: undefined });
    expect(finishOpensSheet({ ...quiet, milestone })).toBe(false);
  });
});
