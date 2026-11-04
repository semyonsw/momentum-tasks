import { describe, expect, it } from 'vitest';

import { APP_VARIANTS, type AppVariant } from './appVariant';
import {
  NO_LEGACY,
  backupSlices,
  carriedSlices,
  countPayload,
  describeCounts,
  holdsLegacy,
  mergeAiChats,
  ownSlice,
  parseBackup,
  serializeBackup,
  slicePayload,
  type BackupPayload,
} from './backup';

/**
 * One format, three apps: what each app writes, and what each takes from a file.
 *
 * The combined fixture below has the shape of the real last 2.x backup (every
 * section, AI chats in two of the three): it is the file Tasks and Expenses are
 * first filled from, so every app must read it — and take only its own part.
 */

const combined = (): BackupPayload => ({
  settings: { language: 'en', currencyCode: 'AMD', restSecondsBetweenSets: 90 },
  exercises: [{ id: 'ex_1' }, { id: 'ex_2' }],
  routines: [{ id: 'r_1' }],
  workouts: [
    { id: 'w_1', sets: [{}, {}, {}] },
    { id: 'w_2', sets: [{}] },
  ],
  sequence: { isActive: false, routineIds: [], cursor: 0 },
  numbering: { workoutId: 'w_2', number: 31 },
  debriefs: [{ workoutId: 'w_1' }],
  tasks: {
    tasks: [{ id: 'task_a' }, { id: 'task_b' }, { id: 'task_c' }],
    log: { task_a: { '2026-11-03': { mark: 'done', note: '' } } },
  },
  money: {
    accounts: [{ id: 'cash', opening: 1100 }],
    categories: [{ id: 'food' }],
    amounts: [{ id: 'amt_1' }, { id: 'amt_2' }],
  },
  aiChats: {
    chats: { Workout: [{ id: 'm1' }], Tasks: [], Expenses: [{ id: 'm2' }] },
    archive: { Workout: [{ id: 'a1', messages: [] }], Tasks: [{ id: 'a2' }], Expenses: [] },
    proposals: { p1: {} },
  },
});

const parseAs = (payload: BackupPayload, variant: AppVariant) =>
  parseBackup(serializeBackup(payload), 'en', variant);

describe('which slices each app writes', () => {
  it('Tasks and Expenses write their own, whatever the store holds', () => {
    expect(backupSlices('tasks')).toEqual(['tasks']);
    expect(backupSlices('expenses')).toEqual(['money']);
    expect(backupSlices('tasks', { tasks: true, money: true })).toEqual(['tasks']);
    expect(backupSlices('expenses', { tasks: true, money: true })).toEqual(['money']);
  });

  it('Workout writes the training, and the legacy logs for as long as it holds them', () => {
    expect(backupSlices('workout', NO_LEGACY)).toEqual(['workout']);
    expect(backupSlices('workout', { tasks: true, money: false })).toEqual(['workout', 'tasks']);
    expect(backupSlices('workout', { tasks: true, money: true })).toEqual([
      'workout',
      'tasks',
      'money',
    ]);
  });

  it('each app’s own slice is its section', () => {
    expect(APP_VARIANTS.map(ownSlice)).toEqual(['workout', 'tasks', 'money']);
  });
});

describe('cutting a payload to a slice', () => {
  it('keeps the settings and only the named collections', () => {
    const tasksOnly = slicePayload(combined(), ['tasks']);
    expect(Object.keys(tasksOnly).sort()).toEqual(['aiChats', 'settings', 'tasks']);
    expect(tasksOnly.settings).toEqual(combined().settings);
    // Absent, not empty: a Tasks file must never read as "the training is nothing".
    expect('workouts' in tasksOnly).toBe(false);
    expect('exercises' in tasksOnly).toBe(false);
    expect('money' in tasksOnly).toBe(false);
  });

  it('keeps the training whole — sequence, numbering and debriefs ride with it', () => {
    const training = slicePayload(combined(), ['workout']);
    expect(training.workouts).toHaveLength(2);
    expect(training.sequence).toEqual(combined().sequence);
    expect(training.numbering).toEqual(combined().numbering);
    expect(training.debriefs).toEqual(combined().debriefs);
    expect('tasks' in training).toBe(false);
  });

  it('splits the assistant by section, proposals whole', () => {
    const money = slicePayload(combined(), ['money']).aiChats as {
      chats: Record<string, unknown[]>;
      archive: Record<string, unknown[]>;
      proposals: unknown;
    };
    expect(Object.keys(money.chats)).toEqual(['Expenses']);
    expect(money.chats.Expenses).toEqual([{ id: 'm2' }]);
    expect(Object.keys(money.archive)).toEqual(['Expenses']);
    expect(money.proposals).toEqual({ p1: {} });
  });

  it('never invents a collection the source did not carry', () => {
    const v1: BackupPayload = { settings: null, exercises: [], routines: [], workouts: [] };
    expect(carriedSlices(slicePayload(v1, ['workout', 'tasks', 'money']))).toEqual(['workout']);
  });
});

describe('the combined 2.x backup, read by each app', () => {
  it('Workout: the training only', () => {
    const result = parseAs(combined(), 'workout');
    if (!result.ok) throw new Error(result.error);
    expect(result.counts).toEqual({ exercises: 2, routines: 1, workouts: 2, sets: 4, chats: 2 });
    expect(result.envelope.tasks).toBeUndefined();
    expect(result.envelope.money).toBeUndefined();
    expect(result.envelope.numbering).toEqual(combined().numbering);
  });

  it('Tasks: the tasks only, and the description says nothing about training', () => {
    const result = parseAs(combined(), 'tasks');
    if (!result.ok) throw new Error(result.error);
    expect(result.counts).toEqual({ tasks: 3, chats: 1 });
    expect(result.envelope.workouts).toBeUndefined();
    expect(result.envelope.money).toBeUndefined();
    expect(result.envelope.settings).toEqual(combined().settings);
    expect(describeCounts(result.counts)).toBe('3 tasks · 1 AI chat');
  });

  it('Expenses: the money only', () => {
    const result = parseAs(combined(), 'expenses');
    if (!result.ok) throw new Error(result.error);
    expect(result.counts).toEqual({ amounts: 2, chats: 1 });
    expect(result.envelope.tasks).toBeUndefined();
    expect(result.envelope.exercises).toBeUndefined();
    expect(describeCounts(result.counts)).toBe('2 amounts · 1 AI chat');
  });
});

describe('a file one app wrote, read by the others', () => {
  const written = (variant: AppVariant) =>
    serializeBackup(slicePayload(combined(), backupSlices(variant)));

  it('opens in its own app', () => {
    for (const variant of APP_VARIANTS) {
      expect(parseBackup(written(variant), 'en', variant).ok).toBe(true);
    }
  });

  it('is the same envelope: format and version unchanged', () => {
    for (const variant of APP_VARIANTS) {
      const file = JSON.parse(written(variant));
      expect(file.format).toBe('workout-tracker-backup');
      expect(file.version).toBe(2);
    }
  });

  it('says plainly when it has nothing for this app, rather than restoring zero rows', () => {
    const tasksFile = written('tasks');
    const asWorkout = parseBackup(tasksFile, 'en', 'workout');
    const asExpenses = parseBackup(tasksFile, 'en', 'expenses');
    expect(asWorkout).toEqual({
      ok: false,
      error: 'That file has no exercises, routines or workouts in it.',
    });
    expect(asExpenses).toEqual({ ok: false, error: 'That file has no expenses in it.' });
    expect(parseBackup(written('expenses'), 'en', 'tasks')).toEqual({
      ok: false,
      error: 'That file has no tasks in it.',
    });
  });

  it('a Workout file still carrying legacy logs fills Tasks and Expenses too', () => {
    const legacy = serializeBackup(
      slicePayload(combined(), backupSlices('workout', { tasks: true, money: true })),
    );
    for (const variant of APP_VARIANTS) {
      expect(parseBackup(legacy, 'en', variant).ok).toBe(true);
    }
  });

  it('a training-only file (version 1) is refused by Tasks and Expenses', () => {
    const v1 = JSON.stringify({ exercises: [], routines: [], workouts: [] });
    expect(parseBackup(v1, 'en', 'workout').ok).toBe(true);
    expect(parseBackup(v1, 'en', 'tasks').ok).toBe(false);
    expect(parseBackup(v1, 'en', 'expenses').ok).toBe(false);
  });

  it('a file with no section at all is empty in every app', () => {
    const empty = JSON.stringify({ format: 'workout-tracker-backup', version: 2, settings: {} });
    for (const variant of APP_VARIANTS) {
      const result = parseBackup(empty, 'en', variant);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toMatch(/empty/);
    }
  });
});

describe('counting a sliced payload', () => {
  it('leaves the training out of the counts when it is not there', () => {
    expect(countPayload({ settings: null, tasks: { tasks: [{}], log: {} } })).toEqual({ tasks: 1 });
    expect(describeCounts({ tasks: 1 })).toBe('1 task');
  });
});

describe('does the Workout store still hold the old logs?', () => {
  const seed = { taskIds: ['task_1', 'task_2'], accountIds: ['cash', 'online'] };
  const seeded = {
    tasks: { tasks: [{ id: 'task_1' }, { id: 'task_2' }], log: {} },
    money: {
      accounts: [
        { id: 'cash', opening: 0 },
        { id: 'online', opening: 0 },
      ],
      categories: [{ id: 'food' }, { id: 'transfer_in' }],
      amounts: [],
    },
    aiChats: { chats: { Workout: [{}], Tasks: [], Expenses: [] }, archive: {} },
  };

  it('no — a fresh install’s seed is not data', () => {
    expect(holdsLegacy(seeded, seed)).toEqual({ tasks: false, money: false });
  });

  it('yes — any answered day, any edited list, any Tasks chat', () => {
    expect(
      holdsLegacy({ ...seeded, tasks: { ...seeded.tasks, log: { task_1: { d: {} } } } }, seed)
        .tasks,
    ).toBe(true);
    expect(
      holdsLegacy({ ...seeded, tasks: { tasks: [{ id: 'task_1' }], log: {} } }, seed).tasks,
    ).toBe(true);
    expect(
      holdsLegacy({ ...seeded, aiChats: { chats: {}, archive: { Tasks: [{}] } } }, seed).tasks,
    ).toBe(true);
  });

  it('yes — any amount, opening balance, plan, extra account or Expenses chat', () => {
    const money = seeded.money;
    const held = (over: Record<string, unknown>) =>
      holdsLegacy({ ...seeded, money: { ...money, ...over } }, seed).money;
    expect(held({ amounts: [{ id: 'a' }] })).toBe(true);
    expect(
      held({
        accounts: [
          { id: 'cash', opening: 1100 },
          { id: 'online', opening: 0 },
        ],
      }),
    ).toBe(true);
    expect(held({ accounts: [...money.accounts, { id: 'card', opening: 0 }] })).toBe(true);
    expect(held({ budgets: [{}] })).toBe(true);
    expect(held({ recurring: [{}] })).toBe(true);
    expect(held({ goals: [{}] })).toBe(true);
    expect(held({ scale: 2 })).toBe(true);
    expect(
      holdsLegacy({ ...seeded, aiChats: { chats: { Expenses: [{}] }, archive: {} } }, seed).money,
    ).toBe(true);
  });
});

describe('restoring the assistant', () => {
  const here = {
    chats: { Workout: [{ id: 'here-w' }], Tasks: [{ id: 'here-t' }], Expenses: [] },
    archive: { Workout: [], Tasks: [], Expenses: [{ id: 'here-e' }] },
    proposals: { mine: {} },
  };

  it('takes this app’s sections from the file and keeps every other one', () => {
    const merged = mergeAiChats(here, combined().aiChats, ['tasks']) as typeof here;
    expect(merged.chats.Tasks).toEqual([]);
    expect(merged.archive.Tasks).toEqual([{ id: 'a2' }]);
    expect(merged.chats.Workout).toEqual([{ id: 'here-w' }]);
    expect(merged.archive.Expenses).toEqual([{ id: 'here-e' }]);
    expect(merged.proposals).toEqual({ mine: {}, p1: {} });
  });

  it('leaves them alone when the file carries none', () => {
    expect(mergeAiChats(here, undefined, ['workout'])).toBeUndefined();
  });
});
