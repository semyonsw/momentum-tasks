import { beforeEach, describe, expect, it } from 'vitest';

import { __closeDb, countSetRows, readAllWorkouts } from './historyDb';
import { historyTotals, recentSummaries, useWorkoutHistory } from './workoutHistoryStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import type { CompletedWorkout } from '../lib/completedWorkout';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import { __resetDatabases, __simulateProcessRestart } from '../../test/expoSqliteStub';
import type { Exercise, ID } from '../types/models';

/**
 * Every edit to a finished workout, across a relaunch — and the inputs an edit
 * must refuse.
 *
 * `workoutHistoryStore.test.ts` proves each edit is right in memory and on disk;
 * `coldStart.test.ts` proves a save and a correction survive a kill. This file is
 * the rest of the edits put through the same kill: a deletion that comes back
 * after a relaunch is a deletion the user has to make twice and cannot trust, and
 * an Undo that only reached memory is a set that is gone the next morning.
 *
 * And the refusals. A NaN count that reached `recomputeWorkout` would be a NaN
 * volume on the history row and a NaN in every suggestion that reads the
 * exercise — for as long as the log exists, because the app never rewrites it.
 */

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function loggedDraft(startedAt: string, count = 3, weightKg = 40): DraftSession {
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
      i < n ? { ...s, isCompleted: true, weightKg, isPrefilled: false } : s,
    ),
  });
  // Two exercises logged, so removing one is not removing the workout.
  return { ...session, entries: [logged(first, count), logged(second, 1), ...rest] };
}

function save(startedAt = '2026-09-01T17:00:00.000Z'): CompletedWorkout {
  const stored = useWorkoutHistory.getState().saveSession(loggedDraft(startedAt));
  if (!stored) throw new Error('nothing was saved');
  return stored;
}

/** Android kills the app; the user opens it again. */
function relaunch(): number {
  __simulateProcessRestart();
  __closeDb();
  useWorkoutHistory.setState({ workouts: [], numbering: null });
  return useWorkoutHistory.getState().reloadHistory();
}

const current = (id: string) => useWorkoutHistory.getState().workouts.find((w) => w.id === id);

beforeEach(() => {
  __resetDatabases();
  __closeDb();
  useWorkoutHistory.setState({ workouts: [], numbering: null, loadFailed: false, ready: true });
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
});

describe('an empty log', () => {
  it('reads as empty, not as failed, and totals to zero', () => {
    expect(relaunch()).toBe(0);
    const { workouts, loadFailed, ready, numbering } = useWorkoutHistory.getState();
    expect(workouts).toEqual([]);
    expect(loadFailed).toBe(false);
    expect(ready).toBe(true);
    expect(numbering).toBeNull();
    expect(historyTotals(workouts)).toEqual({
      workouts: 0,
      sets: 0,
      volumeKg: 0,
      volumeIsPartial: false,
    });
    expect(recentSummaries(workouts)).toEqual([]);
  });

  it('every edit on an empty log refuses rather than inventing a workout', () => {
    const s = useWorkoutHistory.getState();
    expect(s.updateWorkoutSet('w', 'set', { count: 5 })).toBe(false);
    expect(s.deleteWorkoutSet('w', 'set')).toBe(false);
    expect(s.editWorkout('w', { title: 'X' })).toBe(false);
    expect(s.addWorkoutSet('w', 'ex')).toBe(false);
    expect(s.deleteWorkoutExercise('w', 'ex')).toBe(false);
    s.deleteWorkout('w');
    s.setWorkoutNumber('w', 5);
    expect(useWorkoutHistory.getState().workouts).toEqual([]);
    expect(useWorkoutHistory.getState().numbering).toBeNull();
    expect(readAllWorkouts()).toEqual([]);
  });
});

describe('a correction refuses what is not a number', () => {
  it.each([
    ['a NaN count', { count: Number.NaN }],
    ['an infinite count', { count: Infinity }],
    ['a NaN weight', { weightKg: Number.NaN }],
    ['an infinite weight', { weightKg: -Infinity }],
  ])('%s', (_label, patch) => {
    const workout = save();
    const row = workout.sets[0];
    expect(useWorkoutHistory.getState().updateWorkoutSet(workout.id, row.id, patch)).toBe(false);
    expect(current(workout.id)).toBe(workout);
    relaunch();
    expect(current(workout.id)?.sets.find((s) => s.id === row.id)).toEqual(row);
  });

  it('a negative count becomes zero and a fractional one whole', () => {
    const workout = save();
    const [a, b] = workout.sets;
    useWorkoutHistory.getState().updateWorkoutSet(workout.id, a.id, { count: -4 });
    useWorkoutHistory.getState().updateWorkoutSet(workout.id, b.id, { count: 7.6 });
    const sets = current(workout.id)?.sets ?? [];
    expect(sets.find((s) => s.id === a.id)?.count).toBe(0);
    expect(sets.find((s) => s.id === b.id)?.count).toBe(8);
    expect(Number.isFinite(current(workout.id)?.totalVolumeKg)).toBe(true);
  });

  it('a correction to one workout never reaches another', () => {
    const one = save('2026-09-01T17:00:00.000Z');
    const two = save('2026-09-03T17:00:00.000Z');
    useWorkoutHistory.getState().updateWorkoutSet(one.id, one.sets[0].id, { count: 1 });
    expect(current(two.id)).toBe(two);
  });
});

describe('every edit survives a relaunch', () => {
  it('a deleted workout stays deleted, rows and all', () => {
    const keep = save('2026-09-01T17:00:00.000Z');
    const gone = save('2026-09-03T17:00:00.000Z');
    useWorkoutHistory.getState().deleteWorkout(gone.id);
    expect(relaunch()).toBe(1);
    expect(useWorkoutHistory.getState().workouts.map((w) => w.id)).toEqual([keep.id]);
    expect(countSetRows()).toBe(keep.sets.length);
  });

  it('a deleted set stays deleted, and the totals stay recomputed', () => {
    const workout = save();
    const row = workout.sets[1];
    useWorkoutHistory.getState().deleteWorkoutSet(workout.id, row.id);
    const edited = current(workout.id);
    relaunch();
    const back = current(workout.id);
    expect(back?.sets.map((s) => s.id)).not.toContain(row.id);
    expect(back?.setCount).toBe(edited?.setCount);
    expect(back?.totalVolumeKg).toBe(edited?.totalVolumeKg);
  });

  it('a removed exercise stays removed', () => {
    const workout = save();
    const exerciseId = workout.exercises[1].exerciseId;
    expect(useWorkoutHistory.getState().deleteWorkoutExercise(workout.id, exerciseId)).toBe(true);
    relaunch();
    const back = current(workout.id);
    expect(back?.exercises.map((e) => e.exerciseId)).not.toContain(exerciseId);
    expect(back?.sets.some((s) => s.exerciseId === exerciseId)).toBe(false);
  });

  it('an added set is still there', () => {
    const workout = save();
    const exerciseId = workout.exercises[0].exerciseId;
    useWorkoutHistory.getState().addWorkoutSet(workout.id, exerciseId);
    const count = current(workout.id)?.sets.length;
    relaunch();
    expect(current(workout.id)?.sets.length).toBe(count);
    expect(count).toBe(workout.sets.length + 1);
  });

  it('a rename and a new duration are still there', () => {
    const workout = save();
    useWorkoutHistory.getState().editWorkout(workout.id, { title: 'Push', durationMinutes: 47 });
    relaunch();
    expect(current(workout.id)).toMatchObject({ title: 'Push', durationMinutes: 47 });
  });

  it('the Undo of a deleted set puts it back on disk too', () => {
    const workout = save();
    const row = workout.sets[0];
    useWorkoutHistory.getState().deleteWorkoutSet(workout.id, row.id);
    expect(useWorkoutHistory.getState().restoreWorkout(workout)).toBe(true);
    relaunch();
    const back = current(workout.id);
    // Sorted: the read orders rows by `set_index` across exercises, not as saved.
    expect(back?.sets.map((s) => s.id).sort()).toEqual(workout.sets.map((s) => s.id).sort());
    expect(back?.totalVolumeKg).toBe(workout.totalVolumeKg);
  });

  it('a cleared log stays cleared, and its pin with it', () => {
    const workout = save();
    useWorkoutHistory.getState().setWorkoutNumber(workout.id, 40);
    useWorkoutHistory.getState().clearHistory();
    expect(relaunch()).toBe(0);
    expect(useWorkoutHistory.getState().numbering).toBeNull();
  });

  it('the pin follows its heir through a relaunch when the pinned workout is deleted', () => {
    const older = save('2026-09-01T17:00:00.000Z');
    const newer = save('2026-09-03T17:00:00.000Z');
    useWorkoutHistory.getState().setWorkoutNumber(newer.id, 50);
    useWorkoutHistory.getState().deleteWorkout(newer.id);
    relaunch();
    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: older.id, number: 49 });
  });
});

describe('the workout number', () => {
  it('refuses NaN and rounds a fraction', () => {
    const workout = save();
    useWorkoutHistory.getState().setWorkoutNumber(workout.id, Number.NaN);
    expect(useWorkoutHistory.getState().numbering).toBeNull();
    useWorkoutHistory.getState().setWorkoutNumber(workout.id, 12.4);
    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: workout.id, number: 12 });
  });

  it('a pin can be cleared, and stays cleared after a relaunch', () => {
    const workout = save();
    useWorkoutHistory.getState().setWorkoutNumber(workout.id, 12);
    useWorkoutHistory.getState().clearWorkoutNumbering();
    relaunch();
    expect(useWorkoutHistory.getState().numbering).toBeNull();
  });
});

describe('an import', () => {
  it('replaces the log on disk, and a relaunch reads the import, not the old log', () => {
    const old = save('2026-09-01T17:00:00.000Z');
    const incoming = { ...old, id: 'w_imported', title: 'Imported' };
    expect(useWorkoutHistory.getState().importWorkouts([incoming, { junk: true }])).toBe(1);
    relaunch();
    expect(useWorkoutHistory.getState().workouts.map((w) => w.id)).toEqual(['w_imported']);
  });
});
