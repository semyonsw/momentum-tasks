import { beforeEach, describe, expect, it } from 'vitest';

import { NO_REST, useActiveWorkout } from './activeWorkoutStore';
import { useLibrary } from './libraryStore';
import { buildDraftSession } from '../lib/draft';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import type { Exercise, ID } from '../types/models';

/** Edit mode's ⋮⋮ through the store: the plan moves, the history does not. */

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function start(weights: number[]): ID {
  const session = buildDraftSession({
    routine: seedRoutine,
    exercisesById,
    historyByExerciseId: {},
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    startedAt: '2026-10-30T17:00:00.000Z',
  });
  const index = session.entries.findIndex((e) => e.exercise.requiresWeight && !e.ladder);
  const entry = session.entries[index];
  const entries = [...session.entries];
  entries[index] = {
    ...entry,
    sets: weights.map((w, i) => ({ ...entry.sets[0], localId: `s${i}`, weightKg: w })),
  };
  useActiveWorkout.setState({
    session: { ...session, entries },
    activeEntryId: entry.localId,
    rest: NO_REST,
    setTimer: null,
    roundsAuto: null,
    warmupOffer: null,
  });
  return entry.localId;
}

const weights = (entryId: ID) =>
  useActiveWorkout
    .getState()
    .session!.entries.find((e) => e.localId === entryId)!
    .sets.map((s) => s.weightKg);

beforeEach(() => {
  useLibrary.getState().restoreSeedLibrary();
});

describe('moveSet', () => {
  it('moves an unlogged set to another place', () => {
    const entryId = start([60, 70, 80]);
    useActiveWorkout.getState().moveSet(entryId, 's2', 0);
    expect(weights(entryId)).toEqual([80, 60, 70]);
  });

  it('never moves a logged set, nor anything into the logged part', () => {
    const entryId = start([60, 70, 80]);
    useActiveWorkout.getState().completeSet(entryId, 's0');
    const before = useActiveWorkout.getState().session;
    useActiveWorkout.getState().moveSet(entryId, 's0', 2);
    expect(useActiveWorkout.getState().session).toBe(before);
    useActiveWorkout.getState().moveSet(entryId, 's2', 0);
    expect(weights(entryId)[0]).toBe(60);
  });
});
