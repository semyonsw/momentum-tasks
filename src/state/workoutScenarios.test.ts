/**
 * WORKOUT SCENARIOS — a QA pass over the logging path, one realistic session at a
 * time, through the real stores.
 *
 * `smoke.test.ts` proves the happy path holds together. This file is the
 * session that does NOT go to plan: the extra set decided at the rack, the
 * logged set removed by a mis-tap and put back, warm-ups, a superset, a ladder
 * whose top set beat the plan, a MAX set, a plank timed by the clock, a nudge
 * taken and a nudge ignored, an exercise edited and reordered mid-workout, a
 * session that runs past midnight, and the workout corrected in History a day
 * later. Each scenario asserts what the user would expect to SEE afterwards — the
 * row in History, the prefills of the next session, the routine, the loop — not
 * the internals of the action that got there.
 *
 * The library is built per test from small hand-written exercises rather than
 * the seed, so every number in an assertion is one the test chose. History for
 * the NEXT session is read back out of `useWorkoutHistory`, exactly as
 * `AppShell` builds `historyById`, so "the second session is prefilled from the
 * first" is tested through the store that saved it.
 *
 * Same rule as the smoke test: no renderer. A tap is the store action its
 * `onPress` calls, and the post-save consequences `AppShell.onFinish` runs (the
 * loop, the ladders, the plan) are replayed here with the same pure functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { selectProgress, useActiveWorkout } from './activeWorkoutStore';
import { useLibrary } from './libraryStore';
import { useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { historyByExerciseId, recomputeWorkout } from '../lib/completedWorkout';
import {
  buildDraftEntry,
  draftToSetHistory,
  sessionVolume,
  workingSetLabels,
  type DraftSession,
} from '../lib/draft';
import { DEFAULT_OVERLOAD_POLICY } from '../lib/progressiveOverload';
import { exerciseBests, recordsBeatenBy, recordsBrokenIn } from '../lib/records';
import { ladderForMax, ladderOutcomes, ladderTargets } from '../lib/repLadder';
import { applyPlannedSetDiff, performedSetCounts, plannedSetDiff } from '../lib/routinePlan';
import { effectiveLoadKg, formatWeight, kgToLb, lbToKg, roundToStep } from '../lib/units';
import { warmupSets } from '../lib/warmup';
import {
  clampDurationMinutes,
  formatTimeSpan,
  reindexSets,
  removeExerciseFromWorkout,
} from '../lib/workoutEdit';
import { summarizeSessionSets } from '../lib/history';
import { upNextSet } from '../lib/upNext';
import type { Exercise, ID, Routine, RoutineItem, SetHistory } from '../types/models';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function exercise(id: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    ownerId: 'user',
    name: id,
    muscleGroups: ['chest'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const BENCH = exercise('qa_bench', { name: 'Bench press', defaultWeightKg: 60 });
const ROW = exercise('qa_row', { name: 'Cable row', muscleGroups: ['back'], defaultWeightKg: 50 });
const DIPS = exercise('qa_dips', {
  name: 'Dips',
  loadMode: 'added_bodyweight',
  defaultWeightKg: 10,
});
const ASSISTED = exercise('qa_assisted', {
  name: 'Assisted pull-up',
  muscleGroups: ['back'],
  loadMode: 'assisted',
  defaultWeightKg: 20,
});
const PUSHUPS = exercise('qa_pushups', {
  name: 'Push-ups',
  requiresWeight: false,
  loadMode: 'none',
});
const PULLUPS_MAX = exercise('qa_pullups_max', {
  name: 'Pull-ups to failure',
  muscleGroups: ['back'],
  requiresWeight: false,
  loadMode: 'none',
  countToMax: true,
});
const LADDER = exercise('qa_ladder', {
  name: 'Ladder pull-ups',
  muscleGroups: ['back'],
  requiresWeight: false,
  loadMode: 'none',
  ladder: { max: 10, earned: 0 },
});
const PLANK = exercise('qa_plank', {
  name: 'Plank',
  muscleGroups: ['core'],
  requiresWeight: false,
  loadMode: 'none',
  countUnit: 'seconds',
  timerMode: 'countdown',
  prepareSeconds: 0,
  defaultCount: 60,
});
const HANG = exercise('qa_hang', {
  name: 'Dead hang',
  muscleGroups: ['back'],
  requiresWeight: false,
  loadMode: 'none',
  countUnit: 'seconds',
  timerMode: 'countup',
  prepareSeconds: 0,
});
const NECK = exercise('qa_neck', { name: 'Neck curl', muscleGroups: ['neck'], defaultWeightKg: 5 });

const ALL = [BENCH, ROW, DIPS, ASSISTED, PUSHUPS, PULLUPS_MAX, LADDER, PLANK, HANG, NECK];

function item(
  exerciseId: ID,
  order: number,
  targetSets: number,
  extra: Partial<RoutineItem> = {},
): RoutineItem {
  return {
    id: `item_${exerciseId}_${order}`,
    exerciseId,
    order,
    targetSets,
    targetRepsMin: 8,
    targetRepsMax: 10,
    ...extra,
  };
}

function routine(id: string, items: RoutineItem[]): Routine {
  return {
    id,
    ownerId: 'user',
    name: id,
    items,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Put a routine in the library, as the routine editor's Save does. */
function saveRoutine(r: Routine): Routine {
  useLibrary.setState((s) => ({ routines: [...s.routines.filter((x) => x.id !== r.id), r] }));
  return r;
}

const libraryById = () =>
  Object.fromEntries(useLibrary.getState().exercises.map((e) => [e.id, e])) as Record<ID, Exercise>;

/** What `AppShell` hands `startSession`: the library and the log as they are NOW. */
function open(r: Routine, extraHistory: Record<ID, SetHistory[]> = {}) {
  const settings = useSettings.getState();
  useActiveWorkout.getState().startSession({
    routine: r,
    exercisesById: libraryById(),
    historyByExerciseId: historyByExerciseId(useWorkoutHistory.getState().workouts, extraHistory),
    policy: DEFAULT_OVERLOAD_POLICY,
    unitSystem: settings.unitSystem,
    defaultRestSeconds: settings.restSecondsBetweenSets,
    defaultTransitionRestSeconds: settings.restSecondsBetweenExercises,
  });
  useActiveWorkout.getState().startWorkout();
  return live();
}

function live(): DraftSession {
  const session = useActiveWorkout.getState().session;
  if (!session) throw new Error('no live session');
  return session;
}

const act = () => useActiveWorkout.getState();
const entryOf = (exerciseId: ID, nth = 0) => {
  const found = live().entries.filter((e) => e.exercise.id === exerciseId)[nth];
  if (!found) throw new Error(`no entry for ${exerciseId}`);
  return found;
};

/** ✓ every unlogged set of an exercise, top to bottom. */
function logAll(exerciseId: ID, nth = 0) {
  const entry = entryOf(exerciseId, nth);
  for (const set of entry.sets) {
    if (!entryOf(exerciseId, nth).sets.find((s) => s.localId === set.localId)?.isCompleted) {
      act().completeSet(entry.localId, set.localId);
    }
  }
}

/** Finish → Save, plus the consequences `AppShell.onFinish` runs after the save. */
function finishAndSave(endedAt?: Date, updatePlan = false) {
  const finished = act().finishSession();
  if (!finished) throw new Error('nothing to finish');
  const saved = useWorkoutHistory.getState().saveSession(finished, endedAt);
  if (saved) useLibrary.getState().advanceSequence(saved.routineId);
  for (const outcome of ladderOutcomes(finished.entries)) {
    const current = libraryById()[outcome.exerciseId];
    if (current)
      useLibrary.getState().updateExercise(current.id, { ...current, ladder: outcome.after });
  }
  const r = finished.routineId
    ? useLibrary.getState().routines.find((x) => x.id === finished.routineId)
    : undefined;
  if (updatePlan && r) {
    const changes = plannedSetDiff(r.items, performedSetCounts(finished.entries));
    if (changes.length > 0) {
      useLibrary.getState().updateRoutine(r.id, {
        name: r.name,
        items: applyPlannedSetDiff(r.items, changes),
      });
    }
  }
  return { finished, saved };
}

function historyRow(
  sessionId: string,
  date: string,
  ex: Exercise,
  weightKg: number | null,
  count: number,
  setIndex: number,
): SetHistory {
  return {
    id: `${sessionId}_${ex.id}_${setIndex}`,
    sessionId,
    exerciseId: ex.id,
    performedAt: date,
    setIndex,
    weightKg,
    count,
    countUnit: ex.countUnit,
    loadMode: ex.loadMode,
    isWarmup: false,
    isCompleted: true,
  };
}

beforeEach(() => {
  act().discardSession();
  useWorkoutHistory.getState().clearHistory();
  useSettings.getState().resetToDefaults();
  useSettings.getState().setNumber('restSecondsBetweenSets', 90);
  useSettings.getState().setNumber('restSecondsBetweenExercises', 120);
  // The reset deliberately keeps the bodyweight and the language; a QA run cannot.
  useSettings.setState({ bodyweightKg: undefined, bodyweightLog: [], language: 'en' });
  useLibrary.setState({
    exercises: ALL,
    routines: [],
    sequence: { isActive: false, routineIds: [], cursor: 0 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/* 1. A push day that changes at the rack                              */
/* ------------------------------------------------------------------ */

describe('a push day that does not go to plan', () => {
  const push = () => saveRoutine(routine('qa_push', [item(BENCH.id, 0, 3), item(ROW.id, 1, 3)]));

  it('opens on the exercise’s own starting weight, three rows each', () => {
    const session = open(push());
    expect(session.entries.map((e) => e.exercise.id)).toEqual([BENCH.id, ROW.id]);
    expect(entryOf(BENCH.id).sets.map((s) => s.weightKg)).toEqual([60, 60, 60]);
    // No history: the routine's top of range is the count.
    expect(entryOf(BENCH.id).sets.map((s) => s.count)).toEqual([10, 10, 10]);
    expect(entryOf(BENCH.id).sets.every((s) => s.isPrefilled)).toBe(true);
    expect(act().activeEntryId).toBe(entryOf(BENCH.id).localId);
  });

  it('+ Add set grows the exercise with a copy of the bottom row', () => {
    open(push());
    const bench = entryOf(BENCH.id);
    act().patchSet(bench.localId, bench.sets[2].localId, { weightKg: 62.5, count: 8 });
    act().addSet(bench.localId);

    const after = entryOf(BENCH.id);
    expect(after.sets).toHaveLength(4);
    expect(after.sets[3]).toMatchObject({
      weightKg: 62.5,
      count: 8,
      isCompleted: false,
      isWarmup: false,
    });
    expect(new Set(after.sets.map((s) => s.localId)).size).toBe(4);
    expect(selectProgress(useActiveWorkout.getState())).toEqual({ done: 0, total: 7 });
  });

  it('a logged set removed by mistake comes back on Undo exactly where it was, still logged', () => {
    open(push());
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId);
    act().completeSet(bench.localId, bench.sets[1].localId);

    // The screen snapshots the row and its index, then removes it.
    const snapshot = entryOf(BENCH.id).sets[1];
    act().removeSet(bench.localId, snapshot.localId);
    expect(entryOf(BENCH.id).sets).toHaveLength(2);

    act().insertSet(bench.localId, snapshot, 1);
    act().insertSet(bench.localId, snapshot, 1); // a double tap on Undo
    const back = entryOf(BENCH.id).sets;
    expect(back).toHaveLength(3);
    expect(back[1]).toEqual(snapshot);
    expect(back.filter((s) => s.isCompleted)).toHaveLength(2);
  });

  it('removing every set of an exercise takes the exercise off the workout', () => {
    open(push());
    const row = entryOf(ROW.id);
    for (const set of row.sets) act().removeSet(row.localId, set.localId);
    expect(live().entries.map((e) => e.exercise.id)).toEqual([BENCH.id]);
  });

  it('saves what happened, and the next push day starts from it', () => {
    open(push());
    const bench = entryOf(BENCH.id);
    // Set 1 at 57.5 — a light day. The carry takes the rest of the exercise with it.
    act().patchSet(bench.localId, bench.sets[0].localId, { weightKg: 57.5, count: 9 });
    act().completeSet(bench.localId, bench.sets[0].localId);
    expect(entryOf(BENCH.id).sets.map((s) => s.weightKg)).toEqual([57.5, 57.5, 57.5]);
    act().addSet(bench.localId); // a fourth, decided at the rack
    logAll(BENCH.id);
    logAll(ROW.id);

    const { saved } = finishAndSave();
    expect(saved).not.toBeNull();
    expect(live).toThrow(); // no session left on screen
    expect(saved!.setCount).toBe(7);
    // Only set 1 was corrected to 9; the carry moves weights, never counts.
    expect(saved!.exercises.map((e) => [e.name, e.setCount])).toEqual([
      ['Bench press', 4],
      ['Cable row', 3],
    ]);
    // 57.5 × (9 + 10 + 10 + 10) + 50 × 30
    expect(saved!.totalVolumeKg).toBe(Math.round(57.5 * 39 + 50 * 30));
    expect(saved!.volumeIsPartial).toBe(false);
    expect(saved!.exercises[0].summary).toContain('57.5');
    expect(saved!.exercises[0].totalCount).toBe(39);
    // The library learned the day's working weight.
    expect(libraryById()[BENCH.id].defaultWeightKg).toBe(57.5);

    // Next week: four rows (widened to what was done), at what was done.
    open(push());
    expect(entryOf(BENCH.id).sets.map((s) => [s.weightKg, s.count])).toEqual([
      [57.5, 9],
      [57.5, 10],
      [57.5, 10],
      [57.5, 10],
    ]);
    expect(entryOf(BENCH.id).lastSessionSummary).toContain('57.5');
  });

  it('finishing with sets unticked saves only the ticked ones, and nothing of a skipped exercise', () => {
    open(push());
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId);
    const { saved } = finishAndSave(undefined, true);

    expect(saved!.setCount).toBe(1);
    expect(saved!.sets).toHaveLength(1);
    expect(saved!.exercises.map((e) => e.exerciseId)).toEqual([BENCH.id]);
    // "Update the plan" shrinks bench to what was done and leaves the row alone.
    const items = useLibrary.getState().routines.find((r) => r.id === 'qa_push')!.items;
    expect(items.find((i) => i.exerciseId === BENCH.id)?.targetSets).toBe(1);
    expect(items.find((i) => i.exerciseId === ROW.id)?.targetSets).toBe(3);
  });

  it('a discarded session leaves no workout, and does not move the loop', () => {
    const r = push();
    useLibrary.getState().addSequenceStep(r.id);
    useLibrary.getState().setSequenceActive(true);
    open(r);
    logAll(BENCH.id);
    act().discardSession();

    expect(useWorkoutHistory.getState().workouts).toHaveLength(0);
    expect(useLibrary.getState().sequence.cursor).toBe(0);
    expect(useActiveWorkout.getState().session).toBeNull();
    expect(useActiveWorkout.getState().rest.endsAt).toBeNull();
  });

  it('finishing twice is one workout', () => {
    open(push());
    logAll(BENCH.id);
    const finished = act().finishSession()!;
    useWorkoutHistory.getState().saveSession(finished);
    useWorkoutHistory.getState().saveSession(finished);
    expect(useWorkoutHistory.getState().workouts).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Warm-ups                                                         */
/* ------------------------------------------------------------------ */

describe('warming up before the working sets', () => {
  const r = () => saveRoutine(routine('qa_bench_day', [item(BENCH.id, 0, 3)]));

  function addRamp() {
    const bench = entryOf(BENCH.id);
    const ramp = warmupSets({ workingWeightKg: 100, exercise: BENCH });
    act().addWarmupSets(bench.localId, ramp);
    return ramp;
  }

  it('puts the ramp on top, numbered around, and only once', () => {
    open(r());
    const bench = entryOf(BENCH.id);
    act().patchSet(bench.localId, bench.sets[0].localId, { weightKg: 100 });
    const ramp = addRamp();
    expect(ramp.map((w) => w.weightKg)).toEqual([40, 60, 80]);
    addRamp(); // the button pressed twice

    const sets = entryOf(BENCH.id).sets;
    expect(sets).toHaveLength(6);
    expect(workingSetLabels(sets)).toEqual([null, null, null, 1, 2, 3]);
  });

  it('ticking a warm-up neither carries its weight down nor teaches the library', () => {
    open(r());
    addRamp();
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId); // 40 × 5
    expect(
      entryOf(BENCH.id)
        .sets.slice(3)
        .map((s) => s.weightKg),
    ).toEqual([60, 60, 60]);
    expect(libraryById()[BENCH.id].defaultWeightKg).toBe(60);
    // Mid-exercise: a between-sets rest, not the walk to the next machine.
    expect(act().rest.source).toBe('set');
  });

  it('is refused once a working set is logged', () => {
    open(r());
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId);
    addRamp();
    expect(entryOf(BENCH.id).sets).toHaveLength(3);
  });

  it('the saved workout counts the working sets only — volume, set count, and the next prefill', () => {
    open(r());
    addRamp();
    logAll(BENCH.id);
    const { saved } = finishAndSave();

    expect(saved!.sets).toHaveLength(6); // every row is history...
    expect(saved!.setCount).toBe(3); // ...and three of them count
    expect(saved!.totalVolumeKg).toBe(60 * 30);
    expect(saved!.exercises[0].totalCount).toBe(30);

    open(r());
    // The light rungs are not last session's working weight...
    const next = entryOf(BENCH.id).sets;
    expect(next.filter((s) => !s.isWarmup).map((s) => s.weightKg)).toEqual([60, 60, 60]);
    // ...they come back as what they were: warm-ups, ahead of the work, ghosted.
    expect(next.filter((s) => s.isWarmup).map((s) => s.weightKg)).toEqual([40, 60, 80]);
    expect(next.slice(0, 3).every((s) => s.isWarmup && s.isPrefilled && !s.isCompleted)).toBe(true);
  });

  it('ticking a returning warm-up at its own weight leaves the working rows alone', () => {
    open(r());
    addRamp();
    logAll(BENCH.id);
    finishAndSave();

    open(r());
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId);
    expect(
      entryOf(BENCH.id)
        .sets.filter((s) => !s.isWarmup)
        .map((s) => s.weightKg),
    ).toEqual([60, 60, 60]);
    expect(act().warmupOffer).toBeNull();
  });

  it('“Update the plan” does not count warm-ups as sets', () => {
    // REGRESSION: `performedSetCounts` counted every ✓, warm-ups included, so a
    // 3-set bench day with its ramp offered "Bench press did 6 sets, not 3" and,
    // accepted, rewrote the routine to six working sets.
    open(r());
    addRamp();
    logAll(BENCH.id);
    expect(plannedSetDiff(r().items, performedSetCounts(live().entries))).toEqual([]);

    finishAndSave(undefined, true);
    expect(
      useLibrary.getState().routines.find((x) => x.id === 'qa_bench_day')!.items[0].targetSets,
    ).toBe(3);
  });

  it('…and an exercise where only the warm-ups were ticked is no change to the plan', () => {
    open(r());
    addRamp();
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId);
    expect(plannedSetDiff(r().items, performedSetCounts(live().entries))).toEqual([]);
    // ...and no workout either: a warm-up alone is not training.
    expect(useWorkoutHistory.getState().saveSession(act().finishSession()!)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 3. A superset                                                       */
/* ------------------------------------------------------------------ */

describe('a superset of bench and rows', () => {
  const r = () =>
    saveRoutine(
      routine('qa_superset', [
        item(BENCH.id, 0, 3, { supersetGroup: 'A' }),
        item(ROW.id, 1, 2, { supersetGroup: 'A' }),
        item(PUSHUPS.id, 2, 2),
      ]),
    );

  it('alternates with no rest inside a round, rests after it, and rests at once on the unequal tail', () => {
    open(r());
    const bench = entryOf(BENCH.id);
    const row = entryOf(ROW.id);

    act().completeSet(bench.localId, bench.sets[0].localId);
    expect(act().activeEntryId).toBe(row.localId);
    expect(act().rest.endsAt).toBeNull();

    act().completeSet(row.localId, row.sets[0].localId);
    expect(act().rest.endsAt).not.toBeNull();
    // REGRESSION: the round is closed, so round 2 starts back at the bench — the
    // card and the glow both. They used to stay on rows and point at row set 2,
    // which made every other round two sets of the same exercise back to back.
    expect(act().activeEntryId).toBe(bench.localId);
    expect(upNextSet(live())).toEqual({ entryId: bench.localId, setId: bench.sets[1].localId });

    act().skipRest();
    act().completeSet(bench.localId, bench.sets[1].localId);
    act().completeSet(row.localId, row.sets[1].localId); // rows are done
    act().skipRest();
    // Round 3 is bench alone: it rests like any other exercise.
    act().completeSet(bench.localId, bench.sets[2].localId);
    expect(act().rest.source).toBe('transition');
    // The group is finished: the glow moves on to the push-ups.
    expect(upNextSet(live())?.entryId).toBe(entryOf(PUSHUPS.id).localId);
  });

  it('focus mode’s DONE, pressed over and over, alternates the whole way down', () => {
    open(r());
    const names: string[] = [];
    for (let guard = 0; guard < 20; guard += 1) {
      const next = upNextSet(live());
      if (!next) break;
      names.push(live().entries.find((e) => e.localId === next.entryId)!.exercise.name);
      act().completeSet(next.entryId, next.setId);
      act().skipRest();
    }
    expect(names).toEqual([
      'Bench press',
      'Cable row',
      'Bench press',
      'Cable row',
      'Bench press', // the unequal tail
      'Push-ups',
      'Push-ups',
    ]);
  });

  it('dropping one member mid-session leaves the other an ordinary exercise', () => {
    open(r());
    const bench = entryOf(BENCH.id);
    act().removeEntry(entryOf(ROW.id).localId);
    act().completeSet(bench.localId, bench.sets[0].localId);
    expect(act().rest.source).toBe('set');
    expect(act().activeEntryId).toBe(bench.localId);
  });
});

/* ------------------------------------------------------------------ */
/* 4. A rep ladder                                                     */
/* ------------------------------------------------------------------ */

describe('a rep-ladder day', () => {
  const r = () => saveRoutine(routine('qa_ladder_day', [item(LADDER.id, 0, 5)]));

  it('opens on the ladder, rebuilds the day off a top set that beat it, and advances on Finish', () => {
    open(r());
    const ladder = entryOf(LADDER.id);
    expect(ladder.sets.map((s) => s.count)).toEqual(ladderTargets({ max: 10, earned: 0 }, 5));

    // The bar said 12, not 10.
    act().patchSet(ladder.localId, ladder.sets[0].localId, { count: 12 });
    act().completeSet(ladder.localId, ladder.sets[0].localId);
    expect(entryOf(LADDER.id).sets.map((s) => s.count)).toEqual(ladderForMax(12, 5));

    logAll(LADDER.id);
    const { saved } = finishAndSave();
    expect(saved!.exercises[0].totalCount).toBe(ladderForMax(12, 5).reduce((a, b) => a + b, 0));

    // A proved max of 12, and a rep earned on top of it.
    const after = libraryById()[LADDER.id].ladder!;
    expect(after.max).toBe(12);
    expect(after.earned).toBe(1);

    // Next session opens on the new plan.
    open(r());
    expect(entryOf(LADDER.id).sets.map((s) => s.count)).toEqual(ladderTargets(after, 5));
  });

  it('a day that came up short leaves the ladder where it was', () => {
    open(r());
    const ladder = entryOf(LADDER.id);
    act().patchSet(ladder.localId, ladder.sets[4].localId, { count: 1 });
    logAll(LADDER.id);
    finishAndSave();
    expect(libraryById()[LADDER.id].ladder).toEqual({ max: 10, earned: 0 });
  });

  it('a sixth set reshapes all six, and a warm-up does not', () => {
    open(r());
    const ladder = entryOf(LADDER.id);
    act().addSet(ladder.localId);
    expect(entryOf(LADDER.id).sets.map((s) => s.count)).toEqual(
      ladderTargets({ max: 10, earned: 0 }, 6),
    );
  });
});

/* ------------------------------------------------------------------ */
/* 5. MAX and timed work                                               */
/* ------------------------------------------------------------------ */

describe('a calisthenics day: MAX sets, a plank on the clock, a hang counted up', () => {
  const r = () =>
    saveRoutine(
      routine('qa_cali', [
        item(PULLUPS_MAX.id, 0, 3),
        // Holds carry no rep range: the exercise's own 60 s is the plan.
        item(PLANK.id, 1, 2, { targetRepsMin: undefined, targetRepsMax: undefined }),
        item(HANG.id, 2, 1, { targetRepsMin: undefined, targetRepsMax: undefined }),
      ]),
    );

  it('MAX rows start at zero every time, even after a session of twelves', () => {
    open(r());
    const max = entryOf(PULLUPS_MAX.id);
    expect(max.sets.map((s) => s.count)).toEqual([0, 0, 0]);
    act().patchSet(max.localId, max.sets[0].localId, { count: 12 });
    act().completeSet(max.localId, max.sets[0].localId);
    act().addSet(max.localId);
    expect(entryOf(PULLUPS_MAX.id).sets[3].count).toBe(0);
    finishAndSave();

    open(r());
    expect(entryOf(PULLUPS_MAX.id).sets.map((s) => s.count)).toEqual([0, 0, 0]);
    expect(entryOf(PULLUPS_MAX.id).lastSessionSummary).toContain('12');
  });

  it('the plank logs what the clock read, and a hold has no kilograms of volume', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T10:00:00.000Z'));
    open(r());
    const plank = entryOf(PLANK.id);
    expect(plank.sets.map((s) => s.count)).toEqual([60, 60]);

    act().startSetTimer(plank.localId, plank.sets[0].localId);
    expect(act().setTimer?.mode).toBe('countdown');
    vi.setSystemTime(new Date('2026-10-10T10:01:00.000Z'));
    act().commitSetTimer();

    const logged = entryOf(PLANK.id).sets[0];
    expect(logged.isCompleted).toBe(true);
    expect(logged.count).toBe(60);
    expect(act().setTimer).toBeNull();
    // A second commit (the bell racing a thumb) logs nothing twice.
    act().commitSetTimer();
    expect(entryOf(PLANK.id).sets.filter((s) => s.isCompleted)).toHaveLength(1);

    const hang = entryOf(HANG.id);
    act().startSetTimer(hang.localId, hang.sets[0].localId);
    vi.setSystemTime(new Date('2026-10-10T10:02:35.000Z'));
    act().commitSetTimer();
    // Counted up from when ▶ was pressed (10:01:00) to the stop.
    expect(entryOf(HANG.id).sets[0].count).toBe(95);

    const { saved } = finishAndSave(new Date('2026-10-10T10:05:00.000Z'));
    expect(saved!.totalVolumeKg).toBe(0);
    expect(saved!.volumeIsPartial).toBe(false);
    expect(saved!.durationMinutes).toBe(5);
    expect(saved!.exercises.find((e) => e.exerciseId === PLANK.id)?.totalCount).toBe(60);
  });

  it('a timer cancelled before it worked logs nothing', () => {
    open(r());
    const plank = entryOf(PLANK.id);
    act().startSetTimer(plank.localId, plank.sets[0].localId);
    act().commitSetTimer(); // zero seconds in
    expect(entryOf(PLANK.id).sets[0].isCompleted).toBe(false);
    expect(act().setTimer).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 6. The overload nudge                                               */
/* ------------------------------------------------------------------ */

describe('the overload nudge', () => {
  const r = () => saveRoutine(routine('qa_nudge', [item(BENCH.id, 0, 3)]));
  /** Three sessions at 80 × 10 over three weeks: a plateau that has earned a nudge. */
  const plateau = (): Record<ID, SetHistory[]> => {
    const now = Date.now();
    const day = 86_400_000;
    const rows: SetHistory[] = [];
    [21, 14, 7].forEach((ago, s) => {
      const at = new Date(now - ago * day).toISOString();
      for (let i = 0; i < 3; i += 1) rows.push(historyRow(`old_${s}`, at, BENCH, 80, 10, i));
    });
    return { [BENCH.id]: rows };
  };

  it('accepting it moves every unlogged working set and nothing else', () => {
    open(r(), plateau());
    const bench = entryOf(BENCH.id);
    expect(bench.overload.shouldNudge).toBe(true);
    const suggested = bench.overload.suggestedWeightKg;
    expect(suggested).toBe(82.5);

    act().completeSet(bench.localId, bench.sets[0].localId); // the first set, at 80, before reading the card
    act().acceptOverload(bench.localId);

    const sets = entryOf(BENCH.id).sets;
    expect(sets[0].weightKg).toBe(80);
    expect(sets.slice(1).map((s) => s.weightKg)).toEqual([82.5, 82.5]);
    expect(entryOf(BENCH.id).overloadAccepted).toBe(true);
  });

  it('dismissing it silences the card and changes no number', () => {
    open(r(), plateau());
    const bench = entryOf(BENCH.id);
    const before = bench.sets.map((s) => s.weightKg);
    act().dismissOverload(bench.localId);
    expect(entryOf(BENCH.id).overloadAccepted).toBe(true);
    expect(entryOf(BENCH.id).sets.map((s) => s.weightKg)).toEqual(before);
  });

  it('an imperial lifter is nudged by a loadable 5 lb, not by 2.5 kg', () => {
    useSettings.getState().setUnitSystem('imperial');
    const at = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString();
    const lb100 = lbToKg(100);
    const rows: SetHistory[] = [];
    [21, 14, 7].forEach((ago, s) => {
      for (let i = 0; i < 3; i += 1) rows.push(historyRow(`lb_${s}`, at(ago), BENCH, lb100, 10, i));
    });
    open(r(), { [BENCH.id]: rows });

    const suggested = entryOf(BENCH.id).overload.suggestedWeightKg!;
    expect(kgToLb(suggested)).toBeCloseTo(105, 1);
    expect(formatWeight(suggested, 'imperial')).toBe('105');
    // Stored in kilograms whatever the display says.
    act().acceptOverload(entryOf(BENCH.id).localId);
    expect(entryOf(BENCH.id).sets[0].weightKg).toBeCloseTo(47.627, 2);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Changing the session's shape mid-workout                          */
/* ------------------------------------------------------------------ */

describe('re-planning in the gym', () => {
  const r = () =>
    saveRoutine(
      routine('qa_replan', [item(BENCH.id, 0, 2), item(ROW.id, 1, 2), item(DIPS.id, 2, 2)]),
    );

  it('edit, reorder, add — and History files it in the order it was done, under the new name', () => {
    open(r());
    // `Edit exercise` → Save, exactly as AppShell wires it.
    const renamed: Exercise = {
      ...libraryById()[ROW.id],
      name: 'Seated row',
      defaultRestSeconds: 45,
    };
    useLibrary.getState().updateExercise(ROW.id, renamed);
    act().syncExercise(ROW.id, renamed);
    expect(entryOf(ROW.id).exercise.name).toBe('Seated row');

    // Rows first — the bench was taken.
    act().moveEntry(entryOf(ROW.id).localId, 0);
    expect(live().entries.map((e) => e.exercise.id)).toEqual([ROW.id, BENCH.id, DIPS.id]);

    const row = entryOf(ROW.id);
    act().completeSet(row.localId, row.sets[0].localId);
    expect(act().rest.totalSeconds).toBe(45); // the edited rest, on the very next set

    // Neck work, decided halfway through.
    act().addEntry(
      buildDraftEntry({
        exercise: NECK,
        history: [],
        policy: DEFAULT_OVERLOAD_POLICY,
        unitSystem: 'metric',
        restSeconds: 90,
        transitionRestSeconds: 120,
        targetSets: 4,
        targetRepsMax: 10,
        plannedSetCount: 4,
      }),
    );
    expect(act().activeEntryId).toBe(entryOf(NECK.id).localId);

    logAll(ROW.id);
    logAll(BENCH.id);
    logAll(NECK.id);
    const { saved } = finishAndSave(undefined, true);

    expect(saved!.exercises.map((e) => e.name)).toEqual(['Seated row', 'Bench press', 'Neck curl']);
    // The routine learns nothing about neck work, nor about the skipped dips.
    const items = useLibrary.getState().routines.find((x) => x.id === 'qa_replan')!.items;
    expect(items.map((i) => [i.exerciseId, i.targetSets])).toEqual([
      [BENCH.id, 2],
      [ROW.id, 2],
      [DIPS.id, 2],
    ]);
  });

  it('an exercise made unweighted mid-session saves no weight on its rows', () => {
    open(r());
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId);
    const bodyweightOnly: Exercise = { ...BENCH, requiresWeight: false, loadMode: 'none' };
    act().syncExercise(BENCH.id, bodyweightOnly);
    logAll(BENCH.id);
    const { saved } = finishAndSave();
    expect(saved!.sets.every((s) => s.weightKg === null)).toBe(true);
  });

  it('an exercise removed and put back by Undo comes back logged, at its place', () => {
    open(r());
    const row = entryOf(ROW.id);
    act().completeSet(row.localId, row.sets[0].localId);
    const snapshot = entryOf(ROW.id);
    act().removeEntry(row.localId);
    expect(act().rest.endsAt).toBeNull(); // the rest it started went with it
    act().insertEntry(snapshot, 1);
    expect(live().entries[1]).toEqual(snapshot);
    expect(act().activeEntryId).toBe(snapshot.localId);
  });

  it('the same movement twice in one session is one line in History', () => {
    saveRoutine(
      routine('qa_twice', [item(BENCH.id, 0, 2), item(ROW.id, 1, 1), item(BENCH.id, 2, 2)]),
    );
    open(useLibrary.getState().routines.find((x) => x.id === 'qa_twice')!);
    logAll(BENCH.id, 0);
    logAll(ROW.id);
    logAll(BENCH.id, 1);
    const { saved } = finishAndSave();

    expect(saved!.exercises.map((e) => e.exerciseId)).toEqual([BENCH.id, ROW.id]);
    expect(saved!.exercises[0].setCount).toBe(4);
    // A later correction regenerates the same line rather than a different one.
    const again = recomputeWorkout(saved!);
    expect(again.exercises[0].summary).toBe(saved!.exercises[0].summary);
    expect(again.totalVolumeKg).toBe(saved!.totalVolumeKg);
  });
});

/* ------------------------------------------------------------------ */
/* 8. The training loop                                                */
/* ------------------------------------------------------------------ */

describe('the training loop', () => {
  it('moves on when its step is trained, and only then', () => {
    const a = saveRoutine(routine('qa_loop_a', [item(BENCH.id, 0, 1)]));
    const b = saveRoutine(routine('qa_loop_b', [item(ROW.id, 0, 1)]));
    const library = useLibrary.getState();
    library.addSequenceStep(a.id);
    library.addSequenceStep(b.id);
    library.setSequenceActive(true);

    // Opened and finished with nothing logged: no workout, no step.
    open(a);
    finishAndSave();
    expect(useLibrary.getState().sequence.cursor).toBe(0);

    // A different routine than the one up next: trained, but not this step.
    open(b);
    logAll(ROW.id);
    finishAndSave();
    expect(useLibrary.getState().sequence.cursor).toBe(0);

    open(a);
    logAll(BENCH.id);
    finishAndSave();
    expect(useLibrary.getState().sequence.cursor).toBe(1);

    open(b);
    logAll(ROW.id);
    finishAndSave();
    expect(useLibrary.getState().sequence.cursor).toBe(0); // it wraps
  });
});

/* ------------------------------------------------------------------ */
/* 9. Bodyweight and assisted work                                     */
/* ------------------------------------------------------------------ */

describe('bodyweight, belts and the assisted machine', () => {
  const r = () =>
    saveRoutine(
      routine('qa_bw', [item(DIPS.id, 0, 2), item(ASSISTED.id, 1, 2), item(PUSHUPS.id, 2, 1)]),
    );

  it('weighs every set once a bodyweight is known', () => {
    useSettings.getState().setBodyweightKg(80);
    open(r());
    logAll(DIPS.id);
    logAll(ASSISTED.id);
    logAll(PUSHUPS.id);
    const { saved } = finishAndSave();
    // (80 + 10) × 20  +  (80 − 20) × 20  +  80 × 10
    expect(saved!.totalVolumeKg).toBe(90 * 20 + 60 * 20 + 80 * 10);
    expect(saved!.volumeIsPartial).toBe(false);
  });

  it('says the figure is partial rather than invent a bodyweight', () => {
    open(r());
    logAll(DIPS.id);
    logAll(PUSHUPS.id);
    const { saved } = finishAndSave();
    expect(saved!.totalVolumeKg).toBe(0);
    expect(saved!.volumeIsPartial).toBe(true);
  });

  it('a lighter assistance setting is a heavier set, and a record', () => {
    useSettings.getState().setBodyweightKg(80);
    const at = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const old = [historyRow('assist_old', at, ASSISTED, 30, 8, 0)];
    open(r(), { [ASSISTED.id]: old });
    const assisted = entryOf(ASSISTED.id);
    expect(assisted.sets[0].weightKg).toBe(30); // last session's pin

    act().patchSet(assisted.localId, assisted.sets[0].localId, { weightKg: 20 });
    act().completeSet(assisted.localId, assisted.sets[0].localId);
    const beaten = recordsBeatenBy(entryOf(ASSISTED.id).sets[0], assisted.bests!, ASSISTED, 80);
    expect(beaten.heaviest).toBe(true);

    const records = recordsBrokenIn(draftToSetHistory(live()), old, () => 80);
    expect(records.map((rec) => rec.exerciseId)).toContain(ASSISTED.id);
  });

  it('assistance heavier than the lifter is no load at all, never a negative one', () => {
    expect(effectiveLoadKg(100, 'assisted', 80)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 10. Past midnight                                                    */
/* ------------------------------------------------------------------ */

describe('a session that runs past midnight', () => {
  it('is dated by its start, every row with it, and the span says +1', () => {
    vi.useFakeTimers();
    const start = new Date(2026, 9, 12, 23, 40); // local 23:40
    vi.setSystemTime(start);
    open(saveRoutine(routine('qa_late', [item(BENCH.id, 0, 2)])));
    const bench = entryOf(BENCH.id);
    vi.setSystemTime(new Date(2026, 9, 12, 23, 55));
    act().completeSet(bench.localId, bench.sets[0].localId);
    vi.setSystemTime(new Date(2026, 9, 13, 0, 50));
    act().completeSet(bench.localId, bench.sets[1].localId);

    const end = new Date(2026, 9, 13, 0, 55);
    vi.setSystemTime(end);
    const { saved } = finishAndSave(end);

    expect(saved!.startedAt).toBe(start.toISOString());
    expect(saved!.sets.every((s) => s.performedAt === start.toISOString())).toBe(true);
    expect(saved!.durationMinutes).toBe(75);
    expect(formatTimeSpan(saved!.startedAt, saved!.endedAt)).toBe('23:40–00:55 +1');
    // The 55 minutes between the two sets are past any rest anybody took, so the
    // log records none rather than a midnight-sized one.
    expect(saved!.sets[1].restTakenSeconds).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 11. Correcting it in History the next day                           */
/* ------------------------------------------------------------------ */

describe('editing a past workout', () => {
  function savedPushDay() {
    open(saveRoutine(routine('qa_hist', [item(BENCH.id, 0, 3), item(ROW.id, 1, 2)])));
    logAll(BENCH.id);
    logAll(ROW.id);
    const { saved } = finishAndSave();
    return saved!;
  }

  it('a typo corrected regenerates every number around it', () => {
    const saved = savedPushDay();
    const row = saved.sets.find((s) => s.exerciseId === BENCH.id)!;
    expect(useWorkoutHistory.getState().updateWorkoutSet(saved.id, row.id, { weightKg: 600 })).toBe(
      true,
    );
    const fixed = useWorkoutHistory.getState().workouts[0];
    expect(fixed.exercises[0].topWeightKg).toBe(600);
    expect(fixed.totalVolumeKg).toBe(600 * 10 + 60 * 20 + 50 * 20);

    useWorkoutHistory.getState().updateWorkoutSet(saved.id, row.id, { weightKg: 60 });
    expect(useWorkoutHistory.getState().workouts[0].totalVolumeKg).toBe(saved.totalVolumeKg);
  });

  it('a nonsense correction is refused rather than stored', () => {
    // REGRESSION: `Math.max(0, Math.round(NaN))` is NaN, and a NaN weight went
    // straight in. The row was then written to disk, and the read guard drops a
    // row whose numbers are not finite — so the set vanished on the next launch.
    const saved = savedPushDay();
    const row = saved.sets[0];
    const store = useWorkoutHistory.getState();
    store.updateWorkoutSet(saved.id, row.id, { count: Number.NaN });
    store.updateWorkoutSet(saved.id, row.id, { weightKg: Number.POSITIVE_INFINITY });
    const after = useWorkoutHistory.getState().workouts[0].sets.find((s) => s.id === row.id)!;
    expect(after.count).toBe(10);
    expect(after.weightKg).toBe(60);
    expect(Number.isFinite(useWorkoutHistory.getState().workouts[0].totalVolumeKg)).toBe(true);

    // ...and it survives a relaunch.
    useWorkoutHistory.getState().reloadHistory();
    expect(useWorkoutHistory.getState().workouts[0].sets).toHaveLength(saved.sets.length);
  });

  it('rename, retime, redurate: the rows move with the header and the order follows', () => {
    const older = savedPushDay();
    const store = useWorkoutHistory.getState();
    const yesterday = new Date(Date.parse(older.startedAt) - 86_400_000);
    expect(
      store.editWorkout(older.id, {
        title: '  Push, short  ',
        startedAt: yesterday,
        durationMinutes: 61,
      }),
    ).toBe(true);

    const edited = useWorkoutHistory.getState().workouts[0];
    expect(edited.title).toBe('Push, short');
    expect(edited.startedAt).toBe(yesterday.toISOString());
    expect(edited.sets.every((s) => s.performedAt === yesterday.toISOString())).toBe(true);
    expect(edited.durationMinutes).toBe(61);
    expect(Date.parse(edited.endedAt) - Date.parse(edited.startedAt)).toBe(61 * 60_000);

    // A blank title keeps the old one; a duration of NaN is the floor, not a NaN.
    store.editWorkout(older.id, { title: '   ', durationMinutes: Number.NaN });
    expect(useWorkoutHistory.getState().workouts[0].title).toBe('Push, short');
    expect(useWorkoutHistory.getState().workouts[0].durationMinutes).toBe(1);
  });

  it('cannot be dragged into the future', () => {
    const saved = savedPushDay();
    useWorkoutHistory.getState().editWorkout(saved.id, { shiftMinutes: 60 * 24 * 7 });
    expect(Date.parse(useWorkoutHistory.getState().workouts[0].startedAt)).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('add a set, add an exercise, remove one, and undo — the record stays consistent', () => {
    const saved = savedPushDay();
    const store = useWorkoutHistory.getState();

    expect(store.addWorkoutSet(saved.id, BENCH.id)).toBe(true);
    let w = useWorkoutHistory.getState().workouts[0];
    expect(w.exercises[0].setCount).toBe(4);
    // Positions within each exercise, from 0, warm-ups included.
    expect(w.sets.filter((s) => s.exerciseId === BENCH.id).map((s) => s.setIndex)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(w.sets.filter((s) => s.exerciseId === ROW.id).map((s) => s.setIndex)).toEqual([0, 1]);

    expect(store.addWorkoutExercise(saved.id, NECK)).toBe(true);
    expect(store.addWorkoutExercise(saved.id, NECK)).toBe(false); // already there
    w = useWorkoutHistory.getState().workouts[0];
    expect(w.exercises.map((e) => e.exerciseId)).toEqual([BENCH.id, ROW.id, NECK.id]);
    expect(w.sets.find((s) => s.exerciseId === NECK.id)).toMatchObject({ weightKg: 5, count: 1 });

    const before = useWorkoutHistory.getState().workouts[0];
    expect(store.deleteWorkoutExercise(saved.id, ROW.id)).toBe(true);
    expect(useWorkoutHistory.getState().workouts[0].sets.some((s) => s.exerciseId === ROW.id)).toBe(
      false,
    );
    expect(store.restoreWorkout(before)).toBe(true);
    expect(useWorkoutHistory.getState().workouts[0]).toEqual(before);
  });

  it('refuses to empty a workout by removing rows or exercises', () => {
    open(saveRoutine(routine('qa_one', [item(BENCH.id, 0, 1)])));
    logAll(BENCH.id);
    const { saved } = finishAndSave();
    const store = useWorkoutHistory.getState();
    expect(store.deleteWorkoutSet(saved!.id, saved!.sets[0].id)).toBe(false);
    expect(store.deleteWorkoutExercise(saved!.id, BENCH.id)).toBe(false);
    expect(removeExerciseFromWorkout(saved!, BENCH.id)).toBeNull();
    expect(useWorkoutHistory.getState().workouts[0].sets).toHaveLength(1);
  });

  it('a deleted workout cannot be resurrected by an Undo', () => {
    const saved = savedPushDay();
    useWorkoutHistory.getState().deleteWorkout(saved.id);
    expect(useWorkoutHistory.getState().restoreWorkout(saved)).toBe(false);
    expect(useWorkoutHistory.getState().workouts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 12. Pure edges the flows above lean on                               */
/* ------------------------------------------------------------------ */

describe('edge numbers in the pure libraries', () => {
  const entryWith = (sets: { weightKg: number | null; count: number; isWarmup?: boolean }[]) =>
    ({
      localId: 'e',
      routineId: 'r',
      title: 't',
      startedAt: '2026-10-10T10:00:00.000Z',
      entries: [
        {
          ...buildDraftEntry({
            exercise: BENCH,
            history: [],
            policy: DEFAULT_OVERLOAD_POLICY,
            unitSystem: 'metric',
            restSeconds: 90,
            transitionRestSeconds: 120,
            targetSets: 1,
          }),
          sets: sets.map((s, i) => ({
            localId: `s${i}`,
            weightKg: s.weightKg,
            count: s.count,
            isWarmup: s.isWarmup ?? false,
            isCompleted: true,
            completedAt: '2026-10-10T10:05:00.000Z',
            isPrefilled: false,
          })),
        },
      ],
    }) satisfies DraftSession;

  it('a zero-weight set is a set, worth zero kilograms', () => {
    const session = entryWith([{ weightKg: 0, count: 10 }]);
    expect(sessionVolume(session)).toEqual({ kg: 0, unweighable: 0 });
    const saved = useWorkoutHistory.getState().saveSession(session);
    expect(saved?.setCount).toBe(1);
  });

  it('an empty session and a session of empty sets are not workouts', () => {
    expect(useWorkoutHistory.getState().saveSession({ ...entryWith([]), entries: [] })).toBeNull();
    expect(useWorkoutHistory.getState().saveSession(entryWith([]))).toBeNull();
  });

  it('very large numbers stay finite and printable', () => {
    const session = entryWith([{ weightKg: 1e6, count: 1e4 }]);
    expect(sessionVolume(session).kg).toBe(1e10);
    expect(formatWeight(1e6, 'metric')).toBe('1000000');
    expect(roundToStep(1e9 + 1.3, 2.5)).toBe(1e9 + 2.5);
    const summary = summarizeSessionSets(draftToSetHistory(session), BENCH);
    expect(summary.lead).toContain('1000000');
  });

  it('warm-ups for a weight that is not a weight are none at all', () => {
    for (const w of [0, -20, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(warmupSets({ workingWeightKg: w, exercise: BENCH })).toEqual([]);
    }
    // A 2.5 kg working weight has no lighter rung worth loading on a fine step.
    expect(warmupSets({ workingWeightKg: 2.5, exercise: { ...BENCH, incrementKg: 2.5 } })).toEqual(
      [],
    );
  });

  it('a ladder from a nonsense max is still a ladder of whole, non-increasing reps', () => {
    for (const max of [Number.NaN, -5, 0, 0.4, 1e9]) {
      const targets = ladderForMax(max, 5);
      expect(targets).toHaveLength(5);
      targets.forEach((reps, i) => {
        expect(Number.isInteger(reps)).toBe(true);
        expect(reps).toBeGreaterThanOrEqual(1);
        if (i > 0) expect(reps).toBeLessThanOrEqual(targets[i - 1]);
      });
    }
    expect(ladderTargets({ max: 10, earned: Number.NaN }, 5)).toEqual(ladderForMax(10, 5));
    expect(ladderTargets({ max: 10, earned: 1e9 }, 5).every(Number.isFinite)).toBe(true);
  });

  it('records ignore a NaN or empty set rather than call it a best', () => {
    const rows = [
      historyRow('x', '2026-10-01T10:00:00.000Z', BENCH, Number.NaN, 5, 0),
      historyRow('x', '2026-10-01T10:00:00.000Z', BENCH, 60, Number.NaN, 1),
      historyRow('x', '2026-10-01T10:00:00.000Z', BENCH, 60, 0, 2),
    ];
    const bests = exerciseBests(rows, BENCH);
    expect(bests.heaviest).toBeNull();
    expect(bests.mostCount?.value).toBe(5);
    expect(recordsBeatenBy({ weightKg: 70, count: Number.NaN }, bests, BENCH, null).heaviest).toBe(
      false,
    );
  });

  it('durations clamp, indices rebuild, and an orphan row is kept last', () => {
    expect(clampDurationMinutes(Number.NaN)).toBe(1);
    expect(clampDurationMinutes(-3)).toBe(1);
    expect(clampDurationMinutes(1e9)).toBe(600);

    const session = entryWith([
      { weightKg: 60, count: 10 },
      { weightKg: 60, count: 10 },
    ]);
    const saved = useWorkoutHistory.getState().saveSession(session)!;
    const orphan = { ...saved.sets[0], id: 'orphan', exerciseId: 'gone', setIndex: 0 };
    const rebuilt = reindexSets({ ...saved, sets: [orphan, ...saved.sets] });
    expect(rebuilt.map((s) => [s.exerciseId, s.setIndex])).toEqual([
      [BENCH.id, 0],
      [BENCH.id, 1],
      ['gone', 0],
    ]);
  });

  it('a rest of NaN, zero or minus is no rest at all', () => {
    open(saveRoutine(routine('qa_rest', [item(BENCH.id, 0, 2)])));
    for (const s of [Number.NaN, 0, -30, Number.POSITIVE_INFINITY]) {
      act().startRest(s);
      expect(act().rest.endsAt).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ */
/* QA regressions: the shape edits that used to leave wreckage         */
/* ------------------------------------------------------------------ */

describe('QA regressions in the live session', () => {
  it('removing the row that started a rest ends that rest, as undo and remove-exercise do', () => {
    open(saveRoutine(routine('qa_rm_rest', [item(BENCH.id, 0, 3)])));
    const bench = entryOf(BENCH.id);
    act().completeSet(bench.localId, bench.sets[0].localId);
    expect(act().rest.originSetId).toBe(bench.sets[0].localId);

    // A different row going does not touch it...
    act().removeSet(bench.localId, bench.sets[2].localId);
    expect(act().rest.originSetId).toBe(bench.sets[0].localId);

    // ...the row that started it does.
    act().removeSet(bench.localId, bench.sets[0].localId);
    expect(act().rest.endsAt).toBeNull();
    expect(act().rest.originSetId).toBeNull();
  });

  it('a set added under a drop set continues the working weight, not the drop', () => {
    open(saveRoutine(routine('qa_drop_add', [item(BENCH.id, 0, 2)])));
    const bench = entryOf(BENCH.id);
    act().patchSet(bench.localId, bench.sets[0].localId, { weightKg: 80, count: 8 });
    act().patchSet(bench.localId, bench.sets[1].localId, { weightKg: 50, count: 12 });
    act().markSet(bench.localId, bench.sets[1].localId, { kind: 'drop' });

    act().addSet(bench.localId);
    const added = entryOf(BENCH.id).sets[2];
    expect(added.setType).not.toBe('drop');
    expect(added.weightKg).toBe(80);
    expect(added.count).toBe(8);
  });

  it('a set added after an ordinary row still copies that row', () => {
    open(saveRoutine(routine('qa_plain_add', [item(BENCH.id, 0, 2)])));
    const bench = entryOf(BENCH.id);
    act().patchSet(bench.localId, bench.sets[1].localId, { weightKg: 65, count: 9 });
    act().addSet(bench.localId);
    expect(entryOf(BENCH.id).sets[2]).toMatchObject({ weightKg: 65, count: 9 });
  });

  it('editing the ladder max mid-session reshapes the unlogged rows and Finish agrees', () => {
    open(saveRoutine(routine('qa_ladder_edit', [item(LADDER.id, 0, 5)])));
    const before = entryOf(LADDER.id);
    act().completeSet(before.localId, before.sets[0].localId);
    const loggedCount = entryOf(LADDER.id).sets[0].count;

    const edited: Exercise = { ...libraryById()[LADDER.id], ladder: { max: 14, earned: 0 } };
    useLibrary.getState().updateExercise(LADDER.id, edited);
    act().syncExercise(LADDER.id, edited);

    const after = entryOf(LADDER.id);
    expect(after.ladder).toEqual({ max: 14, earned: 0 });
    expect(after.ladder).toEqual(after.exercise.ladder);
    // The logged top set is history; everything under it follows the new plan
    // off what that top set actually did.
    expect(after.sets[0].count).toBe(loggedCount);
    expect(after.sets[0].isCompleted).toBe(true);
  });

  it('an unstarted ladder edited mid-session plans every row off the new max', () => {
    open(saveRoutine(routine('qa_ladder_edit2', [item(LADDER.id, 0, 5)])));
    const edited: Exercise = { ...libraryById()[LADDER.id], ladder: { max: 14, earned: 0 } };
    act().syncExercise(LADDER.id, edited);
    const entry = entryOf(LADDER.id);
    expect(entry.sets.map((s) => s.count)).toEqual(ladderTargets({ max: 14, earned: 0 }, 5));

    // Finish judges against the same max the rows were built from.
    logAll(LADDER.id);
    const finished = act().finishSession()!;
    const [outcome] = ladderOutcomes(finished.entries);
    expect(outcome.before.max).toBe(14);
  });

  it('turning a ladder on mid-session shapes the untouched rows; turning it off drops the copy', () => {
    open(saveRoutine(routine('qa_ladder_on', [item(PUSHUPS.id, 0, 3)])));
    const entry = entryOf(PUSHUPS.id);
    act().patchSet(entry.localId, entry.sets[2].localId, { count: 7 }); // a hand edit

    const on: Exercise = { ...libraryById()[PUSHUPS.id], ladder: { max: 12, earned: 0 } };
    act().syncExercise(PUSHUPS.id, on);
    const plan = ladderTargets({ max: 12, earned: 0 }, 3);
    expect(entryOf(PUSHUPS.id).ladder).toEqual({ max: 12, earned: 0 });
    expect(entryOf(PUSHUPS.id).sets.map((s) => s.count)).toEqual([plan[0], plan[1], 7]);

    const off: Exercise = { ...on, ladder: undefined };
    act().syncExercise(PUSHUPS.id, off);
    expect(entryOf(PUSHUPS.id).ladder).toBeUndefined();
    // The numbers stay: they are still a plausible plan, and nothing reads them as a ladder.
    expect(entryOf(PUSHUPS.id).sets.map((s) => s.count)).toEqual([plan[0], plan[1], 7]);
  });

  it('turning MAX on mid-session zeroes the untouched rows, and off gives them a target back', () => {
    open(saveRoutine(routine('qa_max_on', [item(PUSHUPS.id, 0, 3)])));
    const entry = entryOf(PUSHUPS.id);
    act().completeSet(entry.localId, entry.sets[0].localId);
    const logged = entryOf(PUSHUPS.id).sets[0].count;

    const on: Exercise = { ...libraryById()[PUSHUPS.id], countToMax: true };
    act().syncExercise(PUSHUPS.id, on);
    expect(entryOf(PUSHUPS.id).sets.map((s) => s.count)).toEqual([logged, 0, 0]);

    // A name edit on a MAX exercise does not reset a counter mid-count.
    const counting = entryOf(PUSHUPS.id);
    act().patchSet(counting.localId, counting.sets[1].localId, { count: 4 });
    act().syncExercise(PUSHUPS.id, { ...on, name: 'Push-ups (max)' });
    expect(entryOf(PUSHUPS.id).sets[1].count).toBe(4);

    act().syncExercise(PUSHUPS.id, { ...on, countToMax: false });
    // Routine target is 8–10: the top of the range, as the prefill would have used.
    expect(entryOf(PUSHUPS.id).sets.map((s) => s.count)).toEqual([logged, 4, 10]);
  });
});
