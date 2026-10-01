import { describe, expect, it } from 'vitest';

import {
  MAX_FOLLOW_UPS,
  MAX_FOLLOW_UPS_PER_DAY,
  instantOn,
  planKey,
  planReminders,
  type ReminderInputs,
} from './reminders';
import type { Task, TaskLog } from './tasks';

/**
 * The reminder plan.
 *
 * What these pin is the set of cases where the app must say NOTHING, because
 * every one of them is a phone buzzing about something that is not true: a task
 * that has not started, a one-day task whose day has gone, an archived row, a
 * workout reminder with no days. A notification the user cannot account for is
 * the thing that gets the whole channel silenced, and after that none of the
 * reminders they did want arrive either.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Read before sleep',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: { hour: 22, minute: 30 },
    archivedAt: null,
    order: 0,
    ...over,
  };
}

const SILENT_WORKOUT: ReminderInputs['workout'] = { enabled: false, days: [], time: '18:00' };

/** 13 September 2026, 10:00 local. */
function now(): Date {
  return new Date(2026, 8, 13, 10, 0, 0, 0);
}

function plan(tasks: Task[], workout: ReminderInputs['workout'] = SILENT_WORKOUT) {
  return planReminders({ tasks, workout, lang: 'en', now: now() });
}

describe('which tasks speak', () => {
  it('says nothing for a task with no reminder', () => {
    expect(plan([task({ reminder: null })])).toEqual([]);
  });

  it('says nothing for an archived task, reminder or not', () => {
    expect(plan([task({ archivedAt: '2026-09-10T00:00:00.000Z' })])).toEqual([]);
  });

  it('gives a daily task one repeating alert', () => {
    const [alert, ...rest] = plan([task()]);
    expect(rest).toEqual([]);
    expect(alert.id).toBe('task:t1:daily');
    expect(alert.title).toBe('Read before sleep');
    expect(alert.body).toBe('Every day');
    expect(alert.trigger).toEqual({ kind: 'daily', hour: 22, minute: 30 });
  });

  it('gives a weekday task one alert per day, in order', () => {
    const alerts = plan([
      task({ schedule: { kind: 'weekdays', days: [4, 0, 2] }, reminder: { hour: 7, minute: 5 } }),
    ]);
    expect(alerts.map((a) => a.id)).toEqual(['task:t1:w0', 'task:t1:w2', 'task:t1:w4']);
    expect(alerts.every((a) => a.trigger.kind === 'weekly')).toBe(true);
    expect(alerts[0].trigger).toEqual({ kind: 'weekly', weekday: 0, hour: 7, minute: 5 });
  });
});

describe('the day a task has not reached yet', () => {
  /*
   * Android's weekly trigger is a weekday and a time with no "not before", so a
   * habit that begins next month would start buzzing this week. The plan emits
   * nothing until the day arrives, and the sync that runs on every launch picks
   * it up then.
   */
  it('says nothing for a task that starts in the future', () => {
    expect(plan([task({ startedOn: '2026-10-01' })])).toEqual([]);
  });

  it('speaks on the day it starts', () => {
    expect(plan([task({ startedOn: '2026-09-13' })])).toHaveLength(1);
  });
});

describe('a one-day task', () => {
  it('gets one dated alert at its own instant', () => {
    const [alert] = plan([
      task({
        schedule: { kind: 'once', day: '2026-09-14' },
        startedOn: '2026-09-14',
        reminder: { hour: 9, minute: 0 },
      }),
    ]);
    expect(alert.id).toBe('task:t1:once');
    expect(alert.trigger).toEqual({ kind: 'date', at: instantOn('2026-09-14', 9, 0) });
  });

  // The whole point of the shape: something you wrote down for tomorrow.
  it('speaks later today, if later today has not happened yet', () => {
    const alerts = plan([
      task({
        schedule: { kind: 'once', day: '2026-09-13' },
        startedOn: '2026-09-13',
        reminder: { hour: 18, minute: 0 },
      }),
    ]);
    expect(alerts).toHaveLength(1);
  });

  it('says nothing about a moment that has already gone', () => {
    const alerts = plan([
      task({
        schedule: { kind: 'once', day: '2026-09-13' },
        startedOn: '2026-09-13',
        reminder: { hour: 8, minute: 0 },
      }),
    ]);
    expect(alerts).toEqual([]);
  });

  it('says nothing about yesterday', () => {
    const alerts = plan([
      task({
        schedule: { kind: 'once', day: '2026-09-12' },
        startedOn: '2026-09-12',
        reminder: { hour: 23, minute: 0 },
      }),
    ]);
    expect(alerts).toEqual([]);
  });
});

describe('the workout schedule', () => {
  it('is silent while it is off', () => {
    expect(plan([], { enabled: false, days: [0, 2, 4], time: '18:00' })).toEqual([]);
  });

  it('is silent with no days, however it was switched on', () => {
    expect(plan([], { enabled: true, days: [], time: '18:00' })).toEqual([]);
  });

  it('is silent on an unreadable time rather than firing at a guess', () => {
    expect(plan([], { enabled: true, days: [0], time: 'half six' })).toEqual([]);
  });

  it('gives one weekly alert per day it was told', () => {
    const alerts = plan([], { enabled: true, days: [0, 2, 4], time: '18:30' });
    expect(alerts.map((a) => a.id)).toEqual(['workout:w0', 'workout:w2', 'workout:w4']);
    expect(alerts[2].trigger).toEqual({ kind: 'weekly', weekday: 4, hour: 18, minute: 30 });
  });
});

describe('what the language changes', () => {
  it('translates the body, and never the task name', () => {
    const [alert] = planReminders({
      tasks: [task()],
      workout: SILENT_WORKOUT,
      lang: 'ru',
      now: now(),
    });
    expect(alert.title).toBe('Read before sleep');
    expect(alert.body).toBe('Каждый день');
  });
});

describe('counting', () => {
  it('arms one alert per asking day, plus the workout', () => {
    const alerts = plan([task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } })], {
      enabled: true,
      days: [1],
      time: '18:00',
    });
    // Three for the one task, one for the workout.
    expect(alerts).toHaveLength(4);
  });
});

/**
 * Two properties that hold across the whole input space rather than at one
 * example, and both are about Android's queue rather than about the app's
 * screens — which is exactly why they need pinning here: neither can be seen by
 * looking at the app, and both are wrong in a way the user experiences as
 * "the reminders are broken" with nothing on screen to explain it.
 */
describe('what the queue is handed', () => {
  it('never schedules an instant that has already gone, at any hour', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const alerts = plan([
        task({
          schedule: { kind: 'once', day: '2026-09-13' },
          startedOn: '2026-09-13',
          reminder: { hour, minute: 0 },
        }),
      ]);
      for (const alert of alerts) {
        if (alert.trigger.kind === 'date') {
          expect(alert.trigger.at).toBeGreaterThan(now().getTime());
        }
      }
    }
  });

  /*
   * The id IS the notification identifier, so a collision does not add a second
   * alert — it silently REPLACES the first. Two tasks quietly sharing one
   * reminder is the kind of bug that reads as "it only reminds me about one of
   * them" months later.
   */
  it('gives every alert an id of its own', () => {
    const alerts = plan(
      [
        task({
          id: 'a',
          schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
          reminder: { hour: 7, minute: 0 },
        }),
        task({ id: 'b', reminder: { hour: 8, minute: 0 } }),
        task({
          id: 'c',
          schedule: { kind: 'once', day: '2026-09-20' },
          startedOn: '2026-09-20',
          reminder: { hour: 9, minute: 0 },
        }),
      ],
      { enabled: true, days: [0, 1, 2], time: '18:00' },
    );
    const ids = alerts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(7 + 1 + 1 + 3);
  });
});

/**
 * Follow-ups: the "and again" alerts. What these pin is the stopping rule. An
 * answered day gets none, midnight ends them, and the caps hold, because a
 * reminder that will not stop is the one that gets the channel silenced.
 */
describe('remind again', () => {
  const at = (h: number, m = 0, day = 13) => new Date(2026, 8, day, h, m, 0, 0).getTime();
  const once = (over: Partial<Task> = {}) =>
    task({
      name: 'Call the bank',
      schedule: { kind: 'once', day: '2026-09-13' },
      startedOn: '2026-09-13',
      reminder: { hour: 11, minute: 0, every: 30 },
      ...over,
    });
  const planWith = (tasks: Task[], log?: TaskLog) =>
    planReminders({ tasks, workout: SILENT_WORKOUT, lang: 'en', now: now(), log });

  it('asks again every interval after the first, under the same name', () => {
    const alerts = planWith([once({ reminder: { hour: 22, minute: 0, every: 30 } })]);
    expect(alerts.map((a) => a.trigger)).toEqual([
      { kind: 'date', at: at(22) },
      { kind: 'date', at: at(22, 30) },
      { kind: 'date', at: at(23) },
      { kind: 'date', at: at(23, 30) },
    ]);
    expect(alerts.every((a) => a.title === 'Call the bank')).toBe(true);
    expect(alerts[1].body).toBe('Still not done · Once · 13 September');
  });

  it('stops at midnight, and never asks more than the daily cap', () => {
    const alerts = planWith([once({ reminder: { hour: 11, minute: 0, every: 15 } })]);
    expect(alerts).toHaveLength(1 + MAX_FOLLOW_UPS_PER_DAY);
    const late = planWith([once({ reminder: { hour: 23, minute: 0, every: 180 } })]);
    expect(late).toHaveLength(1);
  });

  it('says nothing at all once a one-day task is answered', () => {
    const log: TaskLog = { t1: { '2026-09-13': { mark: 'done', note: '' } } };
    expect(planWith([once()], log)).toEqual([]);
    const skipped: TaskLog = { t1: { '2026-09-13': { mark: 'missed', note: '' } } };
    expect(planWith([once()], skipped)).toEqual([]);
  });

  it('still asks after a note with no mark, which is not an answer', () => {
    const log: TaskLog = { t1: { '2026-09-13': { mark: null, note: 'rang, no answer' } } };
    expect(planWith([once()], log).length).toBeGreaterThan(1);
  });

  it('skips follow-ups that have already gone, and keeps the ones to come', () => {
    // First alert at 08:00 has passed (it is 10:00), so only 10:30 onward remain.
    const alerts = planWith([once({ reminder: { hour: 8, minute: 0, every: 30 } })]);
    expect(alerts[0].trigger).toEqual({ kind: 'date', at: at(10, 30) });
    expect(alerts.every((a) => a.trigger.kind === 'date' && a.trigger.at > now().getTime())).toBe(
      true,
    );
  });

  it('keeps a daily task on its repeat, with dated follow-ups for the days ahead', () => {
    const alerts = planWith([task({ reminder: { hour: 21, minute: 0, every: 60 } })]);
    expect(alerts.filter((a) => a.trigger.kind === 'daily')).toHaveLength(1);
    const days = new Set(
      alerts.filter((a) => a.trigger.kind === 'date').map((a) => a.id.split(':')[2]),
    );
    expect([...days]).toEqual(['2026-09-13', '2026-09-14', '2026-09-15']);
  });

  it("drops today's follow-ups for a daily task ticked today, and only today's", () => {
    const log: TaskLog = { t1: { '2026-09-13': { mark: 'done', note: '' } } };
    const alerts = planWith([task({ reminder: { hour: 21, minute: 0, every: 60 } })], log);
    expect(alerts.some((a) => a.id.includes('2026-09-13'))).toBe(false);
    expect(alerts.some((a) => a.id.includes('2026-09-14'))).toBe(true);
    expect(alerts.find((a) => a.trigger.kind === 'daily')).toBeDefined();
  });

  it('only follows up on the days a weekday task asks', () => {
    // 13 Sep 2026 is a Sunday; Monday = 0.
    const alerts = planWith([
      task({
        schedule: { kind: 'weekdays', days: [0] },
        reminder: { hour: 9, minute: 0, every: 60 },
      }),
    ]);
    const dated = alerts.filter((a) => a.trigger.kind === 'date');
    expect(dated.length).toBeGreaterThan(0);
    expect(dated.every((a) => a.id.includes('2026-09-14'))).toBe(true);
  });

  it('caps the whole queue, keeping the soonest', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      task({ id: `t${i}`, reminder: { hour: 12, minute: 0, every: 15 } }),
    );
    const dated = planWith(many).filter((a) => a.trigger.kind === 'date');
    expect(dated).toHaveLength(MAX_FOLLOW_UPS);
    const times = dated.map((a) => (a.trigger.kind === 'date' ? a.trigger.at : 0));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('gives every follow-up its own id, all of them recognisable as task alerts', () => {
    const alerts = planWith([task({ reminder: { hour: 21, minute: 0, every: 30 } })]);
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
    expect(alerts.every((a) => a.id.startsWith('task:'))).toBe(true);
  });

  it('keys two identical plans the same, and a changed one differently', () => {
    expect(planKey(planWith([once()]))).toBe(planKey(planWith([once()])));
    const done: TaskLog = { t1: { '2026-09-13': { mark: 'done', note: '' } } };
    expect(planKey(planWith([once()], done))).not.toBe(planKey(planWith([once()])));
  });
});
