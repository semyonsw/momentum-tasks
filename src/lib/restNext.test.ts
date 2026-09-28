import { describe, expect, it } from 'vitest';

import { buildDraftSession, type DraftSession } from './draft';
import { DEFAULT_OVERLOAD_POLICY } from './progressiveOverload';
import { restNext } from './restNext';
import type { Exercise, Routine } from '../types/models';

/**
 * What the rest card says it is resting FOR. The trap it guards: naming a set
 * number when the next set is on another exercise, which is true and useless.
 */

function exercise(id: string, name: string): Exercise {
  return {
    id,
    ownerId: 'u1',
    name,
    muscleGroups: ['back'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const pullups = exercise('ex_pullups', 'Pull-ups');
const rows = exercise('ex_rows', 'Rows');

function session(items: [Exercise, number][]): DraftSession {
  const routine: Routine = {
    id: 'r1',
    ownerId: 'u1',
    name: 'Pull',
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
    now: new Date('2026-09-08T18:00:00.000Z'),
  });
}

function log(s: DraftSession, entryIndex: number, setIndex: number, minute: number): DraftSession {
  return {
    ...s,
    entries: s.entries.map((entry, i) =>
      i === entryIndex
        ? {
            ...entry,
            sets: entry.sets.map((set, j) =>
              j === setIndex
                ? {
                    ...set,
                    isCompleted: true,
                    completedAt: `2026-09-08T18:${String(minute).padStart(2, '0')}:00.000Z`,
                  }
                : set,
            ),
          }
        : entry,
    ),
  };
}

describe('restNext', () => {
  it('is null without a session', () => {
    expect(restNext(null)).toBeNull();
  });

  it('names the set number while the next set is on the same exercise', () => {
    let s = session([
      [pullups, 3],
      [rows, 3],
    ]);
    s = log(s, 0, 0, 1);
    expect(restNext(s)).toEqual({ kind: 'set', number: 2 });
  });

  it('names the exercise once the next set is somewhere else', () => {
    let s = session([
      [pullups, 2],
      [rows, 3],
    ]);
    s = log(s, 0, 0, 1);
    s = log(s, 0, 1, 2);
    expect(restNext(s)).toEqual({ kind: 'exercise', name: 'Rows' });
  });

  it('numbers around a warm-up, and calls a warm-up a warm-up', () => {
    const base = session([[pullups, 2]]);
    const withWarmup: DraftSession = {
      ...base,
      entries: base.entries.map((e) => ({
        ...e,
        sets: [{ ...e.sets[0], localId: 'w1', isWarmup: true }, ...e.sets],
      })),
    };
    expect(restNext(withWarmup)).toEqual({ kind: 'warmup' });
    expect(restNext(log(withWarmup, 0, 0, 1))).toEqual({ kind: 'set', number: 1 });
  });

  it('is done when every set is logged', () => {
    let s = session([[pullups, 1]]);
    s = log(s, 0, 0, 1);
    expect(restNext(s)).toEqual({ kind: 'done' });
  });
});
