import { describe, expect, it } from 'vitest';

import { HISTORY_GROW_AHEAD, monthsToRender, nearEnd, rowsIn } from './historyWindow';

describe('monthsToRender', () => {
  it('renders nothing for an empty log', () => {
    expect(monthsToRender([], 24)).toBe(0);
  });

  it('always renders the newest month, even past the budget', () => {
    expect(monthsToRender([40, 10], 24)).toBe(1);
  });

  it('takes whole months until the budget is covered', () => {
    // 12 + 10 = 22 < 24, so a third month is needed.
    expect(monthsToRender([12, 10, 9, 11], 24)).toBe(3);
    expect(monthsToRender([12, 12, 9], 24)).toBe(2);
  });

  it('never goes past the end of the log', () => {
    expect(monthsToRender([3, 2], 100)).toBe(2);
  });

  it('reaches a workout somebody asked to open, however far back', () => {
    expect(monthsToRender([12, 12, 12, 12, 12], 24, 4)).toBe(5);
    expect(monthsToRender([12, 12, 12], 24, 0)).toBe(2);
  });
});

describe('rowsIn', () => {
  it('counts the workouts in the first n months', () => {
    expect(rowsIn([12, 10, 9], 2)).toBe(22);
    expect(rowsIn([12, 10, 9], 9)).toBe(31);
    expect(rowsIn([], 3)).toBe(0);
  });
});

describe('nearEnd', () => {
  it('grows only when the bottom is within reach', () => {
    expect(nearEnd(0, 800, 5000)).toBe(false);
    expect(nearEnd(5000 - 800 - HISTORY_GROW_AHEAD, 800, 5000)).toBe(true);
  });

  it('ignores a scroll event with no measurements yet', () => {
    expect(nearEnd(Number.NaN, 800, 5000)).toBe(false);
  });
});
