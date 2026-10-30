import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import { buildDraftSession, type DraftSession } from './draft';
import { DEFAULT_OVERLOAD_POLICY } from './progressiveOverload';
import {
  describeGoalShort,
  describeRunningSet,
  emptyWorkoutRoutine,
  goalPips,
  lastSession,
  nextFabExtended,
  progressSpark,
  runningSet,
} from './workoutHome';
import type { Exercise, Routine } from '../types/models';

/**
 * The Workout section's and Home's decisions (redesign #7 #8 #11 #13 #18): which
 * set the running card names, when the ▶ folds, what the sparkline draws, which
 * workout the last-session card links into, the goal's pips, and the routine an
 * empty workout is built from.
 */

function exercise(id: string, name: string): Exercise {
  return {
    id,
    ownerId: 'u1',
    name,
    muscleGroups: ['chest'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const bench = exercise('ex_bench', 'Bench press');
const fly = exercise('ex_fly', 'Cable fly');

function session(items: [Exercise, number][]): DraftSession {
  const routine: Routine = {
    id: 'r1',
    ownerId: 'u1',
    name: 'Push',
    items: items.map(([ex, targetSets], order) => ({
      id: `ri${order}`,
      exerciseId: ex.id,
      order,
      targetSets,
      targetRepsMax: 8,
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return buildDraftSession({
    routine,
    exercisesById: Object.fromEntries(items.map(([ex]) => [ex.id, ex])),
    historyByExerciseId: {},
    policy: DEFAULT_OVERLOAD_POLICY,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    now: new Date('2026-10-30T18:00:00.000Z'),
  });
}

/** Log sets by [entry, set] at increasing minutes. */
function logged(s: DraftSession, done: [number, number][]): DraftSession {
  let out = s;
  done.forEach(([e, i], minute) => {
    out = {
      ...out,
      entries: out.entries.map((entry, ei) =>
        ei === e
          ? {
              ...entry,
              sets: entry.sets.map((set, si) =>
                si === i
                  ? {
                      ...set,
                      isCompleted: true,
                      completedAt: new Date(Date.UTC(2026, 9, 30, 18, minute)).toISOString(),
                    }
                  : set,
              ),
            }
          : entry,
      ),
    };
  });
  return out;
}

describe('the running card (#7)', () => {
  it('names the up-next set among the working sets', () => {
    const s = logged(
      session([
        [bench, 4],
        [fly, 3],
      ]),
      [
        [0, 0],
        [0, 1],
      ],
    );
    expect(runningSet(s)).toEqual({ kind: 'set', exercise: 'Bench press', set: 3, of: 4 });
    expect(describeRunningSet(runningSet(s), '28:40', 'en')).toBe(
      '28:40 · Bench press, set 3 of 4',
    );
    expect(describeRunningSet(runningSet(s), '28:40', 'ru')).toBe(
      '28:40 · Bench press, подход 3 из 4',
    );
  });

  it('does not count a warm-up as set 1', () => {
    const base = session([[bench, 3]]);
    const s: DraftSession = {
      ...base,
      entries: [
        {
          ...base.entries[0],
          sets: [{ ...base.entries[0].sets[0], isWarmup: true }, ...base.entries[0].sets.slice(1)],
        },
      ],
    };
    expect(runningSet(s)).toEqual({ kind: 'warmup', exercise: 'Bench press' });
    const after = logged(s, [[0, 0]]);
    expect(runningSet(after)).toEqual({ kind: 'set', exercise: 'Bench press', set: 1, of: 2 });
  });

  it('falls back to the session count once everything is logged', () => {
    const s = logged(session([[bench, 1]]), [[0, 0]]);
    expect(runningSet(s)).toEqual({ kind: 'done', done: 1, total: 1 });
    expect(describeRunningSet(runningSet(s), '40:00', 'en')).toBe('40:00 · 1 of 1 sets');
  });

  it('is nothing without a session', () => {
    expect(runningSet(null)).toBeNull();
    expect(describeRunningSet(null, '1:00', 'en')).toBe('1:00');
  });
});

describe('the extended ▶ (#8)', () => {
  it('folds once the list moves and unfolds back at the top, with hysteresis', () => {
    expect(nextFabExtended(true, 0)).toBe(true);
    expect(nextFabExtended(true, 30)).toBe(true);
    expect(nextFabExtended(true, 40)).toBe(false);
    expect(nextFabExtended(false, 20)).toBe(false);
    expect(nextFabExtended(false, 10)).toBe(true);
    expect(nextFabExtended(false, Number.NaN)).toBe(false);
  });
});

let seq = 0;
function workout(day: string, volume: number, partial = false): CompletedWorkout {
  seq += 1;
  return {
    id: `w${seq}`,
    title: `Workout ${seq}`,
    startedAt: `${day}T18:00:00.000Z`,
    endedAt: `${day}T19:00:00.000Z`,
    durationMinutes: 60,
    setCount: 10,
    totalVolumeKg: volume,
    volumeIsPartial: partial,
    exercises: [],
    sets: [],
  };
}

describe('the Progress sparkline (#11)', () => {
  it('draws whole volumes oldest first, leaving out floors and zeros', () => {
    const spark = progressSpark([
      workout('2026-10-03', 3000),
      workout('2026-10-01', 2000),
      workout('2026-10-02', 0),
      workout('2026-10-04', 900, true),
      workout('2026-10-05', 4000),
    ]);
    expect(spark?.values).toEqual([2000, 3000, 4000]);
    expect(spark!.min).toBeLessThan(2000);
    expect(spark!.max).toBeGreaterThan(4000);
  });

  it('keeps only the last N', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      workout(`2026-09-${String(i + 1).padStart(2, '0')}`, 1000 + i),
    );
    expect(progressSpark(many)?.values).toHaveLength(10);
    expect(progressSpark(many)?.values[9]).toBe(1013);
  });

  it('is nothing under two points', () => {
    expect(progressSpark([])).toBeNull();
    expect(progressSpark([workout('2026-10-01', 100)])).toBeNull();
  });
});

describe('the last-session card (#11)', () => {
  it('links the latest workout’s exercises, each once, in order', () => {
    const old = workout('2026-10-01', 1);
    const latest = {
      ...workout('2026-10-09', 1),
      exercises: [
        { exerciseId: 'a', name: 'Bench press' },
        { exerciseId: 'b', name: 'Cable fly' },
        { exerciseId: 'a', name: 'Bench press' },
      ],
    } as unknown as CompletedWorkout;
    const last = lastSession([latest, old]);
    expect(last?.workoutId).toBe(latest.id);
    expect(last?.exercises).toEqual([
      { exerciseId: 'a', name: 'Bench press' },
      { exerciseId: 'b', name: 'Cable fly' },
    ]);
    expect(lastSession([])).toBeNull();
  });
});

describe('the weekly goal card (#11, #13)', () => {
  it('lights one pip per workout done, up to the goal', () => {
    expect(goalPips(2, 4)).toEqual([true, true, false, false]);
    expect(goalPips(6, 4)).toEqual([true, true, true, true]);
    expect(goalPips(0, 3)).toEqual([false, false, false]);
  });

  it('says it short, and says excused', () => {
    expect(describeGoalShort({ done: 2, goal: 4, excused: false }, 'en')).toBe('2 of 4 this week');
    expect(describeGoalShort({ done: 2, goal: 4, excused: false }, 'ru')).toBe(
      '2 из 4 на этой неделе',
    );
    expect(describeGoalShort({ done: 1, goal: 3, excused: true }, 'en')).toBe(
      '1 of 3 this week · excused',
    );
  });
});

describe('an empty workout (#18)', () => {
  it('is a routine with no items and no id, so nothing reads it as a routine', () => {
    const routine = emptyWorkoutRoutine({
      name: 'Workout',
      ownerId: 'u1',
      now: new Date('2026-10-30T18:00:00.000Z'),
    });
    expect(routine.items).toEqual([]);
    expect(routine.id).toBe('');
    const s = buildDraftSession({
      routine,
      exercisesById: {},
      historyByExerciseId: {},
      policy: DEFAULT_OVERLOAD_POLICY,
      unitSystem: 'metric',
      defaultRestSeconds: 120,
    });
    expect(s.entries).toEqual([]);
    expect(s.routineId ? 'routine' : 'none').toBe('none');
    expect(s.title).toBe('Workout');
  });
});
