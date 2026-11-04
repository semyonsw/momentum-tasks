import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyBackup, exportBackupText } from './dataTransfer';
import { useSettings } from './settingsStore';
import { sanitizeTasks, seedTasks, useTasks } from './tasksStore';
import { parseBackup } from '../lib/backup';
import { shiftDay } from '../lib/days';
import { entryOf, type Task } from '../lib/tasks';

/**
 * The task kinds of Wave 2, on disk: counted tasks (T1), N times a week (T2)
 * and habits to avoid (T7).
 *
 * Every new field is OPTIONAL, and the tests here are the proof the brief asks
 * for each one: the sanitizer keeps a good value and drops a bad one without
 * losing the task; a backup carries it there and back; a backup written by 2.2.0
 * (which had no such field) imports unchanged; and a cold start over old storage
 * comes up with every task and every mark where it was.
 *
 * Since 3.0.0 only the Tasks app restores tasks from a file, so the imports here
 * name the `'tasks'` variant; the export still runs as Workout, because that app
 * keeps carrying the 2.x tasks it holds.
 */

const DAY = '2026-09-10';

function stored(over: Partial<Task> = {}): Task {
  return {
    id: 'water',
    name: 'Water',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

/** A 2.2.0 task log, exactly as that version wrote it. */
const V220_TASKS = {
  tasks: [
    {
      id: 't1',
      name: 'Read',
      schedule: { kind: 'weekdays', days: [0, 2, 4] },
      auto: null,
      startedOn: '2026-09-01',
      reminder: { hour: 7, minute: 30 },
      archivedAt: null,
      order: 0,
    },
    {
      id: 't2',
      name: 'Gym',
      schedule: { kind: 'daily' },
      auto: 'workout',
      startedOn: '2026-09-01',
      reminder: null,
      archivedAt: null,
      order: 1,
    },
  ],
  log: {
    t1: { '2026-09-09': { mark: 'done', note: '' }, '2026-09-11': { mark: 'missed', note: 'ill' } },
    t2: { '2026-09-10': { mark: 'done', note: '' } },
  },
};

beforeEach(() => {
  useTasks.getState().importTasks({ tasks: [stored({ target: { count: 8, unit: 'glasses' } })] });
});

afterEach(() => {
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
});

describe('old data (every kind)', () => {
  it('a 2.2.0 task log sanitizes to itself, key for key', () => {
    expect(sanitizeTasks(V220_TASKS as never)).toEqual(V220_TASKS);
    const [read] = sanitizeTasks(V220_TASKS as never).tasks;
    expect(Object.keys(read).sort()).toEqual(
      ['archivedAt', 'auto', 'id', 'name', 'order', 'reminder', 'schedule', 'startedOn'].sort(),
    );
  });

  it('a 2.2.0 backup imports unchanged', () => {
    const v220 = JSON.stringify({
      format: 'workout-tracker-backup',
      version: 2,
      exercises: [],
      routines: [],
      workouts: [],
      tasks: V220_TASKS,
    });
    const parsed = parseBackup(v220, 'en');
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useTasks.getState().tasks).toEqual(V220_TASKS.tasks);
    expect(useTasks.getState().log).toEqual(V220_TASKS.log);
  });

  it('cold-starts from 2.2.0 storage with every task and mark where it was', async () => {
    await AsyncStorage.setItem('tasks', JSON.stringify({ version: 2, state: V220_TASKS }));
    await useTasks.persist.rehydrate();
    expect(useTasks.getState().tasks).toEqual(V220_TASKS.tasks);
    expect(useTasks.getState().log).toEqual(V220_TASKS.log);
  });
});

describe('counted tasks (T1)', () => {
  it('sanitizes a target: whole, at least one, capped, unit trimmed', () => {
    const read = (target: unknown) =>
      sanitizeTasks({ tasks: [{ ...stored(), target }] as never }).tasks[0].target;
    expect(read({ count: 8, unit: ' glasses ' })).toEqual({ count: 8, unit: 'glasses' });
    expect(read({ count: 5000, unit: 'x'.repeat(60) })).toEqual({
      count: 999,
      unit: 'x'.repeat(24),
    });
    expect(read({ count: 3 })).toEqual({ count: 3, unit: '' });
    // Not a target: the task survives as an ordinary one.
    expect(read({ count: 0, unit: 'glasses' })).toBeUndefined();
    expect(read({ count: 2.5 })).toBeUndefined();
    expect(read('eight')).toBeUndefined();
    expect(read(null)).toBeUndefined();
  });

  it('sanitizes a day count and keeps a partial day with no mark or note', () => {
    const { log } = sanitizeTasks({
      tasks: [stored()],
      log: {
        water: {
          '2026-09-01': { mark: null, note: '', count: 3 },
          '2026-09-02': { mark: 'done', note: '', count: 99999 },
          '2026-09-03': { mark: null, note: '', count: -2 },
          '2026-09-04': { mark: 'done', note: '', count: 'many' },
        },
      } as never,
    });
    expect(log.water).toEqual({
      '2026-09-01': { mark: null, note: '', count: 3 },
      '2026-09-02': { mark: 'done', note: '', count: 9999 },
      '2026-09-04': { mark: 'done', note: '' },
    });
  });

  it('a tap adds a part, done at the target, and returns what it replaced', () => {
    const { tapCount } = useTasks.getState();
    for (let i = 0; i < 7; i += 1) tapCount('water', DAY);
    expect(entryOf(useTasks.getState().log, 'water', DAY)).toEqual({
      mark: null,
      note: '',
      count: 7,
    });
    const before = tapCount('water', DAY);
    expect(before).toEqual({ mark: null, note: '', count: 7 });
    expect(entryOf(useTasks.getState().log, 'water', DAY).mark).toBe('done');
    // From a finished day the tap starts again, and the log stays sparse.
    tapCount('water', DAY);
    expect(useTasks.getState().log).toEqual({});
  });

  it('the Undo puts back exactly what was there', () => {
    const { setCount, restoreEntry, setNote } = useTasks.getState();
    setNote('water', DAY, 'tea counts');
    const before = setCount('water', DAY, 8)!;
    restoreEntry('water', DAY, before);
    expect(entryOf(useTasks.getState().log, 'water', DAY)).toEqual({
      mark: null,
      note: 'tea counts',
    });
  });

  it('a skip keeps the parts; a note keeps them too', () => {
    const { setCount, setMark, setNote } = useTasks.getState();
    setCount('water', DAY, 3);
    setNote('water', DAY, 'out all day');
    setMark('water', DAY, 'missed');
    expect(entryOf(useTasks.getState().log, 'water', DAY)).toEqual({
      mark: 'missed',
      note: 'out all day',
      count: 3,
    });
  });

  it('does nothing on a task with no target', () => {
    useTasks.getState().importTasks({ tasks: [stored()] });
    expect(useTasks.getState().tapCount('water', DAY)).toBeNull();
    expect(useTasks.getState().setCount('water', DAY, 4)).toBeNull();
    expect(useTasks.getState().log).toEqual({});
  });

  it('a target is added, changed and taken off through the editor path', () => {
    const { addTask, updateTask } = useTasks.getState();
    const id = addTask({
      name: 'Pages',
      schedule: { kind: 'daily' },
      target: { count: 20, unit: 'pages' },
    })!;
    const find = () => useTasks.getState().tasks.find((task) => task.id === id)!;
    expect(find().target).toEqual({ count: 20, unit: 'pages' });
    updateTask(id, { target: { count: 30, unit: 'pages' } });
    expect(find().target).toEqual({ count: 30, unit: 'pages' });
    updateTask(id, { name: 'Pages!' });
    expect(find().target).toEqual({ count: 30, unit: 'pages' });
    updateTask(id, { target: null });
    expect('target' in find()).toBe(false);
  });

  it('travels in a backup and comes back', () => {
    useTasks.getState().setCount('water', DAY, 3);
    const text = exportBackupText();
    useTasks.getState().importTasks({ tasks: [stored()], log: {} });

    const parsed = parseBackup(text, 'en');
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useTasks.getState().tasks[0].target).toEqual({ count: 8, unit: 'glasses' });
    expect(entryOf(useTasks.getState().log, 'water', DAY)).toEqual({
      mark: null,
      note: '',
      count: 3,
    });
  });

  it('cold-starts with the target and a partial day', async () => {
    // Before the write: a `setState` on a persisted store writes straight back.
    useTasks.getState().importTasks({ tasks: [stored()] });
    await AsyncStorage.setItem(
      'tasks',
      JSON.stringify({
        version: 2,
        state: {
          tasks: [stored({ target: { count: 8, unit: 'glasses' } })],
          log: { water: { [DAY]: { mark: null, note: '', count: 5 } } },
        },
      }),
    );
    await useTasks.persist.rehydrate();
    expect(useTasks.getState().tasks[0].target).toEqual({ count: 8, unit: 'glasses' });
    expect(entryOf(useTasks.getState().log, 'water', DAY).count).toBe(5);
  });
});

describe('N times a week (T2)', () => {
  it('sanitizes N to a whole 1–7, and junk to the least it can ask', () => {
    const read = (schedule: unknown) =>
      sanitizeTasks({ tasks: [{ ...stored(), schedule }] as never }).tasks[0].schedule;
    expect(read({ kind: 'weekly', times: 3 })).toEqual({ kind: 'weekly', times: 3 });
    expect(read({ kind: 'weekly', times: 12 })).toEqual({ kind: 'weekly', times: 7 });
    expect(read({ kind: 'weekly', times: 0 })).toEqual({ kind: 'weekly', times: 1 });
    expect(read({ kind: 'weekly', times: 2.6 })).toEqual({ kind: 'weekly', times: 3 });
    expect(read({ kind: 'weekly' })).toEqual({ kind: 'weekly', times: 1 });
  });

  it('is saved and changed through the editor path', () => {
    const { addTask, updateTask } = useTasks.getState();
    const id = addTask({ name: 'Stretch', schedule: { kind: 'weekly', times: 3 } })!;
    const find = () => useTasks.getState().tasks.find((task) => task.id === id)!;
    expect(find().schedule).toEqual({ kind: 'weekly', times: 3 });
    updateTask(id, { schedule: { kind: 'daily' } });
    expect(find().schedule).toEqual({ kind: 'daily' });
  });

  it('travels in a backup and comes back', () => {
    useTasks.getState().importTasks({
      tasks: [stored({ schedule: { kind: 'weekly', times: 4 } })],
      log: { water: { [DAY]: { mark: 'done', note: '' } } },
    });
    const text = exportBackupText();
    useTasks.getState().importTasks({ tasks: [stored()], log: {} });
    const parsed = parseBackup(text, 'en');
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useTasks.getState().tasks[0].schedule).toEqual({ kind: 'weekly', times: 4 });
    expect(entryOf(useTasks.getState().log, 'water', DAY).mark).toBe('done');
  });

  it('cold-starts with the schedule as it was', async () => {
    useTasks.getState().importTasks({ tasks: [stored()] });
    await AsyncStorage.setItem(
      'tasks',
      JSON.stringify({
        version: 2,
        state: { tasks: [stored({ schedule: { kind: 'weekly', times: 2 } })], log: {} },
      }),
    );
    await useTasks.persist.rehydrate();
    expect(useTasks.getState().tasks[0].schedule).toEqual({ kind: 'weekly', times: 2 });
  });
});

describe('habits to avoid (T7)', () => {
  it('sanitizes avoid to a literal true, and never beside a target', () => {
    const read = (over: Record<string, unknown>) =>
      sanitizeTasks({ tasks: [{ ...stored(), ...over }] as never }).tasks[0];
    expect(read({ avoid: true }).avoid).toBe(true);
    expect('avoid' in read({ avoid: 'yes' })).toBe(false);
    expect('avoid' in read({ avoid: false })).toBe(false);
    const both = read({ avoid: true, target: { count: 3, unit: '' } });
    expect(both.target).toEqual({ count: 3, unit: '' });
    expect('avoid' in both).toBe(false);
  });

  it('is switched on and off through the editor path, and a target switches it off', () => {
    const { addTask, updateTask } = useTasks.getState();
    const id = addTask({ name: 'No sugar', schedule: { kind: 'daily' }, avoid: true })!;
    const find = () => useTasks.getState().tasks.find((task) => task.id === id)!;
    expect(find().avoid).toBe(true);
    updateTask(id, { avoid: false });
    expect('avoid' in find()).toBe(false);
    updateTask(id, { avoid: true });
    updateTask(id, { target: { count: 2, unit: '' } });
    expect('avoid' in find()).toBe(false);
  });

  it('a tap answers it done, the same mark as any task', () => {
    useTasks.getState().importTasks({ tasks: [stored({ avoid: true })] });
    useTasks.getState().toggleMark('water', DAY);
    expect(entryOf(useTasks.getState().log, 'water', DAY).mark).toBe('done');
  });

  it('travels in a backup and comes back', () => {
    useTasks.getState().importTasks({ tasks: [stored({ avoid: true })] });
    const text = exportBackupText();
    useTasks.getState().importTasks({ tasks: [stored()], log: {} });
    const parsed = parseBackup(text, 'en');
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useTasks.getState().tasks[0].avoid).toBe(true);
  });

  it('cold-starts with it', async () => {
    useTasks.getState().importTasks({ tasks: [stored()] });
    await AsyncStorage.setItem(
      'tasks',
      JSON.stringify({ version: 2, state: { tasks: [stored({ avoid: true })], log: {} } }),
    );
    await useTasks.persist.rehydrate();
    expect(useTasks.getState().tasks[0].avoid).toBe(true);
  });
});
