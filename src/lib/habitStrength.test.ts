import { describe, expect, it } from 'vitest';

import { shiftDay } from './days';
import {
  habitStrength,
  strengthBand,
  strengthFrequency,
  strengthMultiplier,
  strengthPercent,
  strengthSeries,
} from './habitStrength';
import type { Task, TaskLog } from './tasks';

/**
 * Habit strength (T4) — Loop's decaying score over the days a task asks on.
 *
 * What these pin: more done never means less strong; the number stays 0–100;
 * one miss after a long run costs less than ten points; a weekday task does not
 * decay over its days off; and an excused day — a skip or a pause — counts as
 * neither a done nor a miss.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Read',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-01-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

/** Each day from `from` for `n` days, with the mark `pick(i, day)` returns. */
function logOf(
  from: string,
  n: number,
  pick: (i: number, day: string) => 'done' | 'missed' | null,
): TaskLog {
  const days: TaskLog[string] = {};
  for (let i = 0; i < n; i += 1) {
    const day = shiftDay(from, i);
    const mark = pick(i, day);
    if (mark) days[day] = { mark, note: '' };
  }
  return { t1: days };
}

const START = '2026-01-01';

describe('the multiplier', () => {
  it('is Loop’s half-life of 13 asked days for a daily task', () => {
    const m = strengthMultiplier(1);
    expect(Math.pow(m, 13)).toBeCloseTo(0.5, 10);
  });

  it('keeps Loop’s calendar half-life for a weekday task', () => {
    // Loop per calendar day for 3/week: 0.5^(√(3/7)/13). Per asked day here: that ^ (7/3).
    const f = 3 / 7;
    const loopPerDay = Math.pow(0.5, Math.sqrt(f) / 13);
    expect(strengthMultiplier(f)).toBeCloseTo(Math.pow(loopPerDay, 1 / f), 10);
  });

  it('reads the frequency off the schedule, and has none for a one-day task', () => {
    expect(strengthFrequency(task())).toBe(1);
    expect(strengthFrequency(task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } }))).toBe(
      3 / 7,
    );
    expect(strengthFrequency(task({ schedule: { kind: 'weekdays', days: [] } }))).toBeNull();
    expect(strengthFrequency(task({ schedule: { kind: 'once', day: START } }))).toBeNull();
    expect(habitStrength(task({ schedule: { kind: 'once', day: START } }), {}, START)).toBeNull();
  });
});

describe('habitStrength', () => {
  it('starts at zero and climbs with every done day', () => {
    const t = task();
    expect(habitStrength(t, {}, START)).toBe(0);
    const ten = logOf(START, 10, () => 'done');
    const twenty = logOf(START, 20, () => 'done');
    const a = habitStrength(t, ten, shiftDay(START, 9)) as number;
    const b = habitStrength(t, twenty, shiftDay(START, 19)) as number;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    // 13 days done from zero is exactly half.
    expect(
      habitStrength(
        t,
        logOf(START, 13, () => 'done'),
        shiftDay(START, 12),
      ),
    ).toBeCloseTo(50, 6);
  });

  it('is monotonic in completions: turning any miss into a done never lowers it', () => {
    const t = task();
    const today = shiftDay(START, 59);
    // A pseudo-random history, then each unanswered day flipped to done in turn.
    const base = logOf(START, 60, (i) => ((i * 7) % 5 < 3 ? 'done' : null));
    const before = habitStrength(t, base, today) as number;
    for (let i = 0; i < 60; i += 1) {
      const day = shiftDay(START, i);
      if (base.t1[day]?.mark === 'done') continue;
      const flipped: TaskLog = { t1: { ...base.t1, [day]: { mark: 'done', note: '' } } };
      expect(habitStrength(t, flipped, today) as number).toBeGreaterThan(before);
    }
  });

  it('is bounded 0–100, whatever the history', () => {
    const t = task({ startedOn: '2016-01-01' });
    const today = '2026-10-08';
    const all = logOf('2016-01-01', 4000, () => 'done');
    const none = logOf('2016-01-01', 4000, () => null);
    const allScore = habitStrength(t, all, today) as number;
    expect(allScore).toBeLessThanOrEqual(100);
    expect(allScore).toBeGreaterThan(99);
    expect(habitStrength(t, none, today)).toBe(0);
    expect(strengthPercent(allScore)).toBe(99);
    expect(strengthPercent(-3)).toBe(0);
    expect(strengthPercent(100)).toBe(100);
  });

  it('a single miss after a long run drops it by less than 10 points', () => {
    const today = shiftDay(START, 120);
    // Daily: 120 days done, then today's yesterday missed.
    const daily = task();
    const run = logOf(START, 120, (i) => (i === 119 ? null : 'done'));
    const full = logOf(START, 120, () => 'done');
    const drop =
      (habitStrength(daily, full, today) as number) - (habitStrength(daily, run, today) as number);
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(6);

    // Mon/Wed/Fri: the same, still under 10.
    const mwf = task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } });
    const lastMwf = (() => {
      let day = shiftDay(today, -1);
      while (![1, 3, 5].includes(new Date(`${day}T12:00:00`).getDay())) day = shiftDay(day, -1);
      return day;
    })();
    const mwfFull = logOf(START, 120, () => 'done');
    const mwfRun: TaskLog = { t1: { ...mwfFull.t1 } };
    delete mwfRun.t1[lastMwf];
    const mwfDrop =
      (habitStrength(mwf, mwfFull, today) as number) -
      (habitStrength(mwf, mwfRun, today) as number);
    expect(mwfDrop).toBeGreaterThan(0);
    expect(mwfDrop).toBeLessThan(10);
  });

  it('is schedule-aware: a weekday task does not decay over its days off', () => {
    const mwf = task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } });
    // 2026-01-02 is a Friday. Done on every asked day through Fri 30 Jan.
    const log = logOf(START, 30, () => 'done');
    const friday = habitStrength(mwf, log, '2026-01-30') as number;
    const saturday = habitStrength(mwf, log, '2026-01-31') as number;
    const sunday = habitStrength(mwf, log, '2026-02-01') as number;
    expect(saturday).toBe(friday);
    expect(sunday).toBe(friday);
    // A daily task left unanswered over the same weekend does decay.
    const daily = task();
    expect(habitStrength(daily, log, '2026-02-01') as number).toBeLessThan(
      habitStrength(daily, log, '2026-01-31') as number,
    );
  });

  it('counts an excused day (a skip or a pause) as neither done nor missed', () => {
    const t = task();
    const run = logOf(START, 30, () => 'done');
    const today = shiftDay(START, 40);
    const excused = logOf(START, 40, (i) => (i < 30 ? 'done' : 'missed'));
    // Ten excused days: exactly the score the run ended on.
    expect(habitStrength(t, excused, today)).toBeCloseTo(
      habitStrength(t, run, shiftDay(START, 30)) as number,
      10,
    );
    // Ten unanswered days instead: lower.
    expect(habitStrength(t, run, today) as number).toBeLessThan(
      habitStrength(t, excused, today) as number,
    );
  });

  it('does not count today until it is done', () => {
    const t = task();
    const log = logOf(START, 20, () => 'done');
    const today = shiftDay(START, 20);
    const yesterday = shiftDay(START, 19);
    expect(habitStrength(t, log, today)).toBe(habitStrength(t, log, yesterday));
    const ticked: TaskLog = { t1: { ...log.t1, [today]: { mark: 'done', note: '' } } };
    expect(habitStrength(t, ticked, today) as number).toBeGreaterThan(
      habitStrength(t, log, yesterday) as number,
    );
  });

  it('knows nothing before the task started', () => {
    const t = task({ startedOn: '2026-03-01' });
    const log = logOf(START, 59, () => 'done'); // all before the start
    expect(habitStrength(t, log, '2026-03-01')).toBe(0);
  });
});

describe('strengthSeries', () => {
  it('is 90 days ending today, null before the task started, the last point the score', () => {
    const t = task({ startedOn: '2026-09-01' });
    const today = '2026-10-08';
    const log = logOf('2026-09-01', 38, () => 'done');
    const series = strengthSeries(t, log, today);
    expect(series).toHaveLength(90);
    expect(series?.[89].day).toBe(today);
    expect(series?.[0].value).toBeNull();
    expect(series?.find((p) => p.day === '2026-09-01')?.value).not.toBeNull();
    expect(series?.[89].value).toBeCloseTo(habitStrength(t, log, today) as number, 10);
    // Climbing every day of an unbroken run.
    const values = (series ?? []).map((p) => p.value).filter((v): v is number => v !== null);
    for (let i = 1; i < values.length - 1; i += 1) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('has no series for a one-day task', () => {
    expect(strengthSeries(task({ schedule: { kind: 'once', day: START } }), {}, START)).toBeNull();
  });
});

describe('strengthBand', () => {
  it('names four bands and never scolds', () => {
    expect(strengthBand(94)).toBe('Strong');
    expect(strengthBand(75)).toBe('Strong');
    expect(strengthBand(60)).toBe('Steady');
    expect(strengthBand(30)).toBe('Building');
    expect(strengthBand(3)).toBe('Forming');
  });
});
