import { describe, expect, it } from 'vitest';

import { planReminders } from './reminders';
import {
  type Task,
  type TaskLog,
  clearExcused,
  dayProgress,
  excuseCells,
  entryOf,
  excuseRange,
  excusedAhead,
  pauseLength,
  pausedUntil,
  streakOf,
  taskMonth,
  taskTrendSeries,
  tasksMonth,
} from './tasks';

/**
 * Vacation mode (T3): a run of days excused in one action.
 *
 * A pause is the existing `missed`-on-purpose mark written over a range, so what
 * these pin is that the range behaves exactly like that many single skips — the
 * streak walks over it, the denominator drops it — and that it never writes
 * anything a single skip would not: no `done` overwritten, no mark on a day the
 * task does not ask on, nothing for a task that was not chosen.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Read',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

function marks(taskId: string, days: Record<string, 'done' | 'missed'>): TaskLog {
  const out: TaskLog[string] = {};
  for (const [day, mark] of Object.entries(days)) out[day] = { mark, note: '' };
  return { [taskId]: out };
}

/** Every day from `from` to `to` marked done. */
function doneRun(taskId: string, from: string, to: string): TaskLog {
  const days: Record<string, 'done'> = {};
  const at = new Date(`${from}T12:00:00`);
  for (;;) {
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
    if (key > to) break;
    days[key] = 'done';
    at.setDate(at.getDate() + 1);
  }
  return marks(taskId, days);
}

describe('excuseRange', () => {
  it('the streak survives the range', () => {
    const read = task();
    // Done 1–9 September, away 10–16, done again 17–19; today the 20th.
    const before: TaskLog = {
      t1: {
        ...doneRun('t1', '2026-09-01', '2026-09-09').t1,
        ...doneRun('t1', '2026-09-17', '2026-09-19').t1,
      },
    };
    expect(streakOf(read, before, '2026-09-20')).toBe(3);
    const { log } = excuseRange(before, [read], ['t1'], '2026-09-10', '2026-09-16');
    expect(streakOf(read, log, '2026-09-20')).toBe(12);
  });

  it('the denominator shrinks on every paused day', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    expect(dayProgress([a, b], {}, '2026-09-12').total).toBe(2);
    const { log } = excuseRange({}, [a, b], ['a'], '2026-09-10', '2026-09-14');
    expect(dayProgress([a, b], log, '2026-09-12').total).toBe(1);
    expect(dayProgress([a, b], log, '2026-09-15').total).toBe(2);
    // A day with every task paused asks for nothing: the trend leaves it out.
    const all = excuseRange({}, [a, b], ['a', 'b'], '2026-09-10', '2026-09-14').log;
    const series = taskTrendSeries([a, b], all, 'week', '2026-09-16');
    expect(series.map((point) => point.day)).toEqual(['2026-09-15', '2026-09-16']);
  });

  it('never overwrites done, an earlier skip, or a note', () => {
    const read = task();
    const before: TaskLog = {
      t1: {
        '2026-09-11': { mark: 'done', note: '' },
        '2026-09-12': { mark: 'missed', note: 'ill' },
        '2026-09-13': { mark: null, note: 'airport' },
      },
    };
    const { log, written } = excuseRange(before, [read], ['t1'], '2026-09-10', '2026-09-14');
    expect(entryOf(log, 't1', '2026-09-11').mark).toBe('done');
    expect(entryOf(log, 't1', '2026-09-12')).toEqual({ mark: 'missed', note: 'ill' });
    expect(entryOf(log, 't1', '2026-09-13')).toEqual({ mark: 'missed', note: 'airport' });
    // The earlier skip is not this pause's to undo.
    expect(written.map((cell) => cell.day)).toEqual(['2026-09-10', '2026-09-13', '2026-09-14']);
  });

  it('a one-off task is excused only when its day is inside the range', () => {
    const inside = task({
      id: 'in',
      schedule: { kind: 'once', day: '2026-09-12' },
      startedOn: '2026-09-12',
    });
    const outside = task({
      id: 'out',
      schedule: { kind: 'once', day: '2026-09-25' },
      startedOn: '2026-09-25',
    });
    const { log, written } = excuseRange(
      {},
      [inside, outside],
      ['in', 'out'],
      '2026-09-10',
      '2026-09-14',
    );
    expect(written).toEqual([{ taskId: 'in', day: '2026-09-12' }]);
    expect(entryOf(log, 'in', '2026-09-12').mark).toBe('missed');
    expect(log.out).toBeUndefined();
  });

  it('marks future days ahead of time, and they stay ordinary marks', () => {
    const read = task();
    const today = '2026-09-20';
    const { log } = excuseRange({}, [read], ['t1'], '2026-09-21', '2026-09-27');
    expect(entryOf(log, 't1', '2026-09-24').mark).toBe('missed');
    // Not counted anywhere yet: the month's tally stops at today.
    const month = taskMonth(read, log, 2026, 8, today);
    expect(month.asked).toBe(20);
    expect(month.excused).toBe(7);
    // The future cell shows the pause; an unpaused future day stays blank.
    const cells = Object.fromEntries(
      month.weeks
        .flat()
        .filter((c) => c.date)
        .map((c) => [c.date, c.state]),
    );
    expect(cells['2026-09-24']).toBe('missed');
    expect(cells['2026-09-28']).toBe('blank');
    // When the day arrives the streak walks over it; tapping it done still works.
    const back = { ...log, t1: { ...log.t1, '2026-09-25': { mark: 'done' as const, note: '' } } };
    expect(entryOf(back, 't1', '2026-09-25').mark).toBe('done');
  });

  it('a paused future day gets no follow-up reminders', () => {
    const read = task({ reminder: { hour: 22, minute: 30, every: 30 } });
    const now = new Date(2026, 8, 20, 10, 0);
    const quiet = excuseRange({}, [read], ['t1'], '2026-09-21', '2026-09-22').log;
    const followUpDays = (log: TaskLog) =>
      new Set(
        planReminders({
          tasks: [read],
          lang: 'en',
          now,
          log,
        })
          .filter((r) => r.id.includes(':again'))
          .map((r) => r.id.split(':')[2]),
      );
    expect([...followUpDays({})].sort()).toEqual(['2026-09-20', '2026-09-21', '2026-09-22']);
    expect([...followUpDays(quiet)]).toEqual(['2026-09-20']);
  });

  it('writes only on days the task asks on, and only for chosen, live tasks', () => {
    const mwf = task({ id: 'mwf', schedule: { kind: 'weekdays', days: [0, 2, 4] } });
    const late = task({ id: 'late', startedOn: '2026-09-13' });
    const gone = task({ id: 'gone', archivedAt: '2026-09-05T10:00:00.000Z' });
    const other = task({ id: 'other' });
    // 14 Sep 2026 is a Monday.
    const { log } = excuseRange(
      {},
      [mwf, late, gone, other],
      ['mwf', 'late', 'gone'],
      '2026-09-10',
      '2026-09-16',
    );
    expect(Object.keys(log.mwf).sort()).toEqual(['2026-09-11', '2026-09-14', '2026-09-16']);
    expect(Object.keys(log.late).sort()).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
    ]);
    expect(log.gone).toBeUndefined();
    expect(log.other).toBeUndefined();
  });

  it('takes the two ends in either order, and leaves the log alone on junk', () => {
    const read = task();
    const forward = excuseRange({}, [read], ['t1'], '2026-09-10', '2026-09-12');
    const backward = excuseRange({}, [read], ['t1'], '2026-09-12', '2026-09-10');
    expect(backward.log).toEqual(forward.log);
    const before: TaskLog = {};
    expect(excuseRange(before, [read], ['t1'], 'soon', '2026-09-12').log).toBe(before);
    expect(pauseLength('2026-09-12', '2026-09-18')).toBe(7);
    expect(pauseLength('2026-09-18', '2026-09-12')).toBe(7);
  });
});

describe('clearExcused (Undo, Resume)', () => {
  it('takes back exactly what the pause wrote, keeping notes and later answers', () => {
    const read = task();
    const before: TaskLog = {
      t1: {
        '2026-09-12': { mark: 'missed', note: 'ill' },
        '2026-09-13': { mark: null, note: 'x' },
      },
    };
    const paused = excuseRange(before, [read], ['t1'], '2026-09-10', '2026-09-14');
    // Came home early and ticked the 14th.
    const ticked: TaskLog = {
      t1: { ...paused.log.t1, '2026-09-14': { mark: 'done', note: '' } },
    };
    const undone = clearExcused(ticked, paused.written);
    expect(entryOf(undone, 't1', '2026-09-10').mark).toBeNull();
    expect(undone.t1['2026-09-10']).toBeUndefined();
    expect(entryOf(undone, 't1', '2026-09-12')).toEqual({ mark: 'missed', note: 'ill' });
    expect(entryOf(undone, 't1', '2026-09-13')).toEqual({ mark: null, note: 'x' });
    expect(entryOf(undone, 't1', '2026-09-14').mark).toBe('done');
  });

  it('excuseCells is the inverse, and never covers an answer given since', () => {
    const read = task();
    const paused = excuseRange({}, [read], ['t1'], '2026-09-21', '2026-09-23');
    const resumed = clearExcused(paused.log, paused.written);
    const ticked: TaskLog = { t1: { '2026-09-22': { mark: 'done', note: '' } } };
    expect(excuseCells(resumed, paused.written)).toEqual(paused.log);
    const again = excuseCells(ticked, paused.written);
    expect(entryOf(again, 't1', '2026-09-22').mark).toBe('done');
    expect(entryOf(again, 't1', '2026-09-23').mark).toBe('missed');
  });

  it('leaves the log sparse: an undone pause on an empty log is an empty log', () => {
    const read = task();
    const paused = excuseRange({}, [read], ['t1'], '2026-09-10', '2026-09-14');
    expect(clearExcused(paused.log, paused.written)).toEqual({});
  });
});

describe('pausedUntil and excusedAhead', () => {
  const read = task();
  const today = '2026-09-20';

  it('names the last day of a pause running now, or starting tomorrow', () => {
    const running = excuseRange({}, [read], ['t1'], '2026-09-18', '2026-09-24').log;
    expect(pausedUntil(read, running, today)).toBe('2026-09-24');
    const tomorrow = excuseRange({}, [read], ['t1'], '2026-09-21', '2026-09-23').log;
    expect(pausedUntil(read, tomorrow, today)).toBe('2026-09-23');
  });

  it('is null for a lone skip of today, or a pause that has ended', () => {
    expect(pausedUntil(read, marks('t1', { '2026-09-20': 'missed' }), today)).toBeNull();
    const ended = excuseRange({}, [read], ['t1'], '2026-09-10', '2026-09-14').log;
    expect(pausedUntil(read, ended, today)).toBeNull();
  });

  it('steps over the days a weekday task does not ask on', () => {
    const mwf = task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } });
    // Mon 21 → Fri 25.
    const log = excuseRange({}, [mwf], ['t1'], '2026-09-21', '2026-09-25').log;
    expect(pausedUntil(mwf, log, today)).toBe('2026-09-25');
  });

  it('lists only the excusals after today, which Resume clears', () => {
    const log = excuseRange({}, [read], ['t1'], '2026-09-19', '2026-09-22').log;
    expect(excusedAhead(read, log, today).map((cell) => cell.day)).toEqual([
      '2026-09-21',
      '2026-09-22',
    ]);
    const resumed = clearExcused(log, excusedAhead(read, log, today));
    expect(entryOf(resumed, 't1', '2026-09-20').mark).toBe('missed');
    expect(entryOf(resumed, 't1', '2026-09-21').mark).toBeNull();
    expect(pausedUntil(read, resumed, today)).toBeNull();
  });
});

describe('the whole-list month with a pause in it', () => {
  it('marks a day paused only when every task that asked was excused', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    const both = excuseRange({}, [a, b], ['a', 'b'], '2026-09-14', '2026-09-16').log;
    const half = excuseRange(both, [a, b], ['a'], '2026-09-17', '2026-09-17').log;
    const month = tasksMonth([a, b], half, 2026, 8, '2026-09-20');
    const cells = Object.fromEntries(
      month.weeks
        .flat()
        .filter((c) => c.date)
        .map((c) => [c.date, c]),
    );
    expect(cells['2026-09-15'].paused).toBe(true);
    expect(cells['2026-09-15'].isBlank).toBe(true);
    expect(cells['2026-09-17'].paused).toBe(false);
    expect(cells['2026-09-17'].asked).toBe(1);
    expect(month.paused).toBe(3);
    // Paused days leave the percentage: 20 days × 2 tasks, less 3 × 2 and 1.
    expect(month.asked).toBe(40 - 6 - 1);
  });

  it('shows a pause ahead of today as paused, still outside the totals', () => {
    const a = task({ id: 'a' });
    const log = excuseRange({}, [a], ['a'], '2026-09-22', '2026-09-23').log;
    const month = tasksMonth([a], log, 2026, 8, '2026-09-20');
    const cell = month.weeks.flat().find((c) => c.date === '2026-09-22');
    expect(cell?.paused).toBe(true);
    expect(month.days).toBe(20);
  });
});
