import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { NO_REST, useActiveWorkout } from './activeWorkoutStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { useLibrary } from './libraryStore';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import type { Exercise, ID } from '../types/models';

/**
 * The warm-up offer, end to end through the store — the user's report, as a test:
 * "the first set is 60 for warm-up, I press done, and every heavier set becomes 60".
 */

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

/** A session whose first weighted exercise is planned 60 · 80 · 80 · 80. */
function start(weights: number[] = [60, 80, 80, 80]): { entryId: ID; setIds: ID[] } {
  const session = buildDraftSession({
    routine: seedRoutine,
    exercisesById,
    historyByExerciseId: {},
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    startedAt: '2026-10-29T17:00:00.000Z',
  });
  const index = session.entries.findIndex((e) => e.exercise.requiresWeight && !e.ladder);
  const entry = session.entries[index];
  const sets = weights.map((w, i) => ({
    ...(entry.sets[i] ?? entry.sets[0]),
    localId: `s${i}`,
    weightKg: w,
    count: 8,
    isPrefilled: true,
  }));
  const entries = [...session.entries];
  entries[index] = { ...entry, sets };
  const next: DraftSession = { ...session, entries };
  useActiveWorkout.setState({
    session: next,
    activeEntryId: entry.localId,
    rest: NO_REST,
    setTimer: null,
    roundsAuto: null,
    warmupOffer: null,
  });
  return { entryId: entry.localId, setIds: sets.map((s) => s.localId) };
}

function rows(entryId: ID) {
  return useActiveWorkout.getState().session!.entries.find((e) => e.localId === entryId)!.sets;
}

beforeEach(async () => {
  useLibrary.getState().restoreSeedLibrary();
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
  await AsyncStorage.clear();
});

describe('warm-up offer through the store', () => {
  it('a light first ✓ carries down AND raises the offer', () => {
    const { entryId, setIds } = start();
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    expect(rows(entryId).map((s) => s.weightKg)).toEqual([60, 60, 60, 60]);
    expect(useActiveWorkout.getState().warmupOffer).toMatchObject({ setId: 's0', keepKg: 80 });
  });

  it('accepting marks the warm-up and puts 80 back on every working row', () => {
    const { entryId, setIds } = start();
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    useActiveWorkout.getState().acceptWarmupOffer();
    const sets = rows(entryId);
    expect(sets.map((s) => s.weightKg)).toEqual([60, 80, 80, 80]);
    expect(sets[0].isWarmup).toBe(true);
    expect(sets[0].isCompleted).toBe(true);
    expect(useActiveWorkout.getState().warmupOffer).toBeNull();
  });

  it('accepting puts back the library starting weight the ✓ overwrote', () => {
    const { entryId, setIds } = start();
    const exerciseId = useActiveWorkout
      .getState()
      .session!.entries.find((e) => e.localId === entryId)!.exercise.id;
    useLibrary.getState().setExerciseDefaultWeight(exerciseId, 80);
    useActiveWorkout.setState((s) => ({
      session: {
        ...s.session!,
        entries: s.session!.entries.map((e) =>
          e.localId === entryId ? { ...e, exercise: { ...e.exercise, defaultWeightKg: 80 } } : e,
        ),
      },
    }));
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    const libraryAfterTick = useLibrary.getState().exercises.find((e) => e.id === exerciseId);
    expect(libraryAfterTick?.defaultWeightKg).toBe(60);
    useActiveWorkout.getState().acceptWarmupOffer();
    const libraryAfterAccept = useLibrary.getState().exercises.find((e) => e.id === exerciseId);
    expect(libraryAfterAccept?.defaultWeightKg).toBe(80);
  });

  it('marking the set a warm-up from its sheet is the same answer as the chip', () => {
    const { entryId, setIds } = start();
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    useActiveWorkout.getState().markSet(entryId, setIds[0], { kind: 'warmup' });
    expect(rows(entryId).map((s) => s.weightKg)).toEqual([60, 80, 80, 80]);
    expect(rows(entryId)[0].isWarmup).toBe(true);
  });

  it('a row already marked W before the ✓ never carries and never asks', () => {
    const { entryId, setIds } = start();
    useActiveWorkout.getState().markSet(entryId, setIds[0], { kind: 'warmup' });
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    expect(rows(entryId).map((s) => s.weightKg)).toEqual([60, 80, 80, 80]);
    expect(useActiveWorkout.getState().warmupOffer).toBeNull();
  });

  it('dismissing keeps the carried weights — a lighter day stays a lighter day', () => {
    const { entryId, setIds } = start();
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    useActiveWorkout.getState().dismissWarmupOffer();
    expect(rows(entryId).map((s) => s.weightKg)).toEqual([60, 60, 60, 60]);
    expect(rows(entryId)[0].isWarmup).toBe(false);
  });

  it('the next ✓ replaces the question, and an undo withdraws it', () => {
    const { entryId, setIds } = start();
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    useActiveWorkout.getState().completeSet(entryId, setIds[1]);
    expect(useActiveWorkout.getState().warmupOffer).toBeNull();

    const again = start();
    useActiveWorkout.getState().completeSet(again.entryId, again.setIds[0]);
    useActiveWorkout.getState().uncompleteSet(again.entryId, again.setIds[0]);
    expect(useActiveWorkout.getState().warmupOffer).toBeNull();
  });

  it('a first set near the plan raises nothing', () => {
    const { entryId, setIds } = start([77.5, 80, 80]);
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    expect(useActiveWorkout.getState().warmupOffer).toBeNull();
  });

  it('un-ticking the set takes the carry back, so a W after it keeps the 80s', () => {
    const { entryId, setIds } = start();
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    useActiveWorkout.getState().uncompleteSet(entryId, setIds[0]);
    expect(rows(entryId).map((s) => s.weightKg)).toEqual([60, 80, 80, 80]);
    useActiveWorkout.getState().markSet(entryId, setIds[0], { kind: 'warmup' });
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    expect(rows(entryId).map((s) => s.weightKg)).toEqual([60, 80, 80, 80]);
  });

  it('a movement with no starting weight does not keep the warm-up as one', () => {
    const { entryId, setIds } = start();
    const exerciseId = useActiveWorkout
      .getState()
      .session!.entries.find((e) => e.localId === entryId)!.exercise.id;
    const plain = useLibrary.getState().exercises.find((e) => e.id === exerciseId)!;
    const { defaultWeightKg: _none, ...rest } = plain;
    useLibrary.getState().updateExercise(exerciseId, rest);
    useActiveWorkout.setState((st) => ({
      session: {
        ...st.session!,
        entries: st.session!.entries.map((e) =>
          e.localId === entryId
            ? { ...e, exercise: { ...e.exercise, defaultWeightKg: undefined } }
            : e,
        ),
      },
    }));
    useActiveWorkout.getState().completeSet(entryId, setIds[0]);
    expect(useLibrary.getState().exercises.find((e) => e.id === exerciseId)?.defaultWeightKg).toBe(
      60,
    );
    useActiveWorkout.getState().acceptWarmupOffer();
    expect(
      useLibrary.getState().exercises.find((e) => e.id === exerciseId)?.defaultWeightKg,
    ).toBeUndefined();
  });
});
