import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyBackup,
  currentSnapshot,
  exportBackupText,
  legacyHeld,
  restorableCounts,
} from './dataTransfer';
import { sanitizeAi, useAi } from './aiStore';
import { useLibrary } from './libraryStore';
import { seedAccounts, seedCategories, useMoney } from './moneyStore';
import { useSettings } from './settingsStore';
import { seedTasks, useTasks } from './tasksStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { parseBackup } from '../lib/backup';

/**
 * The three apps against the real stores: what each writes out of them, and
 * what each puts back. The rule under test is "an app restores only its own
 * slice": a combined 2.x file must fill each app with its own log and leave the
 * rest of the store — in Workout, the hidden legacy tasks and money — untouched.
 */

const DAY = '2026-11-03';

/** A combined 2.x-shaped backup with one of everything. */
const combinedFile = () =>
  JSON.stringify({
    format: 'workout-tracker-backup',
    version: 2,
    exportedAt: '2026-11-03T20:00:00.000Z',
    settings: { language: 'en', restSecondsBetweenSets: 75, currencyCode: 'AMD' },
    exercises: useLibrary.getState().exercises,
    routines: useLibrary.getState().routines,
    workouts: [],
    tasks: {
      tasks: [
        {
          id: 'task_file',
          name: 'From the file',
          schedule: { kind: 'daily' },
          auto: null,
          startedOn: '2026-09-13',
          reminder: null,
          archivedAt: null,
          order: 0,
        },
      ],
      log: { task_file: { [DAY]: { mark: 'done', note: '' } } },
    },
    money: {
      accounts: seedAccounts,
      categories: seedCategories,
      amounts: [
        {
          id: 'amt_file',
          categoryId: 'food',
          accountId: 'cash',
          direction: 'expense',
          value: 4500,
          when: { kind: 'day', date: DAY },
          note: '',
          createdAt: '2026-11-03T10:00:00.000Z',
        },
      ],
    },
  });

/** The phone's own tasks and money, distinguishable from the file's. */
function phoneHoldsLegacy() {
  useTasks.getState().importTasks({
    tasks: [{ ...seedTasks()[0], id: 'task_phone', name: 'On the phone' }],
    log: {},
  });
  useMoney.getState().importMoney({
    categories: seedCategories,
    amounts: [
      {
        id: 'amt_phone',
        categoryId: 'food',
        accountId: 'cash',
        direction: 'expense',
        value: 100,
        when: { kind: 'day', date: DAY },
        note: '',
        createdAt: '2026-11-01T10:00:00.000Z',
      },
    ],
  });
}

beforeEach(() => {
  useLibrary.getState().restoreSeedLibrary();
  useWorkoutHistory.getState().clearHistory();
  useWorkoutHistory.setState({ loadFailed: false });
  useSettings.getState().resetToDefaults();
  useTasks.getState().importTasks({ tasks: seedTasks(), log: {} });
  useMoney.getState().importMoney({ accounts: seedAccounts, categories: seedCategories });
  useAi.setState(sanitizeAi({}));
});

describe('what each app writes', () => {
  it('Tasks: the tasks and the settings, no training and no money', () => {
    const file = JSON.parse(exportBackupText(undefined, 'tasks'));
    expect(file.tasks.tasks).toHaveLength(9);
    expect(file.settings).toBeTruthy();
    expect('workouts' in file).toBe(false);
    expect('exercises' in file).toBe(false);
    expect('money' in file).toBe(false);
    expect(file.counts).toEqual({ tasks: 9, chats: 0 });
  });

  it('Expenses: the money and the settings', () => {
    const file = JSON.parse(exportBackupText(undefined, 'expenses'));
    expect(file.money.accounts).toHaveLength(2);
    expect('workouts' in file).toBe(false);
    expect('tasks' in file).toBe(false);
  });

  it('Workout on a fresh install: the training only — seeds are not data', () => {
    expect(legacyHeld()).toEqual({ tasks: false, money: false });
    const file = JSON.parse(exportBackupText(undefined, 'workout'));
    expect(Array.isArray(file.workouts)).toBe(true);
    expect('tasks' in file).toBe(false);
    expect('money' in file).toBe(false);
  });

  it('Workout on the old install: keeps carrying the tasks and money it still holds', () => {
    phoneHoldsLegacy();
    expect(legacyHeld()).toEqual({ tasks: true, money: true });
    const snapshot = currentSnapshot('workout');
    expect((snapshot.tasks as { tasks: { id: string }[] }).tasks[0].id).toBe('task_phone');
    expect((snapshot.money as { amounts: unknown[] }).amounts).toHaveLength(1);
  });

  it('a Tasks backup is not refused over a training log it never carries', () => {
    useWorkoutHistory.setState({ workouts: [], loadFailed: true });
    expect(() => exportBackupText(undefined, 'tasks')).not.toThrow();
    expect(() => exportBackupText(undefined, 'workout')).toThrow();
  });
});

describe('the combined 2.x backup, restored into each app', () => {
  it('Workout: the training and settings; the hidden tasks and money stay', () => {
    phoneHoldsLegacy();
    const parsed = parseBackup(combinedFile(), 'en', 'workout');
    if (!parsed.ok) throw new Error(parsed.error);
    const applied = applyBackup(parsed.envelope, 'workout');

    expect(applied.workouts).toBe(0);
    expect(applied.tasks).toBeUndefined();
    expect(applied.amounts).toBeUndefined();
    expect(useSettings.getState().restSecondsBetweenSets).toBe(75);
    expect(useTasks.getState().tasks.map((task) => task.id)).toEqual(['task_phone']);
    expect(useMoney.getState().amounts.map((amount) => amount.id)).toEqual(['amt_phone']);
  });

  it('Tasks: the tasks; the training and money are not touched', () => {
    phoneHoldsLegacy();
    const routines = useLibrary.getState().routines;
    const parsed = parseBackup(combinedFile(), 'en', 'tasks');
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.counts).toEqual({ tasks: 1 });
    const applied = applyBackup(parsed.envelope, 'tasks');

    expect(applied).toEqual({ settingsApplied: true, tasks: 1 });
    expect(useTasks.getState().tasks.map((task) => task.id)).toEqual(['task_file']);
    expect(useMoney.getState().amounts.map((amount) => amount.id)).toEqual(['amt_phone']);
    expect(useLibrary.getState().routines).toBe(routines);
  });

  it('Expenses: the money; the tasks are not touched', () => {
    phoneHoldsLegacy();
    const parsed = parseBackup(combinedFile(), 'en', 'expenses');
    if (!parsed.ok) throw new Error(parsed.error);
    const applied = applyBackup(parsed.envelope, 'expenses');

    expect(applied.amounts).toBe(1);
    expect(applied.workouts).toBeUndefined();
    expect(useMoney.getState().amounts.map((amount) => amount.id)).toEqual(['amt_file']);
    expect(useTasks.getState().tasks.map((task) => task.id)).toEqual(['task_phone']);
  });
});

describe('a file with nothing for this app', () => {
  it('is refused by applyBackup too, before the settings change', () => {
    const tasksOnly = { settings: { restSecondsBetweenSets: 33 }, tasks: { tasks: [], log: {} } };
    const before = useSettings.getState().restSecondsBetweenSets;
    expect(() => applyBackup(tasksOnly, 'expenses')).toThrow('That file has no expenses in it.');
    expect(() => applyBackup(tasksOnly, 'workout')).toThrow(/no exercises/);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(before);
  });

  it('a Tasks app file round-trips through the Tasks app', () => {
    useTasks.getState().toggleMark('task_1', DAY);
    const text = exportBackupText(undefined, 'tasks');
    useTasks.getState().importTasks({ tasks: seedTasks(), log: {} });
    const parsed = parseBackup(text, 'en', 'tasks');
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope, 'tasks');
    expect(useTasks.getState().log.task_1?.[DAY]?.mark).toBe('done');
  });
});

describe('an empty settings block', () => {
  it('does not reset the settings to defaults', () => {
    useSettings.getState().setNumber('restSecondsBetweenSets', 140);
    const applied = applyBackup({ settings: {}, tasks: { tasks: [], log: {} } }, 'tasks');
    expect(applied.settingsApplied).toBe(false);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(140);
  });
});

describe('what a restore would replace, for the confirmation sheet', () => {
  it('counts only this app’s slice', () => {
    phoneHoldsLegacy();
    expect(restorableCounts('workout').tasks).toBeUndefined();
    expect(restorableCounts('workout').workouts).toBe(0);
    expect(restorableCounts('tasks')).toEqual({ tasks: 1, chats: 0 });
    expect(restorableCounts('expenses')).toEqual({ amounts: 1, chats: 0 });
  });
});
