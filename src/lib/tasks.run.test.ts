import { describe, expect, it } from 'vitest';

import { longestRunIn, type Task, type TaskLog } from './tasks';

/**
 * The longest run inside a window (X1's streak card): `streakOf`'s rules, applied
 * to a month or a year rather than walked back from today.
 */

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  name: 'Reading',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-08-01',
  reminder: null,
  archivedAt: null,
  order: 0,
  ...over,
});

const marks = (days: Record<string, 'done' | 'missed'>): TaskLog => ({
  t1: Object.fromEntries(Object.entries(days).map(([d, mark]) => [d, { mark, note: '' }])),
});

const run = (from: string, n: number, mark: 'done' | 'missed' = 'done') => {
  const out: Record<string, 'done' | 'missed'> = {};
  const start = new Date(`${from}T12:00:00`);
  for (let i = 0; i < n; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out[d.toISOString().slice(0, 10)] = mark;
  }
  return out;
};

describe('longestRunIn', () => {
  it('is null when the task was never done in the window', () => {
    expect(longestRunIn(task(), {}, '2026-09-01', '2026-09-30', '2026-10-09')).toBeNull();
  });

  it('finds the longest of several runs, with its first and last day', () => {
    const log = marks({ ...run('2026-09-01', 3), ...run('2026-09-10', 5) });
    expect(longestRunIn(task(), log, '2026-09-01', '2026-09-30', '2026-10-09')).toEqual({
      days: 5,
      from: '2026-09-10',
      to: '2026-09-14',
    });
  });

  it('counts only days inside the window', () => {
    const log = marks(run('2026-08-20', 20)); // 20 Aug – 8 Sep
    expect(longestRunIn(task(), log, '2026-09-01', '2026-09-30', '2026-10-09')?.days).toBe(8);
  });

  it('steps over an excused day without counting it or breaking the run', () => {
    const log = marks({ ...run('2026-09-01', 3), '2026-09-04': 'missed', ...run('2026-09-05', 2) });
    expect(longestRunIn(task(), log, '2026-09-01', '2026-09-30', '2026-10-09')).toEqual({
      days: 5,
      from: '2026-09-01',
      to: '2026-09-06',
    });
  });

  it('counts asked days only on a weekday schedule', () => {
    // Mon/Wed/Fri: 7, 9, 11, 14 Sep done; the days between were never asked.
    const log = marks({
      '2026-09-07': 'done',
      '2026-09-09': 'done',
      '2026-09-11': 'done',
      '2026-09-14': 'done',
    });
    const mwf = task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } });
    expect(longestRunIn(mwf, log, '2026-09-01', '2026-09-30', '2026-10-09')?.days).toBe(4);
  });

  it('does not let an unanswered today end a run, nor look past today', () => {
    const log = marks(run('2026-12-01', 8)); // 1–8 Dec, today the 9th unanswered
    expect(longestRunIn(task(), log, '2026-01-01', '2026-12-31', '2026-12-09')?.days).toBe(8);
  });
});
