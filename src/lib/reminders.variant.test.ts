import { describe, expect, it } from 'vitest';

import { planReminders, type ReminderInputs } from './reminders';
import type { Task } from './tasks';

/**
 * Each app plans its own half (3.0.0). The Workout app is the 2.x install and
 * still stores the tasks: planned there, they would buzz from an app with no
 * way to tick them — and twice, once the Tasks app has imported them too.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Read before sleep',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: { hour: 22, minute: 30, every: 30 },
    archivedAt: null,
    order: 0,
    ...over,
  };
}

const base = (): ReminderInputs => ({
  tasks: [task(), task({ id: 't2', schedule: { kind: 'once', day: '2026-09-14' } })],
  workout: { enabled: true, days: [0, 2, 4], time: '18:00' },
  lang: 'en',
  now: new Date(2026, 8, 13, 10, 0, 0, 0),
});

const ids = (input: ReminderInputs) => planReminders(input).map((r) => r.id);
const prefixes = (input: ReminderInputs) =>
  new Set(planReminders(input).map((r) => r.id.split(':')[0]));

describe('which app arms what', () => {
  it('without a variant, both halves — the 2.x plan the older tests pin', () => {
    expect(prefixes(base())).toEqual(new Set(['task', 'workout']));
  });

  it('Workout arms only the workout schedule, though the store holds tasks', () => {
    expect(ids({ ...base(), variant: 'workout' })).toEqual([
      'workout:w0',
      'workout:w2',
      'workout:w4',
    ]);
  });

  it('Tasks arms the tasks — repeats, dated and follow-ups — and never the workout', () => {
    const plan = ids({ ...base(), variant: 'tasks' });
    expect(plan).toContain('task:t1:daily');
    expect(plan).toContain('task:t2:once');
    expect(plan.some((id) => id.includes(':again'))).toBe(true);
    expect(plan.some((id) => id.startsWith('workout:'))).toBe(false);
  });

  it('Expenses arms nothing here (its budget alerts are presented, not planned)', () => {
    expect(ids({ ...base(), variant: 'expenses' })).toEqual([]);
  });

  it('the two halves of the 2.x plan are exactly Workout plus Tasks', () => {
    const combined = ids(base()).sort();
    const split = [
      ...ids({ ...base(), variant: 'workout' }),
      ...ids({ ...base(), variant: 'tasks' }),
    ];
    expect(split.sort()).toEqual(combined);
  });
});
