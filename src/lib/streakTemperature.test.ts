import { describe, expect, it } from 'vitest';

import { STREAK_THRESHOLDS, streakTemperature } from './streakTemperature';

/**
 * The flame's three steps. Days are pinned at every boundary because they
 * must not move; weeks because they are the fix — a six-week run drawn as
 * cold as a six-day one.
 */

describe('days — unchanged at every boundary', () => {
  it.each([
    [0, 'cold'],
    [1, 'cold'],
    [6, 'cold'],
    [7, 'warm'],
    [20, 'warm'],
    [21, 'hot'],
    [365, 'hot'],
  ] as const)('%i days is %s', (n, want) => {
    expect(streakTemperature(n, 'day')).toBe(want);
  });
});

describe('weeks — the same spans of time', () => {
  it.each([
    [0, 'cold'],
    [1, 'warm'],
    [2, 'warm'],
    [3, 'hot'],
    [6, 'hot'],
  ] as const)('%i weeks is %s', (n, want) => {
    expect(streakTemperature(n, 'week')).toBe(want);
  });

  it('is the day thresholds divided by 7, never below 1', () => {
    for (const k of ['warm', 'hot'] as const) {
      expect(STREAK_THRESHOLDS.week[k]).toBe(Math.max(1, Math.round(STREAK_THRESHOLDS.day[k] / 7)));
    }
  });

  it('a six-week run is not drawn like a six-day one', () => {
    expect(streakTemperature(6, 'week')).toBe('hot');
    expect(streakTemperature(6, 'day')).toBe('cold');
  });
});

describe('unit absent', () => {
  it.each([0, 1, 6, 7, 20, 21, 100])('%i reads as days', (n) => {
    expect(streakTemperature(n)).toBe(streakTemperature(n, 'day'));
  });

  it('keeps the original day thresholds', () => {
    expect(STREAK_THRESHOLDS.day).toEqual({ warm: 7, hot: 21 });
  });
});
