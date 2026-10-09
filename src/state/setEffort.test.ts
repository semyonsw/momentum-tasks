import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openDatabaseSync } from 'expo-sqlite';

import { NO_REST, useActiveWorkout } from './activeWorkoutStore';
import { DB_NAME, __closeDb, readAllWorkouts } from './historyDb';
import { useWorkoutHistory } from './workoutHistoryStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { useLibrary } from './libraryStore';
import { applyBackup, exportBackupText } from './dataTransfer';
import { parseBackup } from '../lib/backup';
import { buildDraftSession, draftToSetHistory, type DraftSession } from '../lib/draft';
import type { CompletedWorkout } from '../lib/completedWorkout';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import { __resetDatabases, __simulateProcessRestart } from '../../test/expoSqliteStub';
import type { Exercise, ID, SetHistory } from '../types/models';

/**
 * T-11 · RIR per set, wherever it is PERSISTED.
 *
 * The field is optional and new, so every test here is one of two promises: a set
 * graded now comes back graded (SQLite, a relaunch, a backup), and a log written
 * before the field existed — by 2.2.0, or by a database that predates the column —
 * comes back exactly as it was, with nothing invented.
 */

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function loggedDraft(startedAt: string, rirs: (number | undefined)[] = []): DraftSession {
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
  const [first, ...rest] = session.entries;
  return {
    ...session,
    entries: [
      {
        ...first,
        sets: first.sets.map((s, i) => ({
          ...s,
          isCompleted: true,
          isPrefilled: false,
          weightKg: 40,
          ...(rirs[i] !== undefined ? { rir: rirs[i] } : {}),
        })),
      },
      ...rest,
    ],
  };
}

function relaunch(): void {
  __simulateProcessRestart();
  __closeDb();
  useWorkoutHistory.setState({ workouts: [], numbering: null });
  useWorkoutHistory.getState().reloadHistory();
}

beforeEach(async () => {
  __resetDatabases();
  __closeDb();
  useWorkoutHistory.setState({ workouts: [], numbering: null, loadFailed: false });
  useWorkoutHistory.getState().clearHistory();
  useLibrary.getState().restoreSeedLibrary();
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
  await AsyncStorage.clear();
});

describe('a finished session keeps its grades', () => {
  it('writes the RIR of each graded set, and nothing for the rest', () => {
    const rows = draftToSetHistory(loggedDraft('2026-09-01T17:00:00.000Z', [2, undefined, 0]));
    expect(rows[0].rir).toBe(2);
    expect('rir' in rows[1]).toBe(false);
    expect(rows[2].rir).toBe(0);
  });

  it('never writes a value off the scale', () => {
    const rows = draftToSetHistory(loggedDraft('2026-09-01T17:00:00.000Z', [37, Number.NaN]));
    expect('rir' in rows[0]).toBe(false);
    expect('rir' in rows[1]).toBe(false);
    // ...and the sets themselves are still there.
    expect(rows[0].count).toBeGreaterThan(0);
  });

  it('round-trips through SQLite and survives a relaunch', () => {
    const saved = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-09-01T17:00:00.000Z', [1.5, undefined]));
    if (!saved) throw new Error('nothing saved');

    const [read] = readAllWorkouts() as CompletedWorkout[];
    expect(read.sets[0].rir).toBe(1.5);
    expect('rir' in read.sets[1]).toBe(false);

    relaunch();
    const [after] = useWorkoutHistory.getState().workouts;
    expect(after.sets[0].rir).toBe(1.5);
    expect('rir' in after.sets[1]).toBe(false);
  });
});

describe('correcting the grade of a logged set', () => {
  it('sets, changes and clears it, and keeps it across a relaunch', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-09-01T17:00:00.000Z'));
    if (!saved) throw new Error('nothing saved');
    const rowId = saved.sets[0].id;
    const rowOf = () =>
      useWorkoutHistory.getState().workouts[0].sets.find((s) => s.id === rowId) as SetHistory;

    expect(useWorkoutHistory.getState().updateWorkoutSet(saved.id, rowId, { rir: 2 })).toBe(true);
    expect(rowOf().rir).toBe(2);
    useWorkoutHistory.getState().updateWorkoutSet(saved.id, rowId, { rir: 0.5 });
    relaunch();
    expect(rowOf().rir).toBe(0.5);

    useWorkoutHistory.getState().updateWorkoutSet(saved.id, rowId, { rir: null });
    expect('rir' in rowOf()).toBe(false);
    relaunch();
    expect('rir' in rowOf()).toBe(false);
  });

  it('refuses a value off the scale and leaves the set as it was', () => {
    const saved = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-09-01T17:00:00.000Z', [3]));
    if (!saved) throw new Error('nothing saved');
    useWorkoutHistory.getState().updateWorkoutSet(saved.id, saved.sets[0].id, { rir: 37 });
    expect(useWorkoutHistory.getState().workouts[0].sets[0].rir).toBe(3);
  });
});

describe('the sanitizer', () => {
  it('drops an invalid RIR and keeps the set', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-09-01T17:00:00.000Z'));
    if (!saved) throw new Error('nothing saved');
    const raw = {
      ...saved,
      sets: saved.sets.map((row, i) => ({ ...row, rir: [37, Number.NaN, '2', -1][i] ?? 4 })),
    };
    useWorkoutHistory.getState().importWorkouts([raw]);
    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.sets).toHaveLength(saved.sets.length);
    for (const row of workout.sets.slice(0, 4)) expect('rir' in row).toBe(false);
    if (workout.sets[4]) expect(workout.sets[4].rir).toBe(4);
  });
});

describe('a database that predates the column', () => {
  it('opens, reads every old set with no RIR, and then stores one', () => {
    /*
     * The 2.2.0 schema, byte for byte where it matters: `set_history` with no `rir`
     * column. A real file on disk, then a cold start — exactly what an upgraded
     * phone does on its first launch.
     */
    __resetDatabases();
    __closeDb();
    const old = openDatabaseSync(DB_NAME);
    old.execSync(`
      CREATE TABLE workouts (
        id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, routine_id TEXT,
        started_at TEXT NOT NULL, ended_at TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
        set_count INTEGER NOT NULL, total_volume_kg INTEGER NOT NULL,
        volume_is_partial INTEGER NOT NULL, exercises_json TEXT NOT NULL, effort TEXT
      );
      CREATE TABLE set_history (
        id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
        performed_at TEXT NOT NULL, set_index INTEGER NOT NULL, weight_kg REAL,
        count REAL NOT NULL, count_unit TEXT NOT NULL, load_mode TEXT NOT NULL,
        is_warmup INTEGER NOT NULL, rest_taken_seconds INTEGER,
        FOREIGN KEY (session_id) REFERENCES workouts(id) ON DELETE CASCADE
      );
      INSERT INTO workouts VALUES ('w_old', 'Pull', NULL, '2026-08-01T17:00:00.000Z',
        '2026-08-01T18:00:00.000Z', 60, 2, 0, 0, '[]', NULL);
      INSERT INTO set_history VALUES
        ('r1', 'w_old', 'ex_pullup_90', '2026-08-01T17:00:00.000Z', 0, 20, 5, 'reps', 'added_bodyweight', 1, NULL),
        ('r2', 'w_old', 'ex_pullup_90', '2026-08-01T17:00:00.000Z', 1, 40, 4, 'reps', 'added_bodyweight', 0, 95);
    `);

    relaunch();

    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.id).toBe('w_old');
    expect(workout.sets.map((s) => [s.id, s.isWarmup, s.count, s.weightKg])).toEqual([
      ['r1', true, 5, 20],
      ['r2', false, 4, 40],
    ]);
    expect(workout.sets[1].restTakenSeconds).toBe(95);
    expect(workout.sets.every((s) => !('rir' in s))).toBe(true);

    // The column was added, so a grade can be written into the old log now.
    expect(useWorkoutHistory.getState().updateWorkoutSet('w_old', 'r2', { rir: 1 })).toBe(true);
    relaunch();
    expect(useWorkoutHistory.getState().workouts[0].sets[1].rir).toBe(1);
    expect(useWorkoutHistory.getState().workouts[0].sets[0].isWarmup).toBe(true);
  });
});

describe('the backup', () => {
  it('a 2.2.0 backup, written before the field existed, imports unchanged', () => {
    const v220Set = {
      id: 'r1',
      sessionId: 'w1',
      exerciseId: 'ex_pullup_90',
      performedAt: '2026-08-01T17:00:00.000Z',
      setIndex: 0,
      weightKg: 40,
      count: 4,
      countUnit: 'reps',
      loadMode: 'added_bodyweight',
      isWarmup: false,
      isCompleted: true,
      restTakenSeconds: 90,
    };
    const text = JSON.stringify({
      format: 'workout-tracker-backup',
      version: 2,
      exercises: seedExercises,
      routines: [],
      workouts: [
        {
          id: 'w1',
          title: 'Pull',
          startedAt: '2026-08-01T17:00:00.000Z',
          endedAt: '2026-08-01T18:00:00.000Z',
          durationMinutes: 60,
          setCount: 1,
          totalVolumeKg: 0,
          volumeIsPartial: true,
          exercises: [
            {
              exerciseId: 'ex_pullup_90',
              name: 'Weighted 90° pull-ups',
              countUnit: 'reps',
              loadMode: 'added_bodyweight',
              setCount: 1,
              summary: '+40 kg · 4',
              totalCount: 4,
              topWeightKg: 40,
            },
          ],
          sets: [v220Set],
        },
      ],
    });
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);

    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.sets).toEqual([v220Set]);
    expect(workout.exercises[0].summary).toBe('+40 kg · 4');
  });

  it('a graded set travels in a backup and comes back', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-09-01T17:00:00.000Z', [2, 0.5]));
    const text = exportBackupText();
    useWorkoutHistory.getState().clearHistory();

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.sets[0].rir).toBe(2);
    expect(workout.sets[1].rir).toBe(0.5);
    relaunch();
    expect(useWorkoutHistory.getState().workouts[0].sets[1].rir).toBe(0.5);
  });
});

describe('grading a set in the live session', () => {
  function start(): DraftSession {
    useActiveWorkout.getState().discardSession();
    useActiveWorkout.getState().startSession({
      routine: seedRoutine,
      exercisesById,
      historyByExerciseId: fixtureHistoryByExerciseId,
      policy: seedUser.overloadPolicy,
      unitSystem: 'metric',
      defaultRestSeconds: 120,
      defaultTransitionRestSeconds: 150,
    });
    const session = useActiveWorkout.getState().session;
    if (!session) throw new Error('no session');
    return session;
  }

  it('sets and clears the RIR without turning the prefill off', () => {
    const session = start();
    const entry = session.entries[0];
    const setId = entry.sets[0].localId;
    const row = () => useActiveWorkout.getState().session?.entries[0].sets[0];

    useActiveWorkout.getState().markSet(entry.localId, setId, { rir: 1 });
    expect(row()?.rir).toBe(1);
    expect(row()?.isPrefilled).toBe(entry.sets[0].isPrefilled);
    expect(row()?.weightKg).toBe(entry.sets[0].weightKg);
    expect(row()?.count).toBe(entry.sets[0].count);

    useActiveWorkout.getState().markSet(entry.localId, setId, { rir: null });
    expect(row() && 'rir' in row()!).toBe(false);
  });

  it('is never prefilled from last session', () => {
    const session = start();
    expect(session.entries.every((e) => e.sets.every((s) => !('rir' in s)))).toBe(true);
  });

  it('drops an invalid RIR from a persisted session and keeps the set', async () => {
    const session = start();
    const [first, ...rest] = session.entries;
    const broken = {
      ...session,
      entries: [
        {
          ...first,
          sets: first.sets.map((s, i) => (i === 0 ? { ...s, rir: 37 } : { ...s, rir: 2 })),
        },
        ...rest,
      ],
    };
    await AsyncStorage.setItem(
      'active-workout',
      JSON.stringify({
        state: { session: broken, activeEntryId: first.localId, rest: NO_REST, setTimer: null },
        version: 2,
      }),
    );
    await useActiveWorkout.persist.rehydrate();
    const sets = useActiveWorkout.getState().session?.entries[0].sets ?? [];
    expect(sets).toHaveLength(first.sets.length);
    expect('rir' in sets[0]).toBe(false);
    if (sets[1]) expect(sets[1].rir).toBe(2);
  });
});
