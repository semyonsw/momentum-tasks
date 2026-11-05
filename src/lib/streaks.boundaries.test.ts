import { describe, expect, it } from 'vitest';

import { shiftDay } from './days';
import { habitStrength, strengthSeries } from './habitStrength';
import { frozenStreak } from './streakFreeze';
import {
  excuseRange,
  longestRunIn,
  pausedUntil,
  streakOf,
  taskMonth,
  weekProgress,
  type Task,
  type TaskLog,
} from './tasks';
import {
  lastMonth,
  periodRange,
  previousPeriod,
  wrappedStats,
  yearlyWrappedOffer,
} from './wrapped';
import { pixelYears, yearPixels } from './yearPixels';

/**
 * Streaks and the calendars that frame them, at the seams: New Year, a week
 * that straddles it, a leap day, a pause written ahead, a freeze spent beside a
 * pause, a task archived mid-run. The rules are the ones each module's header
 * states; these are the days on which an off-by-one would show.
 */

const task = (over: Partial<Task> = {}): Task => ({
  id: 'a',
  name: 'A',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2025-12-01',
  reminder: null,
  archivedAt: null,
  order: 0,
  ...over,
});

/** A log from a pattern, one char per day from `from`: d done, m excused, . unanswered. */
function logOf(from: string, pattern: string, id = 'a'): TaskLog {
  const days: TaskLog[string] = {};
  [...pattern].forEach((c, i) => {
    if (c === 'd') days[shiftDay(from, i)] = { mark: 'done', note: '' };
    if (c === 'm') days[shiftDay(from, i)] = { mark: 'missed', note: '' };
  });
  return { [id]: days };
}

describe('across New Year', () => {
  it('a daily run carries from December into January', () => {
    const log = logOf('2025-12-28', 'dddddddd'); // 28 Dec → 4 Jan
    expect(streakOf(task(), log, '2026-01-04')).toBe(8);
    expect(frozenStreak(task(), log, '2026-01-04').streak).toBe(8);
    expect(longestRunIn(task(), log, '2025-12-01', '2026-01-31', '2026-01-10')).toEqual({
      days: 8,
      from: '2025-12-28',
      to: '2026-01-04',
    });
  });

  it('a week that straddles the year is one week to a weekly task', () => {
    const weekly = task({ schedule: { kind: 'weekly', times: 3 } });
    // Mon 29 Dec 2025 – Sun 4 Jan 2026: two done in December, one in January.
    const log = logOf('2025-12-29', 'd.d...d');
    const week = weekProgress(weekly, log, '2026-01-04');
    expect(week).toMatchObject({ from: '2025-12-29', to: '2026-01-04', done: 3, met: true });
    expect(weekProgress(weekly, log, '2025-12-30')).toEqual(week);
    expect(streakOf(weekly, log, '2026-01-04')).toBe(1);
  });

  it('the straddling week is judged in January by the ISO rule (its Thursday)', () => {
    const weekly = task({ schedule: { kind: 'weekly', times: 1 } });
    const log = logOf('2025-12-29', 'd');
    // Thursday 1 Jan 2026: January's week, not December's.
    expect(taskMonth(weekly, log, 2026, 0, '2026-01-31').weekTally?.met).toBe(1);
    expect(taskMonth(weekly, log, 2025, 11, '2026-01-31').weekTally?.met).toBe(0);
  });

  it('the year pages and the yearly Wrapped turn over on the right day', () => {
    expect(pixelYears([task()], '2026-01-01')).toEqual({ first: 2025, last: 2026 });
    expect(yearlyWrappedOffer('2025-12-31')).toEqual({ kind: 'year', year: 2025 });
    expect(yearlyWrappedOffer('2026-01-01')).toEqual({ kind: 'year', year: 2025 });
    expect(yearlyWrappedOffer('2026-02-01')).toBeNull();
    expect(lastMonth('2026-01-15')).toEqual({ kind: 'month', year: 2025, month: 11 });
    expect(previousPeriod({ kind: 'year', year: 2026 })).toEqual({ kind: 'year', year: 2025 });
  });

  it("December's Wrapped, read in January, counts all 31 days and nothing of January", () => {
    const log = logOf('2025-12-01', 'd'.repeat(40));
    const stats = wrappedStats({
      period: { kind: 'month', year: 2025, month: 11 },
      today: '2026-01-05',
      tasks: [task()],
      log,
    });
    expect(stats?.tasks).toEqual({ done: 31, asked: 31, percent: 100 });
    expect(stats?.streak).toMatchObject({ days: 31, from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('leap years', () => {
  it('February has 29 days in 2028 and 28 in 2026, everywhere', () => {
    expect(periodRange({ kind: 'month', year: 2028, month: 1 })).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(periodRange({ kind: 'month', year: 2026, month: 1 }).to).toBe('2026-02-28');
    const grid = (year: number) =>
      taskMonth(task({ startedOn: '2026-01-01' }), {}, year, 1, '2030-01-01')
        .weeks.flat()
        .filter((cell) => cell.date !== null).length;
    expect(grid(2028)).toBe(29);
    expect(grid(2026)).toBe(28);
  });

  it('a run over the leap day counts it', () => {
    const log = logOf('2028-02-27', 'dddd'); // 27, 28, 29 Feb, 1 Mar
    expect(streakOf(task({ startedOn: '2028-01-01' }), log, '2028-03-01')).toBe(4);
  });

  it('the year in pixels has 366 scored days in a leap year', () => {
    const t = task({ startedOn: '2028-01-01' });
    const year = yearPixels([t], logOf('2028-01-01', 'd'.repeat(366)), 2028, '2028-12-31');
    expect(year.asked).toBe(366);
    expect(year.done).toBe(366);
  });
});

describe('a pause inside a streak', () => {
  it('excused days are stepped over by the plain streak and by the freeze walk alike', () => {
    const t = task({ startedOn: '2026-09-01' });
    const done = logOf('2026-09-01', 'ddd');
    const later = logOf('2026-09-08', 'ddd');
    const paused = excuseRange(
      { a: { ...done.a, ...later.a } },
      [t],
      ['a'],
      '2026-09-04',
      '2026-09-07',
    );
    expect(paused.written).toHaveLength(4);
    expect(streakOf(t, paused.log, '2026-09-10')).toBe(6);
    const frozen = frozenStreak(t, paused.log, '2026-09-10');
    expect(frozen).toEqual({ streak: 6, held: 0, covered: [] });
  });

  it('a pause holds a freeze rather than spending it', () => {
    const t = task({ startedOn: '2026-09-01' });
    // Seven done earn one; four excused; one unanswered spends it; two done.
    const log = logOf('2026-09-01', 'dddddddmmmm.dd');
    expect(frozenStreak(t, log, '2026-09-14')).toEqual({
      streak: 9,
      held: 0,
      covered: ['2026-09-12'],
    });
    // The plain streak has no freeze, so the gap ends it.
    expect(streakOf(t, log, '2026-09-14')).toBe(2);
  });

  it('a pause that starts tomorrow is reported, and today is still answerable', () => {
    const t = task({ startedOn: '2026-09-01' });
    const { log } = excuseRange({}, [t], ['a'], '2026-09-11', '2026-09-15');
    expect(pausedUntil(t, log, '2026-09-10')).toBe('2026-09-15');
    expect(pausedUntil(t, log, '2026-09-15')).toBeNull();
  });

  it('habit strength neither gains nor loses over a pause', () => {
    const t = task({ startedOn: '2026-09-01' });
    const log = logOf('2026-09-01', 'dddddddddd' + 'mmmmm');
    expect(habitStrength(t, log, '2026-09-15')).toBeCloseTo(
      habitStrength(t, log, '2026-09-11') as number,
      9,
    );
  });
});

describe('archived mid-run', () => {
  it('the run stops on the day it was archived, and the walk does not run past it', () => {
    const t = task({ startedOn: '2026-09-01', archivedAt: new Date(2026, 8, 6, 9).toISOString() });
    const log = logOf('2026-09-01', 'ddddddddd');
    // Asked 1–5 Sep only: the marks after the archive are not part of any run.
    expect(longestRunIn(t, log, '2026-09-01', '2026-09-30', '2026-09-30')?.days).toBe(5);
  });
});

describe('a weekly task started mid-week', () => {
  it('its first week asks only for the days it existed', () => {
    // Started Saturday 12 Sep, 3 a week: only two days left, so two meet it.
    const weekly = task({ startedOn: '2026-09-12', schedule: { kind: 'weekly', times: 3 } });
    const log = logOf('2026-09-12', 'dd');
    expect(weekProgress(weekly, log, '2026-09-13')).toMatchObject({ needed: 2, met: true });
    expect(streakOf(weekly, log, '2026-09-13')).toBe(1);
  });
});

describe('habit strength at its edges', () => {
  it('is null for a one-day task and for a weekday task with no days', () => {
    expect(
      habitStrength(task({ schedule: { kind: 'once', day: '2026-09-01' } }), {}, '2026-09-10'),
    ).toBeNull();
    expect(
      habitStrength(task({ schedule: { kind: 'weekdays', days: [] } }), {}, '2026-09-10'),
    ).toBeNull();
    expect(
      strengthSeries(task({ schedule: { kind: 'once', day: '2026-09-01' } }), {}, '2026-09-10'),
    ).toBeNull();
  });

  it('a task that starts after today has no strength yet, and no points before its start', () => {
    const t = task({ startedOn: '2026-09-20' });
    expect(habitStrength(t, {}, '2026-09-10')).toBe(0);
    const series = strengthSeries(t, {}, '2026-09-10', 5);
    expect(series?.every((p) => p.value === null)).toBe(true);
  });

  it('stays within 0–100 after years of perfect days', () => {
    const t = task({ startedOn: '2020-01-01' });
    const days = 365 * 6;
    const value = habitStrength(
      t,
      logOf('2020-01-01', 'd'.repeat(days)),
      shiftDay('2020-01-01', days - 1),
    );
    expect(value).toBeGreaterThan(99);
    expect(value).toBeLessThanOrEqual(100);
  });
});

describe('a malformed today', () => {
  it("Wrapped's walk ends instead of running forever", () => {
    const stats = wrappedStats({
      period: { kind: 'month', year: 2026, month: 8 },
      today: 'garbage',
      tasks: [task()],
      log: {},
    });
    expect(stats?.tasks?.asked).toBe(30);
  });
});
