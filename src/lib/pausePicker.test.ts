import { describe, expect, it } from 'vitest';

import {
  canPause,
  describePauseRange,
  pauseDays,
  pauseMonth,
  pausePickable,
  pauseTargets,
  pickPauseDay,
  type PauseRange,
} from './pausePicker';
import type { Task } from './tasks';

/**
 * The pause sheet's picking rules: two taps make a range, a third starts over,
 * and the button only wakes when there is a range and something to pause.
 */

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

describe('two taps pick a range', () => {
  it('the first tap is both ends, the second moves the far one', () => {
    const first = pickPauseDay(null, '2026-10-12');
    expect(first).toEqual({ from: '2026-10-12', to: '2026-10-12', open: true });
    expect(pickPauseDay(first, '2026-10-18')).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
      open: false,
    });
  });

  it('a second tap before the first day becomes the first day', () => {
    const first = pickPauseDay(null, '2026-10-12');
    expect(pickPauseDay(first, '2026-10-08')).toEqual({
      from: '2026-10-08',
      to: '2026-10-12',
      open: false,
    });
  });

  it('a third tap starts over', () => {
    const closed: PauseRange = { from: '2026-10-12', to: '2026-10-18', open: false };
    expect(pickPauseDay(closed, '2026-10-20')).toEqual({
      from: '2026-10-20',
      to: '2026-10-20',
      open: true,
    });
  });

  it('counts calendar days, both ends included', () => {
    expect(pauseDays(null)).toBe(0);
    expect(pauseDays({ from: '2026-10-12', to: '2026-10-12', open: true })).toBe(1);
    expect(pauseDays({ from: '2026-10-12', to: '2026-10-18', open: false })).toBe(7);
  });

  it('allows a year either side of today, past days included', () => {
    expect(pausePickable('2026-10-01', '2026-10-08')).toBe(true);
    expect(pausePickable('2027-10-08', '2026-10-08')).toBe(true);
    expect(pausePickable('2027-10-09', '2026-10-08')).toBe(false);
    expect(pausePickable('2025-10-07', '2026-10-08')).toBe(false);
  });
});

describe('what the button pauses', () => {
  const tasks = [
    task('b', { order: 1 }),
    task('a', { order: 0 }),
    task('gone', { order: 2, archivedAt: '2026-09-10T00:00:00.000Z' }),
  ];

  it('all tasks means every live one, in list order', () => {
    expect(pauseTargets(tasks, true, [])).toEqual(['a', 'b']);
  });

  it('unticked, only the chosen live ones', () => {
    expect(pauseTargets(tasks, false, ['b', 'gone'])).toEqual(['b']);
    expect(pauseTargets(tasks, false, [])).toEqual([]);
  });

  it('asleep without a range or without a task', () => {
    const range: PauseRange = { from: '2026-10-12', to: '2026-10-18', open: false };
    expect(canPause(null, ['a'])).toBe(false);
    expect(canPause(range, [])).toBe(false);
    expect(canPause(range, ['a'])).toBe(true);
  });
});

describe('the sheet calendar', () => {
  it('starts on Monday, pads the front, and marks the range and its ends', () => {
    // 1 October 2026 is a Thursday: three leading pads.
    const weeks = pauseMonth(
      2026,
      9,
      { from: '2026-10-12', to: '2026-10-18', open: false },
      '2026-10-05',
    );
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.day).toBe(1);
    const cells = weeks.flat().filter((c) => c !== null);
    expect(cells.length).toBe(31);
    expect(cells.filter((c) => c?.inRange).length).toBe(7);
    expect(cells.filter((c) => c?.edge).map((c) => c?.day)).toEqual([12, 18]);
    expect(cells.find((c) => c?.isToday)?.day).toBe(5);
  });
});

describe('the range line', () => {
  it('says the month once when both ends share it', () => {
    expect(describePauseRange({ from: '2026-10-12', to: '2026-10-18', open: false })).toBe(
      '12 – 18 October · 7 days',
    );
    expect(describePauseRange({ from: '2026-09-28', to: '2026-10-03', open: false })).toBe(
      '28 September – 3 October · 6 days',
    );
    expect(describePauseRange({ from: '2026-10-12', to: '2026-10-12', open: true })).toBe(
      '12 October · 1 day',
    );
    expect(describePauseRange(null)).toBeNull();
  });

  it('counts in Russian with the right form', () => {
    expect(describePauseRange({ from: '2026-10-12', to: '2026-10-14', open: false }, 'ru')).toBe(
      '12 – 14 октября · 3 дня',
    );
  });
});
