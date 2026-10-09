import { describe, expect, it } from 'vitest';

import {
  CONTEXT_CAP,
  buildExpensesContext,
  buildTasksContext,
  buildWorkoutContext,
  lastTopWeights,
  nextStartWeights,
  withBriefs,
  workoutBrief,
  workoutFacts,
} from './aiContext';
import { recomputeWorkout, type CompletedWorkout } from '../completedWorkout';
import { createDebrief } from '../debrief';
import { seedExercises, seedExercisesById, seedRoutines } from '../../data/seed';
import { fixtureHistory } from '../../../test/fixtures/history';
import type { Amount, MoneyAccount, MoneyCategory } from '../money';
import type { Task, TaskLog } from '../tasks';
import type { SetHistory } from '../../types/models';

/**
 * The three context builders. Each is held to the same four promises: it stays
 * under the cap, it reads the log the way every other screen reads it (warm-ups
 * count for nothing, an excused day is not a miss, a whole-month amount has no
 * day), it says how much it read, and it never ships the whole database.
 */

/** The fixture's set rows, as the finished workouts the history store holds. */
function fixtureWorkouts(extra: SetHistory[] = []): CompletedWorkout[] {
  const bySession = new Map<string, SetHistory[]>();
  for (const row of [...fixtureHistory, ...extra]) {
    const bucket = bySession.get(row.sessionId);
    if (bucket) bucket.push(row);
    else bySession.set(row.sessionId, [row]);
  }
  return [...bySession.entries()]
    .map(([id, sets]) => {
      const ids = [...new Set(sets.map((s) => s.exerciseId))];
      const draft: CompletedWorkout = {
        id,
        title: 'Pull',
        routineId: 'r_pull',
        startedAt: sets[0].performedAt,
        endedAt: sets[0].performedAt,
        durationMinutes: 60,
        setCount: 0,
        totalVolumeKg: 0,
        volumeIsPartial: false,
        exercises: ids.map((exerciseId) => ({
          exerciseId,
          name: seedExercisesById[exerciseId].name,
          countUnit: seedExercisesById[exerciseId].countUnit,
          loadMode: seedExercisesById[exerciseId].loadMode,
          setCount: 0,
          summary: '',
          totalCount: 0,
          topWeightKg: null,
        })),
        sets,
      };
      return recomputeWorkout(draft, null, 'en');
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

const NOW = new Date('2026-08-10T12:00:00Z');

describe('the workout context', () => {
  const workouts = fixtureWorkouts();
  const built = buildWorkoutContext({
    exercises: seedExercises,
    routines: seedRoutines,
    workouts,
    unitSystem: 'metric',
    lang: 'ru',
    now: NOW,
  });
  const json = JSON.parse(built.json);

  it('stays under the cap', () => {
    expect(built.json.length).toBeLessThanOrEqual(CONTEXT_CAP);
  });

  it('carries what the user said after a workout, and only for workouts it sent', () => {
    const latest = workouts[0];
    const debrief = {
      ...createDebrief(latest),
      status: 'answered' as const,
      answers: {
        load: { choices: ['heavy'] },
        pain: { choices: ['lower_back'], note: 'on the deadlift' },
        plan: { choices: ['easier'] },
      },
    };
    const orphan = { ...createDebrief(latest), workoutId: 'gone', answers: debrief.answers };
    const withDebriefs = buildWorkoutContext({
      exercises: seedExercises,
      routines: seedRoutines,
      workouts,
      unitSystem: 'metric',
      lang: 'en',
      now: NOW,
      debriefs: [debrief, orphan],
    });
    const rows = JSON.parse(withDebriefs.json).debriefs;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      routine: 'Pull',
      routineId: 'r_pull',
      answers: {
        'How did the weights feel?': 'A bit heavy',
        'Any pain or discomfort?': 'Lower back — on the deadlift',
        'What should happen to this routine next time?': 'Make it easier',
      },
    });
    expect(withDebriefs.debriefCount).toBe(1);
    expect(withDebriefs.json.length).toBeLessThanOrEqual(CONTEXT_CAP);
  });

  it('carries all-time records, the weekly line, the bodyweight log and a richer library', () => {
    const wide = JSON.parse(
      buildWorkoutContext({
        exercises: seedExercises,
        routines: seedRoutines,
        workouts,
        unitSystem: 'metric',
        lang: 'en',
        now: NOW,
        bodyweightLog: [
          { at: '2026-07-01T08:00:00Z', kg: 80 },
          { at: '2026-08-01T08:00:00Z', kg: 79.5 },
        ],
      }).json,
    );
    expect(wide.allTime.workouts).toBe(workouts.length);
    expect(wide.sessionsPerWeek12w).toHaveLength(12);
    expect(wide.bodyweightKgLog).toEqual(['2026-07-01:80', '2026-08-01:79.5']);
    expect(wide.recordsAllTime.length).toBeGreaterThan(0);
    expect(wide.recordsAllTime[0]).toHaveProperty('sessions');
    expect(wide.recordsAllTime[0]).toHaveProperty('last');
    expect(wide.library.some((row: string) => row.split(' | ').length >= 3)).toBe(true);
  });

  it('carries the training loop in order, with what is next', () => {
    const [a, b] = seedRoutines;
    const looped = JSON.parse(
      buildWorkoutContext({
        exercises: seedExercises,
        routines: seedRoutines,
        workouts,
        unitSystem: 'metric',
        lang: 'en',
        now: NOW,
        sequence: { isActive: true, routineIds: [a.id, b.id, 'r_deleted', a.id], cursor: 1 },
      }).json,
    );
    expect(looped.sequence).toMatchObject({
      on: true,
      order: [a.name, b.name, a.name],
      next: b.name,
    });
    expect(json.sequence).toMatchObject({ on: false });
  });

  it('sends no debriefs key when there are none', () => {
    expect(json.debriefs).toBeUndefined();
  });

  it('says what day it is, which language to answer in, and the units', () => {
    expect(json.today).toBe('2026-08-10');
    expect(json.language).toBe('Russian');
    expect(json.units).toBe('kg');
  });

  it('names every routine with its real ids, so an edit can target one', () => {
    expect(json.routines.map((r: { id: string }) => r.id)).toEqual(seedRoutines.map((r) => r.id));
    const pull = json.routines.find((r: { id: string }) => r.id === 'r_pull');
    expect(pull.exercises[0]).toMatchObject({ exerciseId: 'ex_pullup_90', sets: 4, reps: '4-6' });
  });

  it('lists sessions newest first, in the shorthand, and counts them', () => {
    expect(json.sessions[0].date).toBe('2026-08-08');
    expect(json.sessions[0].ex.some((line: string) => line.includes('80 kg'))).toBe(true);
    expect(built.workoutCount).toBe(json.sessions.length);
    expect(built.workoutCount).toBe(workouts.length);
  });

  it('leaves warm-ups out of everything', () => {
    // A 200 kg warm-up single on the pulldown: nowhere in the context.
    const warmup: SetHistory = {
      ...fixtureHistory.find((s) => s.sessionId === 's87' && s.exerciseId === 'ex_pulldown_wide')!,
      id: 'warm',
      setIndex: 99,
      weightKg: 200,
      count: 1,
      isWarmup: true,
    };
    const withWarmup = buildWorkoutContext({
      exercises: seedExercises,
      routines: seedRoutines,
      workouts: fixtureWorkouts([warmup]),
      unitSystem: 'metric',
      lang: 'en',
      now: NOW,
    });
    expect(withWarmup.json).not.toContain('200');
  });

  it('carries the app’s own verdicts as signals', () => {
    expect(Array.isArray(json.signals)).toBe(true);
    expect(json.setsPerCluster4w.pull).toBeGreaterThan(0);
  });

  it('sends every session, not only the recent window, when it fits', () => {
    const old = { ...workouts[0], id: 'ancient', startedAt: '2025-01-15T09:00:00.000Z' };
    const all = buildWorkoutContext({
      exercises: seedExercises,
      routines: seedRoutines,
      workouts: [...workouts, old],
      unitSystem: 'metric',
      lang: 'en',
      now: NOW,
    });
    const sessions: { date: string }[] = JSON.parse(all.json).sessions;
    expect(sessions.map((s) => s.date)).toContain('2025-01-15');
    expect(all.workoutCount).toBe(workouts.length + 1);
  });

  it('sheds old sessions rather than growing past the cap', () => {
    // A hundred and fifty copies of the log's heaviest session, a day apart.
    const heavy = workouts[0];
    const many = Array.from({ length: 150 }, (_, i) => ({
      ...heavy,
      id: `copy_${i}`,
      startedAt: new Date(NOW.getTime() - i * 86_400_000).toISOString(),
    }));
    const big = buildWorkoutContext({
      exercises: seedExercises,
      routines: seedRoutines,
      workouts: many,
      unitSystem: 'metric',
      lang: 'en',
      now: NOW,
      cap: 24_000,
    });
    expect(big.json.length).toBeLessThanOrEqual(24_000);
    expect(big.workoutCount).toBeLessThan(150);
    expect(big.workoutCount).toBeGreaterThan(0);
    // Newest kept, oldest shed.
    expect(JSON.parse(big.json).sessions[0].date).toBe('2026-08-10');
  });

  it('names the prompts from the user’s own log', () => {
    const facts = workoutFacts({
      exercises: seedExercises,
      routines: seedRoutines,
      workouts,
      now: NOW,
    });
    // Weighted sit-ups: five sessions in the last four weeks against the
    // pulldown's three, and nothing in the fixture is on a barbell.
    expect(facts.topLift).toBe(seedExercisesById.ex_situp_weighted.name);
    // A barbell lift wins over a busier machine one.
    const squat: CompletedWorkout = {
      ...workouts[0],
      id: 'squat',
      exercises: [
        {
          exerciseId: 'ex_squat',
          name: seedExercisesById.ex_squat.name,
          countUnit: 'reps',
          loadMode: 'external',
          setCount: 3,
          summary: '80 kg · 5 5 5',
          totalCount: 15,
          topWeightKg: 80,
        },
      ],
    };
    expect(
      workoutFacts({
        exercises: seedExercises,
        routines: seedRoutines,
        workouts: [squat, ...workouts],
        now: NOW,
      }).topLift,
    ).toBe(seedExercisesById.ex_squat.name);
    expect(facts.lastRoutine?.id).toBe('r_pull');
    expect(lastTopWeights(workouts).ex_pulldown_wide).toBe(80);
    // A starting weight planned after that session is what the next one opens at.
    const planned = seedExercises.map((e) =>
      e.id === 'ex_pulldown_wide'
        ? { ...e, defaultWeightKg: 70, startWeightSetAt: NOW.toISOString() }
        : e,
    );
    expect(nextStartWeights(planned, workouts).ex_pulldown_wide).toBe(70);
    expect(nextStartWeights(seedExercises, workouts).ex_pulldown_wide).toBe(80);
  });
});

/* ------------------------------------------------------------------ */

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  name: id,
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-09-01',
  reminder: null,
  archivedAt: null,
  order: 0,
  ...over,
});

describe('effort per set (T-11)', () => {
  const build = (workouts: CompletedWorkout[]) =>
    JSON.parse(
      buildWorkoutContext({
        exercises: seedExercises,
        routines: seedRoutines,
        workouts,
        unitSystem: 'metric',
        lang: 'en',
        now: NOW,
      }).json,
    );

  it('includes the reps in reserve of a graded session, in set order', () => {
    const workouts = fixtureWorkouts();
    const latest = workouts[0];
    const exerciseId = latest.exercises[0].exerciseId;
    const name = latest.exercises[0].name;
    const working = latest.sets
      .filter((set) => set.exerciseId === exerciseId && !set.isWarmup)
      .sort((a, b) => a.setIndex - b.setIndex);
    const grades = new Map(working.map((set, i) => [set.id, i === 1 ? undefined : i]));
    const graded = {
      ...latest,
      sets: latest.sets.map((set) => {
        const rir = grades.get(set.id);
        return rir == null ? set : { ...set, rir };
      }),
    };
    const json = build([graded, ...workouts.slice(1)]);
    const expected = working.map((_, i) => (i === 1 ? '-' : String(i))).join(' ');
    expect(json.sessions[0].rir).toEqual([`${name}: ${expected}`]);
    expect(json.effortNote).toContain('reps in reserve');
  });

  it('carries set types in the shorthand, with a legend only when one is used', () => {
    const workouts = fixtureWorkouts();
    const latest = workouts[0];
    const exerciseId = latest.exercises[0].exerciseId;
    const last = latest.sets
      .filter((set) => set.exerciseId === exerciseId && !set.isWarmup)
      .sort((a, b) => a.setIndex - b.setIndex)
      .at(-1);
    if (!last) throw new Error('fixture has no working set');
    const typed = recomputeWorkout(
      {
        ...latest,
        sets: latest.sets.map((set) => (set.id === last.id ? { ...set, setType: 'failure' } : set)),
      },
      null,
      'en',
    );
    const json = build([typed, ...workouts.slice(1)]);
    expect(json.setTypeNote).toContain('failure');
    expect(json.sessions[0].ex[0]).toMatch(/\dF/);
    expect(build(workouts).setTypeNote).toBeUndefined();
  });

  it('says nothing about effort when no set was graded', () => {
    const json = build(fixtureWorkouts());
    expect(json.effortNote).toBeUndefined();
    expect(json.sessions.some((row: Record<string, unknown>) => 'rir' in row)).toBe(false);
  });
});

describe('the tasks context', () => {
  const log: TaskLog = {
    read: {
      '2026-09-24': { mark: 'done', note: '' },
      '2026-09-25': { mark: 'missed', note: '' },
      '2026-09-26': { mark: 'done', note: '' },
    },
  };
  const built = buildTasksContext({
    tasks: [task('read', { startedOn: '2026-09-24' })],
    log,
    today: '2026-09-27',
    lang: 'en',
  });
  const json = JSON.parse(built.json);

  it('carries the notes written on days, newest first, with the mark', () => {
    const noted = JSON.parse(
      buildTasksContext({
        tasks: [task('read', { startedOn: '2026-09-24' })],
        log: {
          read: {
            '2026-09-24': { mark: 'done', note: 'chapter 3' },
            '2026-09-25': { mark: 'missed', note: '  sick   today ' },
            '2026-01-01': { mark: 'done', note: 'from winter' },
          },
        },
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    // The whole history by default — the January note is not "too old" any more.
    expect(noted.notes).toEqual([
      '2026-09-25 read (excused): sick today',
      '2026-09-24 read (done): chapter 3',
      '2026-01-01 read (done): from winter',
    ]);
  });

  it('counts an excused day as excused, never as a miss', () => {
    expect(json.tasks[0]).toMatchObject({ asked: 4, done: 2, excused: 1, missed: 0 });
  });

  it('does not count today as missed while it is still being lived', () => {
    expect(json.tasks[0].missed).toBe(0);
  });

  it('keeps the streak across the excused day', () => {
    expect(json.tasks[0].streak).toBe(2);
    expect(json.tasks[0].bestStreak).toBe(2);
  });

  it('leaves days that asked for nothing out of the daily line', () => {
    // Four days asked; the 25th was excused out of its denominator.
    expect(json.dailyDonePct).toEqual(['2026-09-24:100', '2026-09-26:100', '2026-09-27:0']);
    expect(built.dayCount).toBe(3);
  });

  it('names the days themselves, so a date can be answered', () => {
    expect(json.tasks[0].doneOn).toEqual(['2026-09-24', '2026-09-26']);
    expect(json.tasks[0].excusedOn).toEqual(['2026-09-25']);
  });

  it('keeps an archived task’s past, marked as archived', () => {
    const archived = JSON.parse(
      buildTasksContext({
        tasks: [task('read', { startedOn: '2026-09-24', archivedAt: '2026-09-27T12:00:00.000Z' })],
        log,
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    expect(archived.tasks[0]).toMatchObject({ id: 'read', done: 2, archivedOn: '2026-09-27' });
  });

  it('counts an unanswered past day as missed', () => {
    const missed = buildTasksContext({
      tasks: [task('read', { startedOn: '2026-09-20' })],
      log,
      today: '2026-09-27',
      lang: 'en',
    });
    expect(JSON.parse(missed.json).tasks[0].missed).toBe(4);
  });

  it('carries a target, and the days short of it, with a note only when one exists (T1)', () => {
    const counted = JSON.parse(
      buildTasksContext({
        tasks: [task('water', { startedOn: '2026-09-25', target: { count: 8, unit: 'glasses' } })],
        log: {
          water: {
            '2026-09-25': { mark: 'done', note: '', count: 8 },
            '2026-09-26': { mark: null, note: '', count: 3 },
          },
        },
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    expect(counted.tasks[0]).toMatchObject({
      target: '8 glasses a day',
      done: 1,
      missed: 1,
      partialOn: ['2026-09-26:3'],
    });
    expect(counted.targetNote).toContain('partialOn');
    expect(json.targetNote).toBeUndefined();
    expect(json.tasks[0].target).toBeUndefined();
  });

  it('stays under the cap with a year of daily tasks', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task(`t${i}`, { name: `A task with a long name number ${i}`, startedOn: '2025-01-01' }),
    );
    expect(
      buildTasksContext({ tasks, log: {}, today: '2026-09-27', lang: 'en', days: 365 }).json.length,
    ).toBeLessThanOrEqual(CONTEXT_CAP);
  });
});

/* ------------------------------------------------------------------ */

describe('the expenses context', () => {
  const categories: MoneyCategory[] = [
    { id: 'food', name: 'Food', glyph: '🍞', direction: 'expense', order: 0, archivedAt: null },
    { id: 'home', name: 'Home', glyph: '🏠', direction: 'expense', order: 1, archivedAt: null },
  ];
  const accounts: MoneyAccount[] = [
    { id: 'cash', name: 'Cash', glyph: '💵', order: 0, opening: 1000, archivedAt: null },
  ];
  const amount = (id: string, over: Partial<Amount>): Amount => ({
    id,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense',
    value: 100,
    when: { kind: 'day', date: '2026-09-03' },
    note: '',
    createdAt: '2026-09-03T10:00:00Z',
    ...over,
  });
  const amounts = [
    amount('a', {}),
    amount('b', { value: 250, when: { kind: 'day', date: '2026-08-15' } }),
    amount('rent', {
      categoryId: 'home',
      value: 5000,
      when: { kind: 'month', year: 2026, month: 8 },
    }),
    amount('pay', { direction: 'income', value: 9000, when: { kind: 'day', date: '2026-09-01' } }),
  ];
  const built = buildExpensesContext({
    amounts,
    categories,
    accounts,
    currency: '֏',
    today: '2026-09-27',
    lang: 'en',
  });
  const json = JSON.parse(built.json);

  it('keeps the currency label exactly as typed', () => {
    expect(json.currency).toBe('֏');
  });

  it('says nothing about units for a whole-unit log — the context is what it was', () => {
    expect(json.valueUnit).toBeUndefined();
    const zero = JSON.parse(
      buildExpensesContext({
        amounts,
        categories,
        accounts,
        currency: 'AMD',
        scale: 0,
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    expect(zero.valueUnit).toBeUndefined();
  });

  it('tells the model how to read a log kept in cents, without changing a figure (U25)', () => {
    const cents = JSON.parse(
      buildExpensesContext({
        amounts,
        categories,
        accounts,
        currency: 'USD',
        scale: 2,
        today: '2026-09-27',
        lang: 'en',
      }).json,
    );
    expect(cents.valueUnit).toContain('1/100 USD');
    expect(cents.valueUnit).toContain('1250 means 12.50 USD');
    const september = cents.months.find((m: { month: string }) => m.month === '2026-09');
    expect(september.spent).toBe(5100);
  });

  it('puts a whole-month amount in its month, named, and on no day', () => {
    const september = json.months.find((m: { month: string }) => m.month === '2026-09');
    expect(september.spent).toBe(5100);
    expect(september.income).toBe(9000);
    expect(september.wholeMonthAmounts).toEqual(['expense Home 5000']);
    expect(september.byCategory).toEqual({ Food: 100, Home: 5000 });
    // In the ledger the rent is keyed by its month, never by a day.
    expect(json.amounts).toContain('2026-09 (whole month) expense Home 5000');
  });

  it('covers six months, oldest first, and counts the ones with anything in them', () => {
    expect(json.months.map((m: { month: string }) => m.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(built.monthCount).toBe(2);
  });

  it('carries every note in the window, newest first, as one line each', () => {
    const noted = buildExpensesContext({
      amounts: [
        ...amounts,
        amount('n1', { note: 'dinner with Anna', when: { kind: 'day', date: '2026-09-20' } }),
        amount('n2', {
          note: '  weekly   groceries ',
          value: 3200,
          when: { kind: 'day', date: '2026-08-02' },
        }),
        amount('n3', {
          categoryId: 'home',
          note: 'rent, flat on Abovyan',
          value: 5000,
          when: { kind: 'month', year: 2026, month: 7 },
        }),
        // Nine months back: in, because the default window is the whole history.
        amount('old', { note: 'ancient', when: { kind: 'day', date: '2025-12-01' } }),
      ],
      categories,
      accounts,
      currency: '֏',
      today: '2026-09-27',
      lang: 'en',
    });
    const parsed = JSON.parse(noted.json);
    const withNotes = (parsed.amounts as string[]).filter((line) => line.includes(': '));
    expect(withNotes).toEqual([
      '2026-09-20 expense Food 100: dinner with Anna',
      '2026-08-02 expense Food 3200: weekly groceries',
      '2026-08 (whole month) expense Home 5000: rent, flat on Abovyan',
      '2025-12-01 expense Food 100: ancient',
    ]);
    expect(noted.noteCount).toBe(4);
    expect(noted.notes).toEqual(withNotes);
    // Amounts with no note are listed too — every amount, not only the noted ones.
    expect(parsed.amounts.length).toBe(noted.amountCount);
    expect(noted.amountCount).toBeGreaterThan(withNotes.length);
  });

  it('sheds the oldest notes first to stay under the cap', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      amount(`m${i}`, {
        note: `note number ${i} with a little bit of extra text to take up room`,
        when: { kind: 'day', date: `2026-09-${String((i % 27) + 1).padStart(2, '0')}` },
        createdAt: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
      }),
    );
    const capped = buildExpensesContext({
      amounts: many,
      categories,
      accounts,
      currency: '֏',
      today: '2026-09-27',
      lang: 'en',
      cap: 24_000,
    });
    expect(capped.json.length).toBeLessThanOrEqual(24_000);
    const notes: string[] = JSON.parse(capped.json).amounts;
    expect(notes.length).toBe(capped.noteCount);
    expect(notes.length).toBeGreaterThan(20);
    expect(notes[0].startsWith('2026-09-27')).toBe(true);
  });

  it('counts no notes when nobody wrote one', () => {
    expect(built.notes).toEqual([]);
    expect(built.noteCount).toBe(0);
  });

  it('ranks the categories and states each balance with its opening', () => {
    expect(json.topCategories[0]).toEqual({ name: 'Home', total: 5000 });
    expect(json.balances).toEqual([
      { account: 'Cash', balance: 1000 - 5350 + 9000, opening: 1000 },
    ]);
  });
});

describe('the other sections, briefly', () => {
  it('adds them under otherSections when they fit, and never cuts the section asked about', () => {
    const base = JSON.stringify({ a: 1 });
    const out = JSON.parse(withBriefs(base, { tasks: { last30Days: ['x'], recentNotes: ['n'] } }));
    expect(out).toEqual({
      a: 1,
      otherSections: { tasks: { last30Days: ['x'], recentNotes: ['n'] } },
    });

    const huge = { tasks: { recentNotes: ['y'.repeat(CONTEXT_CAP)] } };
    expect(JSON.parse(withBriefs(base, huge))).toEqual({ a: 1, otherSections: { tasks: {} } });
  });

  it('describes training in a few lines', () => {
    const brief = workoutBrief({ workouts: fixtureWorkouts(), routines: seedRoutines, now: NOW });
    expect(brief).toHaveProperty('workoutsLast30Days');
    expect((brief.lastSessions as string[]).length).toBeLessThanOrEqual(5);
  });
});
