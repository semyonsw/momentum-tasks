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
import { setKindOf, withKind, type SetKind } from '../lib/setType';

/**
 * T-12 · set types, wherever they are PERSISTED.
 *
 * Two promises, and the second is the one that matters: a drop / failure / AMRAP
 * set comes back as what it was (SQLite, a relaunch, a backup), and the WARM-UP
 * FLAG on old data — a 2.2.0 backup, a database that predates the column — means
 * warm-up exactly as it always did, and can never be lost to a type.
 */

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function loggedDraft(startedAt: string, kinds: (SetKind | undefined)[] = []): DraftSession {
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
          ...(kinds[i] ? withKind({ isWarmup: false }, kinds[i]) : {}),
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

describe('a finished session keeps its set types', () => {
  it('writes each type, and the warm-up flag, exactly', () => {
    const rows = draftToSetHistory(
      loggedDraft('2026-09-01T17:00:00.000Z', ['warmup', 'failure', 'amrap', 'drop']),
    );
    expect(rows.slice(0, 4).map(setKindOf)).toEqual(['warmup', 'failure', 'amrap', 'drop']);
    expect('setType' in rows[0]).toBe(false);
  });

  it('round-trips through SQLite and survives a relaunch', () => {
    useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-09-01T17:00:00.000Z', ['warmup', 'drop', undefined]));
    const [read] = readAllWorkouts() as CompletedWorkout[];
    expect(read.sets.slice(0, 3).map(setKindOf)).toEqual(['warmup', 'drop', 'working']);
    relaunch();
    const [after] = useWorkoutHistory.getState().workouts;
    expect(after.sets.slice(0, 3).map(setKindOf)).toEqual(['warmup', 'drop', 'working']);
    expect(after.exercises[0].summary).toContain('D');
  });
});

describe("correcting a logged set's type", () => {
  it('changes the kind, keeps it across a relaunch, and never strands a type on a warm-up', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-09-01T17:00:00.000Z'));
    if (!saved) throw new Error('nothing saved');
    const rowId = saved.sets[1].id;
    const rowOf = () =>
      useWorkoutHistory.getState().workouts[0].sets.find((s) => s.id === rowId) as SetHistory;

    useWorkoutHistory.getState().updateWorkoutSet(saved.id, rowId, { kind: 'failure' });
    expect(setKindOf(rowOf())).toBe('failure');
    relaunch();
    expect(setKindOf(rowOf())).toBe('failure');

    // The old warm-up toggle path still works, and takes the type with it.
    useWorkoutHistory.getState().updateWorkoutSet(saved.id, rowId, { isWarmup: true });
    expect(rowOf().isWarmup).toBe(true);
    expect('setType' in rowOf()).toBe(false);

    useWorkoutHistory.getState().updateWorkoutSet(saved.id, rowId, { kind: 'working' });
    expect(setKindOf(rowOf())).toBe('working');
  });

  it('recomputes the shorthand with the mark', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-09-01T17:00:00.000Z'));
    if (!saved) throw new Error('nothing saved');
    const last = saved.sets.filter((s) => s.exerciseId === saved.sets[0].exerciseId).at(-1);
    if (!last) throw new Error('no rows');
    useWorkoutHistory.getState().updateWorkoutSet(saved.id, last.id, { kind: 'amrap' });
    expect(useWorkoutHistory.getState().workouts[0].exercises[0].summary).toMatch(/\+$/);
  });
});

describe('the sanitizer', () => {
  it('drops an unknown type and a type on a warm-up, keeping the set and the flag', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-09-01T17:00:00.000Z'));
    if (!saved) throw new Error('nothing saved');
    const raw = {
      ...saved,
      sets: saved.sets.map((row, i) =>
        i === 0
          ? { ...row, isWarmup: true, setType: 'drop' }
          : i === 1
            ? { ...row, setType: 'superset' }
            : i === 2
              ? { ...row, setType: 'failure' }
              : row,
      ),
    };
    useWorkoutHistory.getState().importWorkouts([raw]);
    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.sets).toHaveLength(saved.sets.length);
    expect(setKindOf(workout.sets[0])).toBe('warmup');
    expect('setType' in workout.sets[0]).toBe(false);
    expect('setType' in workout.sets[1]).toBe(false);
    expect(workout.sets[2].setType).toBe('failure');
  });
});

describe('a database that predates the column', () => {
  it('reads old warm-ups as warm-ups and accepts a type afterwards', () => {
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
        ('r2', 'w_old', 'ex_pullup_90', '2026-08-01T17:00:00.000Z', 1, 40, 4, 'reps', 'added_bodyweight', 0, NULL);
    `);
    relaunch();

    const sets = () => useWorkoutHistory.getState().workouts[0].sets;
    expect(sets().map(setKindOf)).toEqual(['warmup', 'working']);
    expect(useWorkoutHistory.getState().updateWorkoutSet('w_old', 'r2', { kind: 'failure' })).toBe(
      true,
    );
    relaunch();
    expect(sets().map(setKindOf)).toEqual(['warmup', 'failure']);
  });
});

describe('the backup', () => {
  it('a 2.2.0 backup with warm-ups imports unchanged, warm-ups still warm-ups', () => {
    const base = {
      sessionId: 'w1',
      exerciseId: 'ex_pullup_90',
      performedAt: '2026-08-01T17:00:00.000Z',
      countUnit: 'reps',
      loadMode: 'added_bodyweight',
      isCompleted: true,
    };
    const v220Sets = [
      { ...base, id: 'r1', setIndex: 0, weightKg: 20, count: 5, isWarmup: true },
      { ...base, id: 'r2', setIndex: 1, weightKg: 40, count: 4, isWarmup: false },
    ];
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
          sets: v220Sets,
        },
      ],
    });
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);

    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.sets).toEqual(v220Sets);
    expect(workout.sets.map(setKindOf)).toEqual(['warmup', 'working']);
    relaunch();
    expect(useWorkoutHistory.getState().workouts[0].sets.map(setKindOf)).toEqual([
      'warmup',
      'working',
    ]);
  });

  it('every kind travels in a backup and comes back', () => {
    const kinds: SetKind[] = ['warmup', 'drop', 'failure', 'amrap'];
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-09-01T17:00:00.000Z', kinds));
    const text = exportBackupText();
    useWorkoutHistory.getState().clearHistory();

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useWorkoutHistory.getState().workouts[0].sets.slice(0, 4).map(setKindOf)).toEqual(kinds);
  });
});

describe('typing a set in the live session', () => {
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

  it('sets every kind without touching the numbers or the prefill', () => {
    const session = start();
    const entry = session.entries[0];
    const setId = entry.sets[0].localId;
    const row = () => useActiveWorkout.getState().session?.entries[0].sets[0];
    for (const kind of ['drop', 'warmup', 'amrap', 'failure', 'working'] as SetKind[]) {
      useActiveWorkout.getState().markSet(entry.localId, setId, { kind });
      expect(row() && setKindOf(row()!)).toBe(kind);
      expect(row()?.isPrefilled).toBe(entry.sets[0].isPrefilled);
      expect(row()?.weightKg).toBe(entry.sets[0].weightKg);
    }
  });

  it('is never prefilled from last session', () => {
    const session = start();
    expect(session.entries.every((e) => e.sets.every((s) => !('setType' in s)))).toBe(true);
  });

  it('drops a bad type from a persisted session and keeps the warm-up flag', async () => {
    const session = start();
    const [first, ...rest] = session.entries;
    const broken = {
      ...session,
      entries: [
        {
          ...first,
          sets: first.sets.map((s, i) =>
            i === 0
              ? { ...s, isWarmup: true, setType: 'amrap' }
              : i === 1
                ? { ...s, setType: 'nonsense' }
                : { ...s, setType: 'drop' },
          ),
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
    expect(setKindOf(sets[0])).toBe('warmup');
    expect('setType' in sets[0]).toBe(false);
    if (sets[1]) expect(setKindOf(sets[1])).toBe('working');
    if (sets[2]) expect(setKindOf(sets[2])).toBe('drop');
  });
});
