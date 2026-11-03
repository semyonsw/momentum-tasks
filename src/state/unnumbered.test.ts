import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { __closeDb } from './historyDb';
import { useWorkoutHistory } from './workoutHistoryStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { useLibrary } from './libraryStore';
import { applyBackup, exportBackupText } from './dataTransfer';
import { parseBackup } from '../lib/backup';
import { workoutNumbers, yearNumbers } from '../lib/completedWorkout';
import { seedExercises } from '../data/seed';
import { __resetDatabases, __simulateProcessRestart } from '../../test/expoSqliteStub';

/**
 * Workouts kept OUT OF THE COUNT, wherever they are persisted.
 *
 * The case this exists for: a 2024 notebook imported under a log whose workout 1
 * was January 2026. Those sessions belong in History and must not take numbers —
 * through a restore, a relaunch (the SQLite column), and the next backup out.
 */

function relaunch(): void {
  __simulateProcessRestart();
  __closeDb();
  useWorkoutHistory.setState({ workouts: [], numbering: null });
  useWorkoutHistory.getState().reloadHistory();
}

/** One workout in backup shape; `note` adds an exercise line with no rows. */
function backupWorkout(id: string, startedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    startedAt,
    endedAt: startedAt,
    durationMinutes: 60,
    setCount: 1,
    totalVolumeKg: 0,
    volumeIsPartial: true,
    exercises: [
      {
        exerciseId: 'ex_pushups',
        name: 'Push-ups',
        countUnit: 'reps',
        loadMode: 'none',
        setCount: 1,
        summary: '32',
        totalCount: 32,
        topWeightKg: null,
      },
      {
        exerciseId: 'ex_note',
        name: 'Neck Stand + Shrungs',
        countUnit: 'reps',
        loadMode: 'none',
        setCount: 0,
        summary: '3×',
        totalCount: 0,
        topWeightKg: null,
      },
    ],
    sets: [
      {
        id: `${id}_s0`,
        sessionId: id,
        exerciseId: 'ex_pushups',
        performedAt: startedAt,
        setIndex: 0,
        weightKg: null,
        count: 32,
        countUnit: 'reps',
        loadMode: 'none',
        isWarmup: false,
        isCompleted: true,
      },
    ],
    ...extra,
  };
}

function restore(): void {
  const text = JSON.stringify({
    format: 'workout-tracker-backup',
    version: 2,
    exercises: seedExercises,
    routines: [],
    workouts: [
      backupWorkout('old', '2024-09-03T02:00:00.000Z', { unnumbered: true }),
      backupWorkout('w32', '2026-02-23T12:00:00.000Z'),
      backupWorkout('w33', '2026-02-26T12:00:00.000Z'),
      backupWorkout('w34', '2027-01-03T12:00:00.000Z'),
    ],
    numbering: { workoutId: 'w33', number: 33 },
  });
  const parsed = parseBackup(text);
  if (!parsed.ok) throw new Error(parsed.error);
  applyBackup(parsed.envelope);
}

function currentNumbers() {
  const { workouts, numbering } = useWorkoutHistory.getState();
  const numbers = workoutNumbers(workouts, numbering);
  return { numbers, years: yearNumbers(workouts, numbers) };
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

describe('a workout kept out of the count', () => {
  it('restores in History with no number, and the count around it is unbroken', () => {
    restore();
    const old = useWorkoutHistory.getState().workouts.find((w) => w.id === 'old');
    expect(old?.unnumbered).toBe(true);
    const { numbers, years } = currentNumbers();
    expect(numbers).toEqual({ w32: 32, w33: 33, w34: 34 });
    expect(years).toEqual({ w32: 32, w33: 33, w34: 1 });
  });

  it('survives a relaunch — the flag is a column, not memory', () => {
    restore();
    relaunch();
    const workouts = useWorkoutHistory.getState().workouts;
    expect(workouts.find((w) => w.id === 'old')?.unnumbered).toBe(true);
    // Counted workouts come back without the key at all, not as `false`.
    expect('unnumbered' in (workouts.find((w) => w.id === 'w32') ?? {})).toBe(false);
  });

  it('travels out in the next backup', () => {
    restore();
    const text = exportBackupText();
    useWorkoutHistory.getState().clearHistory();
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(currentNumbers().numbers).toEqual({ w32: 32, w33: 33, w34: 34 });
  });

  it('keeps an imported note line through a correction elsewhere in the workout', () => {
    restore();
    useWorkoutHistory.getState().updateWorkoutSet('w32', 'w32_s0', { count: 30 });
    const w32 = useWorkoutHistory.getState().workouts.find((w) => w.id === 'w32');
    expect(w32?.exercises.map((e) => e.summary)).toEqual(['30', '3×']);
  });

  it('cannot take the pin', () => {
    restore();
    useWorkoutHistory.getState().setWorkoutNumber('old', 1);
    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: 'w33', number: 33 });
  });

  it('is passed over when the pinned workout is deleted', () => {
    restore();
    useWorkoutHistory.getState().setWorkoutNumber('w32', 32);
    useWorkoutHistory.getState().deleteWorkout('w32');
    // The heir is w33 (newer), never the unnumbered session older than it.
    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: 'w33', number: 33 });
  });
});
