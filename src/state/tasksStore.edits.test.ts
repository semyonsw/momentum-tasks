import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { t } from '../lib/i18n';
import { entryOf, type Task } from '../lib/tasks';
import { useSettings } from './settingsStore';
import { sanitizeTasks, seedTasks, useTasks } from './tasksStore';

/**
 * The task list's edits — add, rename, reorder, put back — and the log through a
 * relaunch.
 *
 * `tasksStore.test.ts` and `taskKinds.test.ts` cover what a tap writes and what the
 * validator keeps. What is left is the LIST: a reorder that drops a row, a rename
 * that blanks one, an Undo that does not put back what was there, or a relaunch
 * that comes up with fewer marks than went down, each of which turns a streak
 * somebody has kept for months into a row with holes in it.
 */

const DAY = '2026-10-14';

const row = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  name: id.toUpperCase(),
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-09-01',
  reminder: null,
  archivedAt: null,
  order: 0,
  ...patch,
});

beforeEach(() => {
  useTasks.getState().importTasks({
    tasks: [
      row('a', { order: 0 }),
      row('b', { order: 1, schedule: { kind: 'weekdays', days: [0, 2, 4] } }),
      row('c', { order: 2 }),
      row('d', { order: 3 }),
    ],
    log: {},
  });
});

afterEach(() => {
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
});

const ids = () =>
  [...useTasks.getState().tasks].sort((x, y) => x.order - y.order).map((task) => task.id);

describe('adding and renaming', () => {
  it('refuses a task with no name', () => {
    expect(useTasks.getState().addTask({ name: '   ', schedule: { kind: 'daily' } })).toBeNull();
    expect(useTasks.getState().tasks).toHaveLength(4);
  });

  it('adds to the end, trimmed, silent, and never automatic', () => {
    const id = useTasks.getState().addTask({ name: '  Stretch  ', schedule: { kind: 'daily' } });
    const added = useTasks.getState().tasks.find((task) => task.id === id);
    expect(added).toMatchObject({
      name: 'Stretch',
      auto: null,
      reminder: null,
      archivedAt: null,
      order: 4,
    });
  });

  it('two tasks added in a row are two tasks', () => {
    const one = useTasks.getState().addTask({ name: 'One', schedule: { kind: 'daily' } });
    const two = useTasks.getState().addTask({ name: 'Two', schedule: { kind: 'daily' } });
    expect(one).not.toBe(two);
    useTasks.getState().setMark(one ?? '', DAY, 'done');
    expect(entryOf(useTasks.getState().log, two ?? '', DAY).mark).toBeNull();
  });

  it('a blank rename keeps the old name', () => {
    useTasks.getState().updateTask('a', { name: '   ' });
    expect(useTasks.getState().tasks[0].name).toBe('A');
  });

  it('an edit of one task leaves the others, and the log, alone', () => {
    useTasks.getState().setMark('a', DAY, 'done');
    const before = useTasks.getState();
    useTasks.getState().updateTask('a', { name: 'Read', schedule: { kind: 'weekly', times: 3 } });
    const after = useTasks.getState();
    expect(after.log).toBe(before.log);
    expect(after.tasks.slice(1)).toEqual(before.tasks.slice(1));
  });

  it('an edit for a task that is not there changes nothing', () => {
    const before = useTasks.getState().tasks;
    useTasks.getState().updateTask('gone', { name: 'X' });
    expect(useTasks.getState().tasks).toEqual(before);
  });

  it('archiving a task that is not there changes nothing', () => {
    useTasks.getState().archiveTask('gone');
    expect(useTasks.getState().tasks.every((task) => task.archivedAt === null)).toBe(true);
  });
});

describe('reordering', () => {
  it('moves a row and renumbers the list densely', () => {
    useTasks.getState().reorderTasks(['a', 'b', 'c', 'd'], 'd', 0);
    expect(ids()).toEqual(['d', 'a', 'b', 'c']);
    expect(
      useTasks
        .getState()
        .tasks.map((task) => task.order)
        .sort(),
    ).toEqual([0, 1, 2, 3]);
  });

  it('a row hidden today keeps its slot when the visible rows move around it', () => {
    // A Tuesday: `b` (Mon/Wed/Fri) is not on screen.
    useTasks.getState().reorderTasks(['a', 'c', 'd'], 'd', 0);
    expect(ids()).toEqual(['d', 'b', 'a', 'c']);
  });

  it('never loses a row, and never loses a mark', () => {
    useTasks.getState().setMark('c', DAY, 'done');
    useTasks.getState().setNote('b', DAY, 'gym closed');
    const log = useTasks.getState().log;
    useTasks.getState().reorderTasks(['a', 'b', 'c', 'd'], 'a', 3);
    expect([...ids()].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(useTasks.getState().log).toBe(log);
  });

  it('keeps an archived task in the list', () => {
    useTasks.getState().archiveTask('b');
    useTasks.getState().reorderTasks(['a', 'c', 'd'], 'c', 0);
    expect(ids()).toContain('b');
    expect(useTasks.getState().tasks.find((task) => task.id === 'b')?.archivedAt).not.toBeNull();
  });

  it('dropping a row back where it came from is a no-op', () => {
    useTasks.getState().reorderTasks(['a', 'b', 'c', 'd'], 'b', 1);
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('putting the list back (the Undo of an applied suggestion)', () => {
  it('restores names, schedules and archive state, and drops a task the suggestion added', () => {
    const before = useTasks.getState().tasks;
    useTasks.getState().updateTask('a', { name: 'Renamed' });
    useTasks.getState().archiveTask('c');
    useTasks.getState().addTask({ name: 'New', schedule: { kind: 'daily' } });
    useTasks.getState().restoreTaskList(before);
    expect(useTasks.getState().tasks).toEqual(before);
  });

  it('leaves a mark given in between exactly where it is', () => {
    const before = useTasks.getState().tasks;
    useTasks.getState().updateTask('a', { name: 'Renamed' });
    useTasks.getState().setMark('a', DAY, 'done');
    useTasks.getState().restoreTaskList(before);
    expect(entryOf(useTasks.getState().log, 'a', DAY).mark).toBe('done');
  });

  it('is a copy — mutating the snapshot afterwards cannot reach the store', () => {
    const snapshot = [...useTasks.getState().tasks];
    useTasks.getState().restoreTaskList(snapshot);
    snapshot.pop();
    expect(useTasks.getState().tasks).toHaveLength(4);
  });
});

describe('notes', () => {
  it('a note keeps the mark, and clearing the note keeps the mark too', () => {
    useTasks.getState().setMark('a', DAY, 'done');
    useTasks.getState().setNote('a', DAY, 'early');
    expect(entryOf(useTasks.getState().log, 'a', DAY)).toEqual({ mark: 'done', note: 'early' });
    useTasks.getState().setNote('a', DAY, '');
    expect(entryOf(useTasks.getState().log, 'a', DAY)).toEqual({ mark: 'done', note: '' });
  });

  it('clearing the only thing on a day leaves no row behind', () => {
    useTasks.getState().setNote('a', DAY, 'just a thought');
    useTasks.getState().setNote('a', DAY, '');
    expect(useTasks.getState().log).toEqual({});
  });

  it('a mark taken off keeps the note', () => {
    useTasks.getState().setNote('a', DAY, 'ill');
    useTasks.getState().setMark('a', DAY, 'missed');
    useTasks.getState().setMark('a', DAY, null);
    expect(entryOf(useTasks.getState().log, 'a', DAY)).toEqual({ mark: null, note: 'ill' });
  });
});

describe('pausing', () => {
  it('a pause with an unreadable day writes nothing', () => {
    expect(useTasks.getState().pauseTasks(['a'], 'soon', DAY)).toEqual([]);
    expect(useTasks.getState().log).toEqual({});
  });

  it('a backwards range is the same range', () => {
    const written = useTasks.getState().pauseTasks(['a'], '2026-10-16', DAY);
    expect(written.map((cell) => cell.day)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
  });

  it('Resume leaves a day answered during the pause as it was answered', () => {
    const cells = useTasks.getState().pauseTasks(['a'], DAY, '2026-10-15');
    useTasks.getState().toggleMark('a', DAY); // excused → done
    useTasks.getState().unpause(cells);
    expect(entryOf(useTasks.getState().log, 'a', DAY).mark).toBe('done');
    expect(entryOf(useTasks.getState().log, 'a', '2026-10-15').mark).toBeNull();
  });

  it('the Undo of Resume excuses only squares that are still unanswered', () => {
    const cells = useTasks.getState().pauseTasks(['a'], DAY, '2026-10-15');
    useTasks.getState().unpause(cells);
    useTasks.getState().setMark('a', DAY, 'done');
    useTasks.getState().excuse(cells);
    expect(entryOf(useTasks.getState().log, 'a', DAY).mark).toBe('done');
    expect(entryOf(useTasks.getState().log, 'a', '2026-10-15').mark).toBe('missed');
  });
});

describe('the log survives a relaunch', () => {
  async function relaunch() {
    const blob = await AsyncStorage.getItem('tasks');
    if (!blob) throw new Error('nothing was written');
    useTasks.setState({ tasks: [], log: {} });
    await AsyncStorage.setItem('tasks', blob);
    await useTasks.persist.rehydrate();
  }

  it('reads back every task and every answer exactly', async () => {
    const id = useTasks.getState().addTask({
      name: 'Water',
      schedule: { kind: 'daily' },
      startedOn: '2026-10-01',
      target: { count: 8, unit: 'glasses' },
      reminder: { hour: 9, minute: 30 },
    });
    useTasks.getState().setMark('a', DAY, 'done');
    useTasks.getState().setMark('c', DAY, 'missed');
    useTasks.getState().setNote('c', DAY, 'ill');
    useTasks.getState().setCount(id ?? '', DAY, 3);
    useTasks.getState().archiveTask('d');
    useTasks.getState().reorderTasks(['a', 'b', 'c', 'd'], 'c', 0);

    const before = sanitizeTasks(useTasks.getState());
    await relaunch();
    expect(sanitizeTasks(useTasks.getState())).toEqual(before);
    expect(useTasks.getState().tasks).toEqual(before.tasks);
    expect(useTasks.getState().log).toEqual(before.log);
  });

  it('a day put back to unanswered stays unanswered after a relaunch', async () => {
    useTasks.getState().toggleMark('a', DAY);
    useTasks.getState().toggleMark('a', DAY);
    await relaunch();
    expect(useTasks.getState().log).toEqual({});
  });

  it('a version-1 blob is renamed into the app’s language and keeps every mark', async () => {
    // One of the nine shipped strings, exactly as a pre-1.9.0 phone stored it.
    const english = 'Sleep before midnight';
    await AsyncStorage.setItem(
      'tasks',
      JSON.stringify({
        version: 1,
        state: {
          tasks: [
            { id: 'task_1', name: english, startedOn: '2026-01-01', order: 0 },
            { id: 'mine', name: 'My own row', startedOn: '2026-01-01', order: 1 },
          ],
          log: {
            task_1: { [DAY]: { mark: 'done', note: '' } },
            mine: { [DAY]: { mark: 'missed', note: 'away' } },
          },
        },
      }),
    );
    await useTasks.persist.rehydrate();
    const { tasks, log } = useTasks.getState();
    expect(tasks.map((task) => task.name)).toEqual([
      t(english, useSettings.getState().language),
      'My own row',
    ]);
    // The app ships in Russian, so the rename is a real one and not the identity.
    expect(tasks[0].name).not.toBe(english);
    expect(log).toEqual({
      task_1: { [DAY]: { mark: 'done', note: '' } },
      mine: { [DAY]: { mark: 'missed', note: 'away' } },
    });
  });
});
