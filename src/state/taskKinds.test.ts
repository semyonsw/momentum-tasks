import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyBackup, exportBackupText } from './dataTransfer';
import { useSettings } from './settingsStore';
import { sanitizeTasks, seedTasks, useTasks } from './tasksStore';
import { parseBackup } from '../lib/backup';
import { shiftDay } from '../lib/days';
import { entryOf, type Task } from '../lib/tasks';

/**
 * The task kinds of Wave 2, on disk: counted tasks (T1).
 *
 * Every new field is OPTIONAL, and the tests here are the proof the brief asks
 * for each one: the sanitizer keeps a good value and drops a bad one without
 * losing the task; a backup carries it there and back; a backup written by 2.2.0
 * (which had no such field) imports unchanged; and a cold start over old storage
 * comes up with every task and every mark where it was.
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
  useSettings.getState().setFlag('autoTickTasks', true);
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
    const parsed = parseBackup(v220);
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

  it('the auto-tick is unaffected: a counted auto row is ticked like a plain one', () => {
    useTasks.getState().importTasks({
      tasks: [
        stored({ id: 'gym', auto: 'workout', target: { count: 2, unit: 'sessions' } }),
        stored({ id: 'plain', auto: 'workout', order: 1 }),
      ],
    });
    useTasks.getState().setCount('gym', shiftDay(DAY, 1), 1);
    useTasks.getState().tickAuto('workout', DAY);
    useTasks.getState().tickAuto('workout', shiftDay(DAY, 1));
    const { log } = useTasks.getState();
    expect(entryOf(log, 'gym', DAY)).toEqual({ mark: 'done', note: '' });
    // A partial day is unanswered, so the finished workout answers it — and
    // the part already counted is kept.
    expect(entryOf(log, 'gym', shiftDay(DAY, 1))).toEqual({ mark: 'done', note: '', count: 1 });
    expect(entryOf(log, 'plain', DAY)).toEqual({ mark: 'done', note: '' });
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

    const parsed = parseBackup(text);
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
