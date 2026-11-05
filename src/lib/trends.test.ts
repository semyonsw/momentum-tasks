import { describe, expect, it } from 'vitest';

import { shiftDay } from './days';
import { summarizeTaskTrend, taskTrendSeries, type Task, type TaskLog } from './tasks';
import { bucketOf, rangeLength, TREND_RANGE_LABELS, TREND_RANGES, type TrendRange } from './trends';

/**
 * The window a chart is read through. Small on purpose, but every chart and the
 * persisted `tasksTrendRange` setting lean on it: a range that lost its length
 * would draw an empty chart, and one that lost its label a blank chip.
 */

const task = (over: Partial<Task> = {}): Task => ({
  id: 'a',
  name: 'A',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-01-01',
  reminder: null,
  archivedAt: null,
  order: 0,
  ...over,
});

describe('the ranges', () => {
  it('every range has a label and a bucket, and only `all` is open-ended', () => {
    for (const range of TREND_RANGES) {
      expect(TREND_RANGE_LABELS[range]).toBeTruthy();
      expect(['day', 'month']).toContain(bucketOf(range));
      if (range === 'all') expect(rangeLength(range)).toBeNull();
      else expect(rangeLength(range)).toBeGreaterThan(0);
    }
  });

  it('lengths grow with the range', () => {
    const lengths = TREND_RANGES.filter((r) => r !== 'all').map((r) => rangeLength(r) as number);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(lengths).toEqual([7, 30, 90, 365]);
  });

  it('a quarter and shorter is drawn by the day, a year and longer by the month', () => {
    const buckets: Record<TrendRange, 'day' | 'month'> = {
      week: 'day',
      month: 'day',
      quarter: 'day',
      year: 'month',
      all: 'month',
    };
    for (const range of TREND_RANGES) expect(bucketOf(range)).toBe(buckets[range]);
  });
});

describe('taskTrendSeries at the edges', () => {
  it('no tasks, or a log with nothing asked, is an empty series and a zero summary', () => {
    expect(taskTrendSeries([], {}, 'month', '2026-09-13')).toEqual([]);
    expect(summarizeTaskTrend([])).toEqual({
      days: 0,
      done: 0,
      asked: 0,
      percent: 0,
      perfectDays: 0,
    });
  });

  it('a week ends on today and spans exactly seven days', () => {
    const points = taskTrendSeries([task()], {}, 'week', '2026-09-13');
    expect(points.map((p) => p.day)).toEqual(
      Array.from({ length: 7 }, (_, i) => shiftDay('2026-09-07', i)),
    );
  });

  it('crosses a year boundary without losing or doubling a day', () => {
    const points = taskTrendSeries([task({ startedOn: '2025-06-01' })], {}, 'week', '2026-01-03');
    expect(points.map((p) => p.day)).toEqual([
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    // A task that started on New Year's Day is not asked before it.
    expect(taskTrendSeries([task()], {}, 'week', '2026-01-03')[0].day).toBe('2026-01-01');
  });

  it('`all` starts on the earliest start, ignoring a task with no start', () => {
    const tasks = [
      task({ id: 'a', startedOn: '2026-09-10' }),
      task({ id: 'b', startedOn: '' }),
      task({ id: 'c', startedOn: '2026-09-08' }),
    ];
    const points = taskTrendSeries(tasks, {}, 'all', '2026-09-12');
    expect(points[0].day).toBe('2026-09-08');
    expect(points.at(-1)?.day).toBe('2026-09-12');
  });

  it('a malformed today draws nothing rather than looping', () => {
    expect(taskTrendSeries([task()], {}, 'week', 'garbage')).toEqual([]);
    expect(taskTrendSeries([task()], {}, 'all', 'garbage')).toEqual([]);
  });

  it('`all` skips a start that is no date, instead of walking from it', () => {
    const tasks = [task({ id: 'a', startedOn: '2026-09-10' }), task({ id: 'b', startedOn: '1' })];
    expect(taskTrendSeries(tasks, {}, 'all', '2026-09-12').map((p) => p.day)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  it('a 100% day counts as perfect; the summary is over the whole range, not an average', () => {
    const log: TaskLog = {
      a: { '2026-09-12': { mark: 'done', note: '' }, '2026-09-13': { mark: 'done', note: '' } },
      b: { '2026-09-12': { mark: 'done', note: '' } },
    };
    const tasks = [task({ id: 'a' }), task({ id: 'b', order: 1 })];
    const points = taskTrendSeries(tasks, log, 'week', '2026-09-13').filter(
      (p) => p.day >= '2026-09-12',
    );
    expect(points.map((p) => p.value)).toEqual([100, 50]);
    const summary = summarizeTaskTrend(points);
    expect(summary).toEqual({ days: 2, done: 3, asked: 4, percent: 75, perfectDays: 1 });
  });
});
