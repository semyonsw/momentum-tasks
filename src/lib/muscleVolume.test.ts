import { describe, expect, it } from 'vitest';

import { clusterBalance } from './balance';
import type { CompletedWorkout } from './completedWorkout';
import {
  formatSets,
  inWeek,
  isoWeek,
  muscleHeat,
  muscleVolume,
  SECONDARY_SHARE,
  targetNote,
} from './muscleVolume';
import type { Exercise, SetHistory } from '../types/models';

/**
 * The muscle map's counts. What matters: the half rule for secondary muscles,
 * that the cluster figures ARE the sets-per-cluster screen's (so a weekly target
 * meets the count it was typed against), warm-ups out, and the ISO week read in
 * the LOCAL day the user trained.
 */

function exercise(id: string, muscleGroups: Exercise['muscleGroups']): Exercise {
  return {
    id,
    ownerId: 'u1',
    name: id,
    muscleGroups,
    requiresWeight: false,
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const library = Object.fromEntries(
  [
    exercise('bench', ['chest', 'triceps', 'shoulders']),
    exercise('pullup', ['back', 'biceps']),
    exercise('curl', ['biceps']),
    exercise('squat', ['quads', 'glutes', 'hamstrings']),
    exercise('plank', ['core']),
    exercise('swim', ['cardio']),
    exercise('twice', ['chest', 'chest', 'triceps', 'triceps']),
  ].map((e) => [e.id, e]),
);

/** A LOCAL wall-clock instant, so the tests hold in any time zone. */
const local = (y: number, m: number, d: number, h = 18, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

function row(exerciseId: string, i: number, overrides: Partial<SetHistory> = {}): SetHistory {
  return {
    id: `${exerciseId}-${i}`,
    sessionId: 'w',
    exerciseId,
    performedAt: local(2026, 9, 30),
    setIndex: i,
    weightKg: null,
    count: 10,
    countUnit: 'reps',
    loadMode: 'none',
    isWarmup: false,
    isCompleted: true,
    ...overrides,
  };
}

function workout(id: string, startedAt: string, sets: SetHistory[]): CompletedWorkout {
  return {
    id,
    title: 'Session',
    startedAt,
    endedAt: startedAt,
    durationMinutes: 60,
    setCount: sets.length,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: [],
    sets: sets.map((s) => ({ ...s, sessionId: id })),
  };
}

const sets = (exerciseId: string, n: number, overrides: Partial<SetHistory> = {}) =>
  Array.from({ length: n }, (_, i) => row(exerciseId, i, overrides));

describe('secondary muscles count half', () => {
  it('gives the primary 1 and each secondary ½ per working set', () => {
    const v = muscleVolume({
      workouts: [workout('w1', local(2026, 9, 30), sets('bench', 4))],
      exercisesById: library,
      day: '2026-10-01',
    });
    expect(SECONDARY_SHARE).toBe(0.5);
    expect(v.muscles.chest).toBe(4);
    expect(v.muscles.triceps).toBe(2);
    expect(v.muscles.shoulders).toBe(2);
    expect(v.muscles.back).toBe(0);
  });

  it('adds primary and secondary work on the same muscle', () => {
    const v = muscleVolume({
      workouts: [workout('w1', local(2026, 9, 29), [...sets('pullup', 3), ...sets('curl', 3)])],
      exercisesById: library,
      day: '2026-09-29',
    });
    expect(v.muscles.biceps).toBe(4.5);
    expect(formatSets(v.muscles.biceps)).toBe('4.5');
    expect(formatSets(v.muscles.back)).toBe('3');
  });

  it('a one-muscle exercise has no secondaries, and a muscle listed twice counts once', () => {
    const v = muscleVolume({
      workouts: [workout('w1', local(2026, 9, 29), [...sets('plank', 2), ...sets('twice', 2)])],
      exercisesById: library,
      day: '2026-09-29',
    });
    expect(v.muscles.core).toBe(2);
    expect(v.muscles.chest).toBe(2);
    expect(v.muscles.triceps).toBe(1);
  });

  it('an exercise deleted since lands in unfiled, not on the body', () => {
    const v = muscleVolume({
      workouts: [workout('w1', local(2026, 9, 29), [...sets('gone', 3), ...sets('curl', 1)])],
      exercisesById: library,
      day: '2026-09-29',
    });
    expect(v.unfiled).toBe(3);
    expect(v.totalSets).toBe(4);
    expect(Object.values(v.muscles).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('cluster sums match the sets-per-cluster screen', () => {
  it('equals clusterBalance over the same week’s workouts, primary only', () => {
    const week = [
      workout('w1', local(2026, 9, 28, 7), [
        ...sets('bench', 5),
        ...sets('squat', 4),
        ...sets('bench', 1, { isWarmup: true }),
      ]),
      workout('w2', local(2026, 10, 2), [
        ...sets('pullup', 6),
        ...sets('curl', 3),
        ...sets('swim', 1),
      ]),
      workout('w3', local(2026, 10, 4, 23, 30), [...sets('plank', 3), ...sets('gone', 2)]),
    ];
    const outside = workout('w0', local(2026, 9, 27, 23, 30), sets('bench', 9));
    const v = muscleVolume({
      workouts: [...week, outside],
      exercisesById: library,
      day: '2026-10-01',
    });
    const screen = clusterBalance({ workouts: week, exercisesById: library, windowDays: null });

    expect(v.clusters).toEqual(Object.fromEntries(screen.clusters.map((c) => [c.cluster, c.sets])));
    expect(v.clusters).toEqual({ push: 5, pull: 9, legs: 4, core: 3, cardio: 1, skill: 0 });
    expect(v.unfiled).toBe(screen.unfiled);
    expect(v.totalSets).toBe(screen.totalSets);
  });

  it('the half rule never leaks into the cluster count', () => {
    const v = muscleVolume({
      workouts: [workout('w1', local(2026, 9, 30), sets('bench', 4))],
      exercisesById: library,
      day: '2026-09-30',
    });
    // triceps and shoulders got 2 each on the map; push is still 4 sets.
    expect(v.clusters.push).toBe(4);
  });
});

describe('warm-ups excluded', () => {
  it('counts no warm-up and no unfinished set, but counts drop/failure/AMRAP', () => {
    const v = muscleVolume({
      workouts: [
        workout('w1', local(2026, 9, 30), [
          ...sets('bench', 2, { isWarmup: true }),
          ...sets('bench', 1, { isCompleted: false }),
          row('bench', 7, { setType: 'drop' }),
          row('bench', 8, { setType: 'failure' }),
          row('bench', 9),
        ]),
      ],
      exercisesById: library,
      day: '2026-09-30',
    });
    expect(v.muscles.chest).toBe(3);
    expect(v.muscles.triceps).toBe(1.5);
    expect(v.clusters.push).toBe(3);
  });
});

describe('week boundaries (ISO, local)', () => {
  it('runs Monday to Sunday', () => {
    expect(isoWeek('2026-10-01')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(isoWeek('2026-09-28')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(isoWeek('2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    // across a year seam
    expect(isoWeek('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('places Monday 00:10 in and Sunday 23:50 the week before out — by the local day', () => {
    const week = isoWeek('2026-10-01');
    expect(inWeek({ startedAt: local(2026, 9, 28, 0, 10) }, week)).toBe(true);
    expect(inWeek({ startedAt: local(2026, 10, 4, 23, 50) }, week)).toBe(true);
    expect(inWeek({ startedAt: local(2026, 9, 27, 23, 50) }, week)).toBe(false);
    expect(inWeek({ startedAt: local(2026, 10, 5, 0, 10) }, week)).toBe(false);
  });

  it('an empty week is all zeroes, not an empty map', () => {
    const v = muscleVolume({ workouts: [], exercisesById: library, day: '2026-10-01' });
    expect(v.muscles.chest).toBe(0);
    expect(Object.keys(v.muscles)).toContain('calves');
    expect(v.totalSets).toBe(0);
  });
});

describe('the heat steps and the target line', () => {
  it('cuts at 0 / 1–4 / 5–9 / 10–14 / 15+, halves included', () => {
    expect([0, 0.5, 4, 4.5, 5, 9.5, 10, 14.5, 15, 40].map(muscleHeat)).toEqual([
      0, 1, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });

  it('says how far from the target, or by how much it is met, or nothing without one', () => {
    expect(targetNote(14, 16)).toEqual({ kind: 'short', left: 2 });
    expect(targetNote(16, 16)).toEqual({ kind: 'met', over: 0 });
    expect(targetNote(19, 16)).toEqual({ kind: 'met', over: 3 });
    expect(targetNote(5, undefined)).toBeNull();
    expect(targetNote(0, 0)).toEqual({ kind: 'met', over: 0 });
  });
});
