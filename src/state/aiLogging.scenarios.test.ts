import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * THE LOGGING CARD, END TO END — "I spent 12 on lunch", "mark reading done for
 * yesterday", "I weigh 81 today", "that first bench set was a warm-up".
 *
 * The same harness as `aiChangesScenarios.test.ts`: `fetch` is a queue of
 * scripted Gemini replies and everything else is the real path — `sendMessage`
 * validating the block against the stores, `applyChanges` writing through each
 * store's own action, and the one Undo. What is different about these targets is
 * that they ADD rows rather than tune a value, so the Undo cannot be "write the
 * old value back": it has to delete exactly the amount it made, restore exactly
 * the day entry it overwrote (a note included), and put back the workout it
 * corrected — in memory and on disk.
 */
let storedKey: string | null = null;
vi.mock('../lib/ai/secureKey', () => ({
  getKey: async () => storedKey,
  setKey: async () => true,
  clearKey: async () => {
    storedKey = null;
  },
}));

import { applyChanges, sendMessage } from './aiActions';
import { sanitizeAi, useAi, type ChangesChatBlock } from './aiStore';
import { useActiveWorkout } from './activeWorkoutStore';
import { __closeDb, readAllWorkouts } from './historyDb';
import { useLibrary } from './libraryStore';
import { seedAccounts, seedCategories, useMoney } from './moneyStore';
import { useSettings } from './settingsStore';
import { useTasks } from './tasksStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import type { CompletedWorkout } from '../lib/completedWorkout';
import { dayKey } from '../lib/days';
import type { Task } from '../lib/tasks';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import { __resetDatabases } from '../../test/expoSqliteStub';
import type { Exercise, ID } from '../types/models';

/* ------------------------------------------------------------------ */
/* The user's things                                                   */
/* ------------------------------------------------------------------ */

const TODAY = dayKey(new Date());
const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
})();
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dayKey(d);
})();

const task = (id: string, name: string, order: number, over: Partial<Task> = {}): Task => ({
  id,
  name,
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-01-01',
  reminder: null,
  archivedAt: null,
  order,
  ...over,
});
const TASKS: Task[] = [
  task('t_read', 'Read', 0, { target: { count: 20, unit: 'pages' } }),
  task('t_stretch', 'Stretch', 1),
  task('t_floss', 'Floss', 2),
  // Answered by the app itself whenever an amount is recorded.
  task('t_money', 'Track expenses', 3, { auto: 'money' }),
];

const CATEGORIES = [
  ...seedCategories,
  {
    id: 'salary',
    name: 'Salary',
    glyph: '💰',
    direction: 'income' as const,
    order: 0,
    archivedAt: null,
  },
];

/* A saved workout, the way `workoutHistoryStore.edits.test.ts` makes one. */
const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function loggedDraft(startedAt: string): DraftSession {
  const session = buildDraftSession({
    routine: seedRoutine,
    exercisesById,
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
    startedAt,
    now: new Date(startedAt),
  });
  const [first, second, ...rest] = session.entries;
  const logged = (entry: typeof first, n: number) => ({
    ...entry,
    sets: entry.sets.map((s, i) =>
      i < n ? { ...s, isCompleted: true, weightKg: 40, isPrefilled: false } : s,
    ),
  });
  return { ...session, entries: [logged(first, 3), logged(second, 1), ...rest] };
}

function saveWorkout(startedAt = '2026-09-01T17:00:00.000Z'): CompletedWorkout {
  const stored = useWorkoutHistory.getState().saveSession(loggedDraft(startedAt));
  if (!stored) throw new Error('nothing was saved');
  return stored;
}

/** A workout as it is on disk — what a relaunch would read. */
const onDisk = (id: string) => (readAllWorkouts() as CompletedWorkout[]).find((w) => w.id === id);

const workout = (id: string) => useWorkoutHistory.getState().workouts.find((w) => w.id === id)!;

/** The first exercise's working sets in a saved workout, in the order the log shows them. */
function workingSets(w: CompletedWorkout) {
  const exerciseId = w.sets[0].exerciseId;
  return {
    exerciseId,
    sets: w.sets
      .filter((s) => s.exerciseId === exerciseId && !s.isWarmup)
      .sort((a, b) => a.setIndex - b.setIndex),
  };
}

/* ------------------------------------------------------------------ */
/* Scripted Gemini                                                     */
/* ------------------------------------------------------------------ */

type Answer = { status: number; body: unknown };
let answers: Answer[] = [];

function reply(items: unknown[], why = 'Logged.'): Answer {
  const blocks = [
    { type: 'text', text: 'Sure.' },
    { type: 'changes_proposal', changes: { items, why } },
  ];
  return {
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ blocks }) }] } }] },
  };
}

type Section = 'Workout' | 'Tasks' | 'Expenses';

async function ask(
  section: Section,
  answer: Answer,
): Promise<{ id: string; card: ChangesChatBlock | undefined }> {
  answers.push(answer);
  await sendMessage(section, 'log this');
  const last = useAi.getState().chats[section].at(-1)!;
  if (last.role !== 'model') throw new Error(`no answer: ${JSON.stringify(last)}`);
  const card = last.blocks.find((b): b is ChangesChatBlock => b.type === 'changes');
  return { id: last.id, card };
}

const cardOf = (section: Section, id: string) => {
  const message = useAi.getState().chats[section].find((m) => m.id === id);
  return message?.role === 'model'
    ? message.blocks.find((b): b is ChangesChatBlock => b.type === 'changes')
    : undefined;
};

const rowsOf = (card: ChangesChatBlock | undefined) =>
  card?.rows.map(({ subject, label, from, to }) => `${subject} | ${label} | ${from} → ${to}`);

/** Everything a logging card can touch, as plain data. */
function snapshot() {
  const s = useSettings.getState();
  return JSON.parse(
    JSON.stringify({
      amounts: useMoney.getState().amounts,
      budgets: useMoney.getState().budgets ?? null,
      bodyweightKg: s.bodyweightKg ?? null,
      bodyweightLog: s.bodyweightLog,
      rest: s.restSecondsBetweenSets,
      tasks: useTasks.getState().tasks,
      log: useTasks.getState().log,
      workouts: useWorkoutHistory.getState().workouts,
    }),
  );
}

beforeEach(() => {
  storedKey = 'AIzaSyTESTKEY-1234567890abcdef';
  answers = [];
  __resetDatabases();
  __closeDb();
  useAi.setState({
    ...sanitizeAi({}),
    pending: { Workout: false, Tasks: false, Expenses: false },
    retrying: { Workout: false, Tasks: false, Expenses: false },
  });
  useAi.getState().markReady(500);
  useSettings.getState().resetToDefaults();
  useSettings.getState().setLanguage('en');
  useSettings.setState({ bodyweightKg: 80, bodyweightLog: [], autoTickTasks: true });
  useLibrary.getState().replaceLibrary({ exercises: seedExercises, routines: [seedRoutine] });
  useWorkoutHistory.setState({ workouts: [], numbering: null, loadFailed: false, ready: true });
  useTasks.setState({ tasks: TASKS, log: {} });
  useMoney.setState({
    accounts: seedAccounts,
    categories: CATEGORIES,
    amounts: [],
    budgets: [{ categoryId: 'food', monthly: 400, alerts: true }],
  });
  useActiveWorkout.getState().discardSession();
  vi.stubGlobal('fetch', async () => {
    const next = answers.shift();
    if (!next) throw new TypeError('Network request failed');
    return { status: next.status, text: async () => JSON.stringify(next.body) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* Amounts — the Expenses chat                                         */
/* ------------------------------------------------------------------ */

describe('an amount on an Expenses card', () => {
  it('is checked on the way in: a future day, an unknown category, a zero, a Workout-only target are dropped', async () => {
    const before = snapshot();
    const { card } = await ask(
      'Expenses',
      reply([
        { target: 'amount', field: 'add', id: 'food', number: 12.4, text: 'lunch' },
        { target: 'income', field: 'add', id: 'salary', number: 1000, day: YESTERDAY },
        { target: 'amount', field: 'add', id: 'food', number: 5, day: TOMORROW },
        { target: 'amount', field: 'add', id: 'nope', number: 5 },
        { target: 'amount', field: 'add', id: 'food', number: 0 },
        { target: 'bodyweight', field: 'log', number: 81 },
      ]),
    );
    expect(card?.changes).toEqual([
      {
        target: 'amount',
        field: 'add',
        id: 'food',
        direction: 'expense',
        value: 12,
        day: TODAY,
        note: 'lunch',
      },
      {
        target: 'amount',
        field: 'add',
        id: 'salary',
        direction: 'income',
        value: 1000,
        day: YESTERDAY,
        note: '',
      },
    ]);
    expect(card?.rows.map((r) => [r.subject, r.label.split(' · ')[0], r.from])).toEqual([
      ['Food · lunch', 'New expense', ''],
      ['Salary', 'New income', ''],
    ]);
    // Drawing the card writes nothing.
    expect(snapshot()).toEqual(before);
  });

  it('Apply adds each amount on its day and account; Undo deletes exactly those', async () => {
    useMoney.getState().addAmount({
      categoryId: 'food',
      accountId: 'cash',
      direction: 'expense',
      value: 3,
      when: { kind: 'day', date: YESTERDAY },
      note: 'already here',
    });
    useTasks.setState({ log: {} });
    const before = snapshot();

    const { id } = await ask(
      'Expenses',
      reply([
        { target: 'amount', field: 'add', id: 'food', number: 12, text: 'lunch' },
        { target: 'amount', field: 'add', id: 'food', number: 12, text: 'lunch', day: YESTERDAY },
        { target: 'amount', field: 'add', id: 'salary', number: 900, account: 'online' },
      ]),
    );
    const applied = applyChanges('Expenses', id);
    expect(applied?.message).toBe('3 changes applied');

    const added = useMoney.getState().amounts.filter((a) => a.note !== 'already here');
    expect(
      added.map((a) => [a.categoryId, a.accountId, a.direction, a.value, a.when, a.note]),
    ).toEqual([
      ['food', 'cash', 'expense', 12, { kind: 'day', date: TODAY }, 'lunch'],
      ['food', 'cash', 'expense', 12, { kind: 'day', date: YESTERDAY }, 'lunch'],
      ['salary', 'online', 'income', 900, { kind: 'day', date: TODAY }, ''],
    ]);
    expect(new Set(added.map((a) => a.id)).size).toBe(3);
    expect(cardOf('Expenses', id)?.status).toBe('accepted');

    applied!.undo();
    expect(useMoney.getState().amounts).toEqual(before.amounts);
    expect(cardOf('Expenses', id)?.status).toBe('pending');
  });

  it('an account that is not there falls back to the first live one', async () => {
    const { id } = await ask(
      'Expenses',
      reply([{ target: 'amount', field: 'add', id: 'food', number: 7, account: 'acct_gone' }]),
    );
    applyChanges('Expenses', id);
    expect(useMoney.getState().amounts.map((a) => a.accountId)).toEqual(['cash']);
  });

  it('Undo also takes back the Track-expenses tick the amount answered on its own', async () => {
    const before = snapshot();
    const { id } = await ask(
      'Expenses',
      reply([{ target: 'amount', field: 'add', id: 'food', number: 12, day: YESTERDAY }]),
    );
    const applied = applyChanges('Expenses', id)!;
    // Recording the amount ticked the auto task, on the amount's day.
    expect(useTasks.getState().log.t_money?.[YESTERDAY]?.mark).toBe('done');

    /* `addAmount` ticked the auto task on its own; the Undo has to take that
       tick back too, or a day stays answered by an amount that is gone. */
    applied.undo();
    expect(useMoney.getState().amounts).toEqual([]);
    // The amount is gone, so the day it answered is unanswered again.
    expect(useTasks.getState().log).toEqual(before.log);
  });

  it('a category archived since the answer is skipped; with nothing left, nothing is applied', async () => {
    const { id } = await ask(
      'Expenses',
      reply([
        { target: 'amount', field: 'add', id: 'food', number: 12 },
        { target: 'amount', field: 'add', id: 'health', number: 30 },
      ]),
    );
    useMoney.getState().archiveCategory('health');
    const applied = applyChanges('Expenses', id);
    expect(applied?.message).toBe('1 changes applied');
    expect(useMoney.getState().amounts.map((a) => a.categoryId)).toEqual(['food']);

    const lone = await ask(
      'Expenses',
      reply([{ target: 'amount', field: 'add', id: 'entertainment', number: 9 }]),
    );
    useMoney.getState().archiveCategory('entertainment');
    const amounts = useMoney.getState().amounts;
    expect(applyChanges('Expenses', lone.id)).toBeNull();
    expect(useMoney.getState().amounts).toEqual(amounts);
    expect(cardOf('Expenses', lone.id)?.status).toBe('pending');
  });

  it('mixed with a budget: Apply writes both, Undo restores both exactly', async () => {
    const before = snapshot();
    const { id } = await ask(
      'Expenses',
      reply([
        { target: 'budget', id: 'food', field: 'monthly', number: 300 },
        { target: 'amount', field: 'add', id: 'food', number: 25, text: 'groceries' },
        { target: 'budget', id: 'health', field: 'monthly', number: 50 },
      ]),
    );
    const applied = applyChanges('Expenses', id)!;
    expect(applied.message).toBe('3 changes applied');
    expect(useMoney.getState().budgets).toEqual([
      { categoryId: 'food', monthly: 300, alerts: true },
      { categoryId: 'health', monthly: 50 },
    ]);
    expect(useMoney.getState().amounts).toHaveLength(1);

    applied.undo();
    const after = snapshot();
    // The auto-tick is pinned by its own test above; this one is about money.
    expect({ ...after, log: null }).toEqual({ ...before, log: null });
  });
});

/* ------------------------------------------------------------------ */
/* Body weight — the Workout chat                                      */
/* ------------------------------------------------------------------ */

describe('a weigh-in on a Workout card', () => {
  it('reads today’s weight as its from, refuses one out of bounds, rounds to 0.1', async () => {
    const { card } = await ask(
      'Workout',
      reply([{ target: 'bodyweight', field: 'log', number: 81.24 }]),
    );
    expect(card?.changes).toEqual([{ target: 'bodyweight', field: 'log', value: 81.2 }]);
    expect(rowsOf(card)).toEqual(['Body weight | Today | 80 kg → 81.2 kg']);

    const silly = await ask('Workout', reply([{ target: 'weight', field: 'log', number: 4000 }]));
    expect(silly.card).toBeUndefined();
  });

  it('Apply writes the scalar and the log; Undo restores both', async () => {
    useSettings.getState().setBodyweightKg(79);
    const before = snapshot();
    expect(before.bodyweightLog).toHaveLength(1);

    const { id } = await ask(
      'Workout',
      reply([{ target: 'bodyweight', field: 'log', number: 81 }]),
    );
    const applied = applyChanges('Workout', id)!;
    expect(applied.message).toBe('1 changes applied');
    const s = useSettings.getState();
    expect(s.bodyweightKg).toBe(81);
    expect(s.bodyweightLog.at(-1)?.kg).toBe(81);

    applied.undo();
    expect(snapshot()).toEqual(before);
  });

  it('a first weigh-in on a device that never had one, and its Undo', async () => {
    useSettings.setState({ bodyweightKg: undefined, bodyweightLog: [] });
    const { id, card } = await ask(
      'Workout',
      reply([{ target: 'bodyweight', field: 'log', number: 72 }]),
    );
    expect(card?.rows[0].from).toBe('');
    const applied = applyChanges('Workout', id)!;
    expect(useSettings.getState().bodyweightKg).toBe(72);
    applied.undo();
    expect(useSettings.getState().bodyweightKg).toBeUndefined();
    expect(useSettings.getState().bodyweightLog).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* A saved set's kind — the Workout chat                               */
/* ------------------------------------------------------------------ */

describe('a set correction on a Workout card', () => {
  it('names the set by its place among the WORKING sets, and refuses a no-op or a set that is not there', async () => {
    const saved = saveWorkout();
    const { exerciseId, sets } = workingSets(saved);
    expect(sets.length).toBeGreaterThanOrEqual(2);

    const { card } = await ask(
      'Workout',
      reply([
        {
          target: 'workout_set',
          field: 'kind',
          id: saved.id,
          exerciseId,
          number: 2,
          text: 'warm-up',
        },
        // Already a working set.
        { target: 'set', field: 'kind', id: saved.id, exerciseId, number: 1, text: 'working' },
        { target: 'set', field: 'kind', id: saved.id, exerciseId, number: 99, text: 'drop' },
        { target: 'set', field: 'kind', id: 'w_gone', exerciseId, number: 1, text: 'drop' },
        { target: 'set', field: 'kind', id: saved.id, exerciseId, number: 1, text: 'sideways' },
      ]),
    );
    expect(card?.changes).toEqual([
      {
        target: 'workout_set',
        field: 'kind',
        id: saved.id,
        exerciseId,
        setId: sets[1].id,
        from: 'working',
        value: 'warmup',
        day: saved.startedAt.slice(0, 10),
        position: 2,
      },
    ]);
    expect(card?.rows[0].label).toBe('Set 2');
    expect(card?.rows[0].subject).toContain('1 Sep');
  });

  it('a set re-marked warm-up stops counting — setCount and volume drop — and Undo puts the workout back, on disk too', async () => {
    const saved = saveWorkout();
    const { exerciseId, sets } = workingSets(saved);
    const before = snapshot();

    const { id } = await ask(
      'Workout',
      reply([
        {
          target: 'workout_set',
          field: 'kind',
          id: saved.id,
          exerciseId,
          number: 1,
          text: 'warmup',
        },
      ]),
    );
    const applied = applyChanges('Workout', id)!;
    expect(applied.message).toBe('1 changes applied');

    const corrected = workout(saved.id);
    const row = corrected.sets.find((s) => s.id === sets[0].id)!;
    expect(row.isWarmup).toBe(true);
    expect(row).not.toHaveProperty('setType');
    expect(corrected.setCount).toBe(saved.setCount - 1);
    // Less by that set's load (its exercise may add the bodyweight to the 40 kg).
    expect(corrected.totalVolumeKg).toBeLessThan(saved.totalVolumeKg);
    expect(corrected.totalVolumeKg).toBeLessThanOrEqual(saved.totalVolumeKg - 40 * sets[0].count);
    // And the disk agrees, so the correction survives a relaunch.
    expect(onDisk(saved.id)?.setCount).toBe(saved.setCount - 1);

    applied.undo();
    expect(snapshot()).toEqual(before);
    const reread = onDisk(saved.id)!;
    expect(reread.setCount).toBe(saved.setCount);
    expect(reread.totalVolumeKg).toBe(saved.totalVolumeKg);
    expect(reread.sets.find((s) => s.id === sets[0].id)?.isWarmup).toBe(false);
  });

  it('two sets of one workout on one card: both change, one Undo restores the original', async () => {
    const saved = saveWorkout();
    const { exerciseId, sets } = workingSets(saved);
    const before = snapshot();
    const { id } = await ask(
      'Workout',
      reply([
        {
          target: 'workout_set',
          field: 'kind',
          id: saved.id,
          exerciseId,
          number: 1,
          text: 'warmup',
        },
        {
          target: 'workout_set',
          field: 'kind',
          id: saved.id,
          exerciseId,
          number: 3,
          text: 'failure',
        },
      ]),
    );
    const applied = applyChanges('Workout', id)!;
    expect(applied.message).toBe('2 changes applied');
    const w = workout(saved.id);
    expect(w.sets.find((s) => s.id === sets[0].id)?.isWarmup).toBe(true);
    expect(w.sets.find((s) => s.id === sets[2].id)?.setType).toBe('failure');

    applied.undo();
    expect(snapshot()).toEqual(before);
  });

  it('a workout deleted since the answer is skipped, and Undo does not bring it back', async () => {
    const keep = saveWorkout('2026-09-01T17:00:00.000Z');
    const gone = saveWorkout('2026-09-03T17:00:00.000Z');
    const k = workingSets(keep);
    const g = workingSets(gone);
    const { id } = await ask(
      'Workout',
      reply([
        {
          target: 'workout_set',
          field: 'kind',
          id: keep.id,
          exerciseId: k.exerciseId,
          number: 1,
          text: 'drop',
        },
        {
          target: 'workout_set',
          field: 'kind',
          id: gone.id,
          exerciseId: g.exerciseId,
          number: 1,
          text: 'drop',
        },
      ]),
    );
    useWorkoutHistory.getState().deleteWorkout(gone.id);
    const applied = applyChanges('Workout', id)!;
    expect(applied.message).toBe('1 changes applied');
    applied.undo();
    expect(useWorkoutHistory.getState().workouts.map((w) => w.id)).toEqual([keep.id]);

    const lone = await ask(
      'Workout',
      reply([
        {
          target: 'workout_set',
          field: 'kind',
          id: keep.id,
          exerciseId: k.exerciseId,
          number: 1,
          text: 'amrap',
        },
      ]),
    );
    useWorkoutHistory.getState().deleteWorkout(keep.id);
    expect(applyChanges('Workout', lone.id)).toBeNull();
    expect(cardOf('Workout', lone.id)?.status).toBe('pending');
  });

  it('mixed with a weigh-in and a setting: all three apply, one Undo restores all three', async () => {
    const saved = saveWorkout();
    const { exerciseId } = workingSets(saved);
    const before = snapshot();
    const { id, card } = await ask(
      'Workout',
      reply([
        { target: 'bodyweight', field: 'log', number: 82 },
        {
          target: 'workout_set',
          field: 'kind',
          id: saved.id,
          exerciseId,
          number: 1,
          text: 'warmup',
        },
        { target: 'setting', field: 'rest_between_sets', number: 60 },
        // Not this chat's to log.
        { target: 'amount', field: 'add', id: 'food', number: 12 },
        { target: 'task', id: 't_stretch', field: 'done' },
      ]),
    );
    expect(card?.changes.map((c) => c.target)).toEqual(['bodyweight', 'workout_set', 'setting']);
    const applied = applyChanges('Workout', id)!;
    expect(applied.message).toBe('3 changes applied');
    expect(useSettings.getState().bodyweightKg).toBe(82);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(60);
    expect(workout(saved.id).setCount).toBe(saved.setCount - 1);
    expect(useMoney.getState().amounts).toEqual([]);
    expect(useTasks.getState().log).toEqual({});

    /* `restoreWorkout` reprices the session at the bodyweight in force at that
       moment, so the weigh-in has to be undone FIRST — otherwise the workout
       comes back priced at 82 kg, not the 80 it was saved with. */
    applied.undo();
    expect(snapshot()).toEqual(before);
  });
});

/* ------------------------------------------------------------------ */
/* A day's answer — the Tasks chat                                     */
/* ------------------------------------------------------------------ */

describe('a day answered on a Tasks card', () => {
  it('draws each day as its own row, and refuses a day not yet asked', async () => {
    const { card } = await ask(
      'Tasks',
      reply([
        { target: 'task', id: 't_stretch', field: 'tick', day: YESTERDAY },
        { target: 'task', id: 't_stretch', field: 'done' },
        { target: 'task', id: 't_floss', field: 'skip', day: TODAY },
        { target: 'task', id: 't_floss', field: 'done', day: TOMORROW },
        { target: 'task', id: 't_gone', field: 'done' },
      ]),
    );
    expect(card?.changes).toEqual([
      { target: 'task', id: 't_stretch', field: 'done', value: null, day: YESTERDAY },
      { target: 'task', id: 't_stretch', field: 'done', value: null, day: TODAY },
      { target: 'task', id: 't_floss', field: 'excused', value: null, day: TODAY },
    ]);
    expect(card?.rows.map((r) => [r.subject, r.to])).toEqual([
      ['Stretch', 'Done'],
      ['Stretch', 'Done'],
      ['Floss', 'Excused'],
    ]);
  });

  it('done, excused and clear write the day; a counted task is filled to its target; Undo restores every entry exactly, notes included', async () => {
    const tasks = useTasks.getState();
    tasks.setNote('t_stretch', YESTERDAY, 'sore back');
    tasks.setCount('t_read', TODAY, 5);
    tasks.setNote('t_read', TODAY, 'chapter 3');
    tasks.setMark('t_floss', TODAY, 'done');
    tasks.setNote('t_floss', TODAY, 'mint');
    const before = snapshot();

    const { id } = await ask(
      'Tasks',
      reply([
        { target: 'task', id: 't_stretch', field: 'done', day: YESTERDAY },
        { target: 'task', id: 't_read', field: 'done' },
        { target: 'task', id: 't_floss', field: 'clear' },
        { target: 'task', id: 't_floss', field: 'excused', day: YESTERDAY },
      ]),
    );
    const applied = applyChanges('Tasks', id)!;
    expect(applied.message).toBe('4 changes applied');

    const log = useTasks.getState().log;
    expect(log.t_stretch[YESTERDAY]).toEqual({ mark: 'done', note: 'sore back' });
    expect(log.t_read[TODAY]).toEqual({ mark: 'done', note: 'chapter 3', count: 20 });
    // Cleared — but the note is the user's, not the answer, so it stays.
    expect(log.t_floss[TODAY]).toEqual({ mark: null, note: 'mint' });
    expect(log.t_floss[YESTERDAY]).toEqual({ mark: 'missed', note: '' });

    applied.undo();
    expect(snapshot()).toEqual(before);
    expect(cardOf('Tasks', id)?.status).toBe('pending');
  });

  it('a counted day cleared drops its parts; Undo gives them back', async () => {
    useTasks.getState().setCount('t_read', YESTERDAY, 12);
    const before = snapshot();
    const { id } = await ask(
      'Tasks',
      reply([{ target: 'task', id: 't_read', field: 'untick', day: YESTERDAY }]),
    );
    const applied = applyChanges('Tasks', id)!;
    expect(useTasks.getState().log.t_read?.[YESTERDAY]).toBeUndefined();
    applied.undo();
    expect(snapshot()).toEqual(before);
    expect(useTasks.getState().log.t_read[YESTERDAY]).toEqual({ mark: null, note: '', count: 12 });
  });

  it('a day that had no entry leaves no empty entry behind after Undo', async () => {
    const { id } = await ask(
      'Tasks',
      reply([{ target: 'task', id: 't_stretch', field: 'done', day: YESTERDAY }]),
    );
    const applied = applyChanges('Tasks', id)!;
    applied.undo();
    expect(useTasks.getState().log).toEqual({});
  });

  it('a task archived since the answer is skipped; with nothing left, nothing is applied', async () => {
    const { id } = await ask(
      'Tasks',
      reply([
        { target: 'task', id: 't_stretch', field: 'done' },
        { target: 'task', id: 't_floss', field: 'done' },
      ]),
    );
    useTasks.getState().archiveTask('t_floss');
    const applied = applyChanges('Tasks', id)!;
    expect(applied.message).toBe('1 changes applied');
    expect(useTasks.getState().log.t_floss).toBeUndefined();

    const lone = await ask('Tasks', reply([{ target: 'task', id: 't_read', field: 'done' }]));
    useTasks.getState().archiveTask('t_read');
    const log = useTasks.getState().log;
    expect(applyChanges('Tasks', lone.id)).toBeNull();
    expect(useTasks.getState().log).toEqual(log);
    expect(cardOf('Tasks', lone.id)?.status).toBe('pending');
  });

  it('mixed with a rename and a new task: one Undo restores the list and the log', async () => {
    useTasks.getState().setMark('t_floss', YESTERDAY, 'done');
    const before = snapshot();
    const { id } = await ask(
      'Tasks',
      reply([
        { target: 'task', id: 't_stretch', field: 'rename', text: 'Stretch 10 min' },
        { target: 'task', id: 't_stretch', field: 'done' },
        { target: 'task', field: 'add', text: 'Meditate' },
        { target: 'task', id: 't_floss', field: 'clear', day: YESTERDAY },
        { target: 'bodyweight', field: 'log', number: 81 },
      ]),
    );
    const applied = applyChanges('Tasks', id)!;
    expect(applied.message).toBe('4 changes applied');
    const state = useTasks.getState();
    expect(state.tasks.find((x) => x.id === 't_stretch')?.name).toBe('Stretch 10 min');
    expect(state.tasks.some((x) => x.name === 'Meditate')).toBe(true);
    expect(state.log.t_stretch?.[TODAY]?.mark).toBe('done');
    expect(state.log.t_floss).toBeUndefined();
    expect(useSettings.getState().bodyweightKg).toBe(80);

    applied.undo();
    expect(snapshot()).toEqual(before);
  });
});
