import { describe, expect, it } from 'vitest';

import {
  AFTER_PAUSE_DAYS,
  MAX_FOLLOW_UPS,
  MAX_PAUSED_ALERTS,
  MAX_PAUSED_ALERTS_PER_TASK,
  PAUSE_LOOKAHEAD_DAYS,
  planKey,
  planReminders,
  plainAlarmDays,
} from './reminders';
import { shiftDay } from './days';
import { excuseRange, type Task, type TaskLog } from './tasks';

/**
 * A task's OWN alert on paused days (the gap T-03 left).
 *
 * What these pin is "nothing nags": a day the user excused ahead of time gets
 * no buzz, the days after the pause get theirs back, and a task nobody paused
 * keeps the one repeating alarm it always had — the repeat is what keeps a habit
 * reminder alive while the app goes unopened, and no pause is no reason to lose it.
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

/** Sunday 13 September 2026, 10:00 local. */
const NOW = new Date(2026, 8, 13, 10, 0, 0, 0);
const TODAY = '2026-09-13';

function planWith(tasks: Task[], log: TaskLog = {}) {
  return planReminders({ tasks, lang: 'en', now: NOW, log });
}

function pause(tasks: Task[], from: string, to: string, log: TaskLog = {}): TaskLog {
  return excuseRange(
    log,
    tasks,
    tasks.map((t) => t.id),
    from,
    to,
  ).log;
}

/** The days a plan's own (non-follow-up) dated alerts land on, for one task. */
function datedDays(alerts: ReturnType<typeof planWith>, id = 't1'): string[] {
  return alerts
    .filter((a) => a.trigger.kind === 'date' && !a.id.includes(':again'))
    .filter((a) => a.id.startsWith(`task:${id}:`))
    .map((a) => a.id.split(':')[2]);
}

describe('plainAlarmDays', () => {
  it('is null for a task with nothing excused ahead — the repeat stays', () => {
    expect(plainAlarmDays(task(), {}, TODAY)).toBeNull();
    // A skip in the past is not ahead.
    const past = pause([task()], '2026-09-10', '2026-09-12');
    expect(plainAlarmDays(task(), past, TODAY)).toBeNull();
  });

  it('is null while the pause is still further off than the lookahead', () => {
    const far = shiftDay(TODAY, PAUSE_LOOKAHEAD_DAYS);
    expect(plainAlarmDays(task(), pause([task()], far, shiftDay(far, 5)), TODAY)).toBeNull();
    const near = shiftDay(TODAY, PAUSE_LOOKAHEAD_DAYS - 1);
    expect(plainAlarmDays(task(), pause([task()], near, near), TODAY)).not.toBeNull();
  });

  it('skips every paused day and covers the days after the pause', () => {
    const log = pause([task()], '2026-09-16', '2026-09-20');
    const days = plainAlarmDays(task(), log, TODAY)!;
    expect(days.slice(0, 3)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15']);
    for (const d of ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']) {
      expect(days).not.toContain(d);
    }
    expect(days).toContain('2026-09-21');
    expect(days[days.length - 1]).toBe(shiftDay('2026-09-20', AFTER_PAUSE_DAYS));
  });

  it('counts a skip of today as excused', () => {
    const log = pause([task()], TODAY, TODAY);
    const days = plainAlarmDays(task(), log, TODAY)!;
    expect(days[0]).toBe('2026-09-14');
  });

  it("keeps to a weekday task's own days", () => {
    // Mon = 0, Wed = 2. 14 Sep 2026 is a Monday.
    const gym = task({ schedule: { kind: 'weekdays', days: [0, 2] } });
    const log = pause([gym], '2026-09-14', '2026-09-20');
    const days = plainAlarmDays(gym, log, TODAY)!;
    expect(days.slice(0, 3)).toEqual(['2026-09-21', '2026-09-23', '2026-09-28']);
  });

  it('stays bounded per task, however long the pause is', () => {
    const long = pause([task()], '2026-09-14', '2027-09-13');
    const days = plainAlarmDays(task(), long, TODAY)!;
    // Today, then nothing for a year, then the fortnight after.
    expect(days[0]).toBe(TODAY);
    expect(days[1]).toBe('2027-09-14');
    expect(days.length).toBe(1 + AFTER_PAUSE_DAYS);
    // A pause next week and one six months out: the near days fill the cap.
    const two = pause(
      [task()],
      '2027-03-01',
      '2027-03-05',
      pause([task()], '2026-09-20', '2026-09-20'),
    );
    expect(plainAlarmDays(task(), two, TODAY)!.length).toBe(MAX_PAUSED_ALERTS_PER_TASK);
  });

  it('follows the follow-up rule for counted and weekly tasks', () => {
    // T-13: a counted day short of its target is unanswered, so it is reminded;
    // one that reached it is done, and is not.
    const water = task({ target: { count: 8, unit: 'glasses' } });
    const log: TaskLog = {
      t1: {
        '2026-09-14': { mark: null, note: '', count: 3 },
        '2026-09-15': { mark: 'done', note: '', count: 8 },
        '2026-09-16': { mark: 'missed', note: '' },
      },
    };
    const days = plainAlarmDays(water, log, TODAY)!;
    expect(days).toContain('2026-09-14');
    expect(days).not.toContain('2026-09-15');
    expect(days).not.toContain('2026-09-16');

    // T-14: once the week is met, the rest of that week asks nothing.
    const thrice = task({ schedule: { kind: 'weekly', times: 2 } });
    const week: TaskLog = {
      t1: {
        '2026-09-14': { mark: 'done', note: '' },
        '2026-09-15': { mark: 'done', note: '' },
        '2026-09-23': { mark: 'missed', note: '' },
      },
    };
    const wd = plainAlarmDays(thrice, week, TODAY)!;
    for (const d of ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']) {
      expect(wd).not.toContain(d);
    }
    expect(wd).toContain('2026-09-21');
    expect(wd).not.toContain('2026-09-23');
  });
});

describe('planReminders with a pause', () => {
  it('a task with no pause fires daily from one repeat, exactly as before', () => {
    const alerts = planWith([task()]);
    expect(alerts).toEqual([
      {
        id: 'task:t1:daily',
        title: 'Read before sleep',
        body: 'Every day',
        trigger: { kind: 'daily', hour: 22, minute: 30 },
      },
    ]);
  });

  it('paused days get no alarm; the days after do; no repeat is left to ring through', () => {
    const log = pause([task()], '2026-09-15', '2026-09-18');
    const alerts = planWith([task()], log);
    expect(alerts.some((a) => a.trigger.kind === 'daily')).toBe(false);
    const days = datedDays(alerts);
    expect(days).toContain('2026-09-13');
    expect(days).toContain('2026-09-14');
    expect(days.some((d) => d >= '2026-09-15' && d <= '2026-09-18')).toBe(false);
    expect(days).toContain('2026-09-19');
    // At the task's own minute, under its own name.
    const first = alerts.find((a) => a.id === 'task:t1:2026-09-19')!;
    expect(first.trigger).toEqual({ kind: 'date', at: new Date(2026, 8, 19, 22, 30).getTime() });
    expect(first.title).toBe('Read before sleep');
    expect(first.body).toBe('Every day');
  });

  it("drops today's dated alert once its minute has gone", () => {
    const early = task({ reminder: { hour: 7, minute: 0 } });
    const alerts = planWith([early], pause([early], '2026-09-15', '2026-09-15'));
    expect(datedDays(alerts)[0]).toBe('2026-09-14');
  });

  it('pauses only the paused task; the others keep their repeat', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', name: 'Stretch' });
    const alerts = planWith([a, b], pause([a], '2026-09-15', '2026-09-18'));
    expect(alerts.find((r) => r.id === 'task:b:daily')).toBeDefined();
    expect(alerts.find((r) => r.id === 'task:a:daily')).toBeUndefined();
  });

  it('keeps follow-ups unchanged around a pause', () => {
    const nag = task({ reminder: { hour: 21, minute: 0, every: 60 } });
    const log = pause([nag], '2026-09-14', '2026-09-14');
    const alerts = planWith([nag], log);
    const again = new Set(
      alerts.filter((a) => a.id.includes(':again')).map((a) => a.id.split(':')[2]),
    );
    expect([...again].sort()).toEqual(['2026-09-13', '2026-09-15']);
  });

  it('is bounded in total, soonest kept, and under Android’s alarm limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      task({ id: `t${i}`, reminder: { hour: 21, minute: 0, every: 15 } }),
    );
    const log = pause(many, '2026-09-20', '2026-09-25');
    const alerts = planWith(many, log);
    const own = alerts.filter((a) => a.trigger.kind === 'date' && !a.id.includes(':again'));
    expect(own).toHaveLength(MAX_PAUSED_ALERTS);
    const times = own.map((a) => (a.trigger.kind === 'date' ? a.trigger.at : 0));
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(alerts.length).toBeLessThanOrEqual(MAX_PAUSED_ALERTS + MAX_FOLLOW_UPS + many.length);
    expect(alerts.length).toBeLessThan(480);
  });

  it('re-planning is idempotent: same ids, same instants, no duplicates', () => {
    const log = pause([task()], '2026-09-15', '2026-09-18');
    const first = planWith([task({ reminder: { hour: 21, minute: 0, every: 30 } })], log);
    const second = planWith([task({ reminder: { hour: 21, minute: 0, every: 30 } })], log);
    expect(planKey(second)).toBe(planKey(first));
    expect(new Set(first.map((a) => a.id)).size).toBe(first.length);
    expect(first.every((a) => a.id.startsWith('task:'))).toBe(true);
  });

  it('goes back to the repeat once the pause has passed', () => {
    const log = pause([task()], '2026-09-01', '2026-09-12');
    expect(planWith([task()], log).map((a) => a.id)).toEqual(['task:t1:daily']);
  });
});
