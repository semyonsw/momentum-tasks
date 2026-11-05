import { beforeEach, describe, expect, it } from 'vitest';

import { parseBackup, serializeBackup } from '../lib/backup';
import { dayKey } from '../lib/days';
import { asksOn, streakOf, type Task } from '../lib/tasks';
import { applyBackup, exportBackupText } from './dataTransfer';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { sanitizeAi, useAi } from './aiStore';
import { renameSeedTasks, sanitizeTasks, seedTasks, useTasks } from './tasksStore';

/**
 * The one validator every task row passes through — on every cold start and on
 * every restore — fed what a hand-edited or half-corrupted backup actually
 * contains. Total: whatever comes in, a list the screens can draw comes out,
 * and a row that was fine comes out key for key.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Read',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-09-01',
  reminder: null,
  archivedAt: null,
  order: 0,
  ...over,
});

beforeEach(() => {
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
  useAi.setState(sanitizeAi({}));
});

describe('sanitizeTasks on input that is not a list at all', () => {
  it.each([undefined, null, {}, { tasks: 'nope' }, { tasks: {} }, { tasks: [null, 1, 'x', []] }])(
    '%j → an empty, drawable value',
    (input) => {
      expect(sanitizeTasks(input as never)).toEqual({ tasks: [], log: {} });
    },
  );

  it('a log that is not an object, or whose days are not, is dropped', () => {
    expect(sanitizeTasks({ tasks: [row()] as never, log: 'x' as never }).log).toEqual({});
    expect(sanitizeTasks({ tasks: [row()] as never, log: { t1: 'x' } as never }).log).toEqual({});
    expect(sanitizeTasks({ tasks: [row()] as never, log: { t1: null } as never }).log).toEqual({});
  });
});

describe('a well-formed row comes back key for key', () => {
  it('including the optional fields, and nothing it did not have', () => {
    const counted = row({ id: 'c', target: { count: 8, unit: 'glasses' }, order: 1 });
    const avoid = row({ id: 'v', avoid: true, order: 2 });
    const plain = row();
    const { tasks } = sanitizeTasks({ tasks: [plain, counted, avoid] as never });
    expect(tasks).toEqual([plain, counted, avoid]);
    expect('target' in tasks[0]).toBe(false);
    expect('avoid' in tasks[0]).toBe(false);
  });

  it('is idempotent: sanitizing twice changes nothing', () => {
    const once = sanitizeTasks({
      tasks: [
        row({ schedule: { kind: 'weekdays', days: [4, 0, 2, 2, 9] } }),
        row({ id: 't2', schedule: { kind: 'weekly', times: '3' }, order: 5 }),
      ] as never,
      log: { t1: { '2026-09-02': { mark: 'done', note: 'x', count: 2 } } } as never,
    });
    expect(sanitizeTasks(once)).toEqual(once);
  });
});

describe('fields a hand edit can break', () => {
  it('weekly times are clamped to 1–7 and rounded; junk is once a week', () => {
    const times = (v: unknown) =>
      (
        sanitizeTasks({ tasks: [row({ schedule: { kind: 'weekly', times: v } })] as never })
          .tasks[0].schedule as { times: number }
      ).times;
    expect(times(0)).toBe(1);
    expect(times(12)).toBe(7);
    expect(times(2.6)).toBe(3);
    expect(times('x')).toBe(1);
  });

  it('an unknown schedule kind, or none, reads as every day', () => {
    for (const schedule of [undefined, null, 'daily', { kind: 'monthly' }]) {
      expect(sanitizeTasks({ tasks: [row({ schedule })] as never }).tasks[0].schedule).toEqual({
        kind: 'daily',
      });
    }
  });

  it('a target must be a whole number of at least one; the unit is trimmed and capped', () => {
    const target = (v: unknown) => sanitizeTasks({ tasks: [row({ target: v })] as never }).tasks[0];
    expect(target({ count: 0, unit: 'x' }).target).toBeUndefined();
    expect(target({ count: 2.5, unit: 'x' }).target).toBeUndefined();
    expect(target({ count: 5000, unit: '  glasses  ' }).target).toEqual({
      count: 999,
      unit: 'glasses',
    });
    expect(target({ count: 3, unit: 'x'.repeat(100) }).target?.unit).toHaveLength(24);
  });

  it('avoid beside a target keeps the target and drops the avoid', () => {
    const [task] = sanitizeTasks({
      tasks: [row({ avoid: true, target: { count: 2, unit: '' } })] as never,
    }).tasks;
    expect(task.target).toEqual({ count: 2, unit: '' });
    expect(task.avoid).toBeUndefined();
  });

  it('a log entry with a fractional, negative or huge count keeps what is sane', () => {
    const { log } = sanitizeTasks({
      tasks: [row()] as never,
      log: {
        t1: {
          '2026-09-02': { mark: 'done', note: '', count: 2.5 },
          '2026-09-03': { mark: null, note: '', count: -1 },
          '2026-09-04': { mark: null, note: '', count: 1e9 },
          '2026-09-05': { mark: 'maybe', note: 7 },
          'not-a-day': { mark: 'done', note: '' },
        },
      } as never,
    });
    expect(log).toEqual({
      t1: {
        '2026-09-02': { mark: 'done', note: '' },
        '2026-09-04': { mark: null, note: '', count: 9999 },
      },
    });
  });
});

describe('the start day', () => {
  it('a full ISO instant is read as the LOCAL day it names, so the first day still asks', () => {
    const instant = new Date(2026, 8, 1, 10, 30).toISOString();
    const [task] = sanitizeTasks({ tasks: [row({ startedOn: instant })] as never }).tasks;
    expect(task.startedOn).toBe('2026-09-01');
    expect(asksOn(task, '2026-09-01')).toBe(true);
  });

  it('a start that is no date at all falls back to today rather than silencing the task', () => {
    const [task] = sanitizeTasks({ tasks: [row({ startedOn: 'yesterday' })] as never }).tasks;
    expect(task.startedOn).toBe(dayKey(new Date()));
    expect(asksOn(task, dayKey(new Date()))).toBe(true);
  });

  it('a streak walks the whole run back to a start written as an instant', () => {
    const log: Record<string, { mark: 'done'; note: string }> = {};
    for (const day of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']) {
      log[day] = { mark: 'done', note: '' };
    }
    const value = sanitizeTasks({
      tasks: [row({ startedOn: new Date(2026, 8, 1, 9).toISOString() })] as never,
      log: { t1: log } as never,
    });
    expect(streakOf(value.tasks[0] as Task, value.log, '2026-09-04')).toBe(4);
  });
});

describe('the backup, through the file and back', () => {
  it('a phone with everything on it survives export → parse → restore unchanged', () => {
    useTasks.getState().importTasks({
      tasks: [
        row(),
        row({ id: 't2', name: 'Water', target: { count: 8, unit: 'glasses' }, order: 1 }),
        row({ id: 't3', name: 'Smoke', avoid: true, order: 2 }),
        row({
          id: 't4',
          name: 'Gym',
          schedule: { kind: 'weekly', times: 3 },
          reminder: { hour: 7, minute: 30, every: 30 },
          order: 3,
        }),
        row({
          id: 't5',
          name: 'Dentist',
          schedule: { kind: 'once', day: '2026-09-20' },
          startedOn: '2026-09-20',
          archivedAt: '2026-09-21T10:00:00.000Z',
          order: 4,
        }),
      ],
      log: {
        t1: {
          '2026-09-02': { mark: 'done', note: 'ch. 3' },
          '2026-09-03': { mark: 'missed', note: '' },
        },
        t2: { '2026-09-02': { mark: null, note: '', count: 3 } },
        t5: { '2026-09-20': { mark: null, note: 'rebook' } },
      },
    });
    const before = { tasks: useTasks.getState().tasks, log: useTasks.getState().log };

    const text = exportBackupText(new Date('2026-09-22T00:00:00.000Z'));
    useTasks.getState().importTasks({ tasks: [], log: {} });
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.counts.tasks).toBe(5);
    const applied = applyBackup(parsed.envelope);

    expect(applied.tasks).toBe(5);
    expect({ tasks: useTasks.getState().tasks, log: useTasks.getState().log }).toEqual(before);
  });

  it('a file whose rows are all junk restores as an empty list, said as zero tasks', () => {
    const text = serializeBackup({ settings: null, tasks: { tasks: [{}, null, 'x'], log: [] } });
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(applyBackup(parsed.envelope).tasks).toBe(0);
    expect(useTasks.getState().tasks).toEqual([]);
  });

  it('a truncated file is refused before anything on the phone is touched', () => {
    const text = exportBackupText();
    const before = useTasks.getState().tasks;
    const parsed = parseBackup(text.slice(0, text.length / 2));
    expect(parsed.ok).toBe(false);
    expect(useTasks.getState().tasks).toBe(before);
  });
});

describe('renameSeedTasks (the version 1 → 2 migration)', () => {
  it('passes anything that is not a task blob through untouched', () => {
    for (const blob of [null, undefined, 3, 'x', { tasks: 'x' }, { log: {} }]) {
      expect(renameSeedTasks(blob)).toBe(blob);
    }
  });

  it('keeps the log and every other key while renaming', () => {
    useSettings.getState().setLanguage('en');
    const blob = {
      tasks: [row({ name: 'Track expenses' }), null, row({ id: 't2', name: 7 })],
      log: { t1: { '2026-09-02': { mark: 'done', note: '' } } },
    };
    const migrated = renameSeedTasks(blob) as typeof blob;
    expect(migrated.log).toBe(blob.log);
    expect(migrated.tasks[1]).toBeNull();
    expect(migrated.tasks[2]).toBe(blob.tasks[2]);
    expect((migrated.tasks[0] as { name: string }).name).toBe('Track expenses');
  });
});
