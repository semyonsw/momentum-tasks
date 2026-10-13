import { describe, expect, it } from 'vitest';

import {
  normalizeProposal,
  planApply,
  regroup,
  rowStatus,
  setRowValue,
  valuesDiffer,
  type Library,
  type ProposalRow,
  type ReviewProposal,
} from './aiProposal';
import { validateBlocks, type ProposedExercise, type RoutineProposal } from './aiSchema';
import { isSupersettedWithAbove } from '../routinePlan';
import type { Exercise, Routine, RoutineItem } from '../../types/models';

/**
 * The three things a routine edit could not say before: a rep RANGE (8–10), a
 * SUPERSET bracket, and an ORDER. Each is held to the rule the rest of
 * `aiProposal` keeps — a row the model copied without meaning to change it
 * comes out exactly as it was, and only an edit that lists the whole routine is
 * believed about where things go.
 */

const NOW = new Date('2026-10-01T18:00:00Z');
const CREATED = '2026-06-01T00:00:00.000Z';
const OWNER = 'u1';

function exercise(id: string, name: string, weightKg: number | null): Exercise {
  return {
    id,
    ownerId: OWNER,
    name,
    muscleGroups: ['back'],
    requiresWeight: weightKg != null,
    countUnit: 'reps',
    loadMode: weightKg != null ? 'external' : 'none',
    isUnilateral: false,
    ...(weightKg != null ? { defaultWeightKg: weightKg } : {}),
    isArchived: false,
    createdAt: CREATED,
  };
}

const EXERCISES: Exercise[] = [
  exercise('ex_bench', 'Bench press', 60),
  exercise('ex_row', 'Barbell row', 50),
  exercise('ex_curl', 'Biceps curl', 10),
  exercise('ex_dips', 'Dips', null),
];

/** Bench 3×8–10, then Row + Curl as a superset, then Dips. */
function routine(): Routine {
  const items: RoutineItem[] = [
    {
      id: 'i_bench',
      exerciseId: 'ex_bench',
      order: 0,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 10,
    },
    {
      id: 'i_row',
      exerciseId: 'ex_row',
      order: 1,
      targetSets: 3,
      targetRepsMax: 10,
      supersetGroup: 'g1',
    },
    {
      id: 'i_curl',
      exerciseId: 'ex_curl',
      order: 2,
      targetSets: 3,
      targetRepsMax: 12,
      supersetGroup: 'g1',
    },
    {
      id: 'i_dips',
      exerciseId: 'ex_dips',
      order: 3,
      targetSets: 3,
      targetRepsMin: 15,
      targetRepsMax: 15,
    },
  ];
  return {
    id: 'r_day',
    ownerId: OWNER,
    name: 'Day',
    items,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
}

const library = (): Library => ({ exercises: EXERCISES, routines: [routine()] });
const ctx = (lib: Library = library()) => ({
  exercises: lib.exercises,
  routines: lib.routines,
  lastWeights: {},
});

type Proposed = ProposedExercise;
const p = (exerciseId: string, over: Partial<Proposed> = {}): Proposed => {
  const e = EXERCISES.find((x) => x.id === exerciseId)!;
  const item = routine().items.find((i) => i.exerciseId === exerciseId)!;
  return {
    exerciseId,
    name: e.name,
    sets: item.targetSets,
    reps: item.targetRepsMax!,
    weightKg: e.defaultWeightKg ?? 0,
    change: 'same',
    ...over,
  };
};
const edit = (exercises: Proposed[]): RoutineProposal => ({
  kind: 'edit',
  targetRoutineId: 'r_day',
  name: 'Day',
  why: 'Because.',
  exercises,
});
const review = (exercises: Proposed[]) => normalizeProposal(edit(exercises), ctx())!;
const rowOf = (r: ReviewProposal, id: string) => r.rows.find((row) => row.exerciseId === id)!;
const apply = (r: ReviewProposal) => planApply(r, library(), { now: NOW, ownerId: OWNER })!;
const appliedDay = (r: ReviewProposal) => apply(r).routines.find((x) => x.id === 'r_day')!;
const itemOf = (rt: Routine, exerciseId: string) =>
  rt.items.find((i) => i.exerciseId === exerciseId)!;
const bracketed = (rt: Routine) => {
  const sorted = [...rt.items].sort((a, b) => a.order - b.order);
  return sorted.map((item, i) => [item.exerciseId, isSupersettedWithAbove(sorted, i)]);
};

/** Every exercise of the routine, as it is. */
const asIs = () => ['ex_bench', 'ex_row', 'ex_curl', 'ex_dips'].map((id) => p(id));

/* ------------------------------------------------------------------ */

describe('what the routine is now', () => {
  it('a row reads a range and a bracket off its item', () => {
    const r = review(asIs());
    expect(rowOf(r, 'ex_bench').was).toEqual({ sets: 3, reps: 10, repsMin: 8, weightKg: 60 });
    expect(rowOf(r, 'ex_row').was).not.toHaveProperty('superset');
    expect(rowOf(r, 'ex_curl').was?.superset).toBe(true);
    // 15–15 is one number.
    expect(rowOf(r, 'ex_dips').was).not.toHaveProperty('repsMin');
  });

  it('the routine copied back exactly is a card with nothing on it, and Apply changes nothing', () => {
    const r = review(asIs());
    expect(r.rows.map(rowStatus)).toEqual(['same', 'same', 'same', 'same']);
    expect(r.rows.some((row) => row.moved)).toBe(false);
    expect(appliedDay(r).items).toEqual(routine().items);
  });
});

describe('a rep range', () => {
  it('from a "8-10" label, through the validator, onto a new routine', () => {
    const [block] = validateBlocks(
      [
        {
          type: 'routine_proposal',
          proposal: {
            kind: 'new',
            name: 'Arms',
            why: 'Arms.',
            exercises: [
              { exerciseId: 'ex_curl', name: 'Biceps curl', sets: 3, reps: '8-10', weightKg: 10 },
            ],
          },
        },
      ],
      { section: 'Workout', routineIds: new Set(['r_day']) },
    );
    if (block.type !== 'routine_proposal') throw new Error('no proposal');
    const r = normalizeProposal(block.proposal, ctx())!;
    expect(r.rows[0]).toMatchObject({ reps: 10, repsMin: 8 });
    const result = apply(r);
    const arms = result.routines.find((x) => x.id === result.routineId)!;
    expect(arms.items[0]).toMatchObject({ targetRepsMin: 8, targetRepsMax: 10 });
  });

  it('a `same` row with its own top keeps the range, whatever bottom was copied beside it', () => {
    for (const over of [{}, { repsMin: 9 }, { repsMin: 6 }]) {
      const row = rowOf(review([p('ex_bench', over), ...asIs().slice(1)]), 'ex_bench');
      expect(row.repsMin).toBe(8);
      expect(rowStatus(row)).toBe('same');
    }
  });

  it('a `same` row copied as "10-12" onto a single 12 stays a single 12', () => {
    const row = rowOf(review([p('ex_curl', { repsMin: 10 })]), 'ex_curl');
    expect(row).not.toHaveProperty('repsMin');
    expect(rowStatus(row)).toBe('same');
  });

  it('a `changed` row that leaves the top alone and says no bottom keeps the range', () => {
    const row = rowOf(review([p('ex_bench', { sets: 4, change: 'changed' })]), 'ex_bench');
    expect(row).toMatchObject({ sets: 4, reps: 10, repsMin: 8 });
    expect(
      appliedDay(review([p('ex_bench', { sets: 4, change: 'changed' })])).items[0],
    ).toMatchObject({ targetSets: 4, targetRepsMin: 8, targetRepsMax: 10 });
  });

  it('a changed range is applied as one', () => {
    const r = review([p('ex_bench', { repsMin: 10, reps: 12, change: 'changed' })]);
    expect(rowStatus(rowOf(r, 'ex_bench'))).toBe('changed');
    expect(itemOf(appliedDay(r), 'ex_bench')).toMatchObject({
      targetRepsMin: 10,
      targetRepsMax: 12,
    });
  });

  it('only the bottom changed is still a change, and lands', () => {
    const r = review([p('ex_bench', { repsMin: 6, change: 'changed' })]);
    const row = rowOf(r, 'ex_bench');
    expect(row).toMatchObject({ reps: 10, repsMin: 6 });
    expect(rowStatus(row)).toBe('changed');
    expect(itemOf(appliedDay(r), 'ex_bench')).toMatchObject({
      targetRepsMin: 6,
      targetRepsMax: 10,
    });
  });

  it('a new top with no bottom is one number — the range is dropped on Apply', () => {
    const r = review([p('ex_bench', { reps: 12, change: 'changed' })]);
    expect(rowOf(r, 'ex_bench')).not.toHaveProperty('repsMin');
    const item = itemOf(appliedDay(r), 'ex_bench');
    expect(item.targetRepsMax).toBe(12);
    expect(item).not.toHaveProperty('targetRepsMin');
  });

  it('a range added to a single number', () => {
    const r = review([p('ex_curl', { repsMin: 8, reps: 12, change: 'changed' })]);
    expect(itemOf(appliedDay(r), 'ex_curl')).toMatchObject({ targetRepsMin: 8, targetRepsMax: 12 });
  });

  it('a top stepped down onto its bottom drops the bottom', () => {
    const r = review(asIs());
    const key = rowOf(r, 'ex_bench').key;
    const nine = setRowValue(r, key, 'reps', 9);
    expect(rowOf(nine, 'ex_bench')).toMatchObject({ reps: 9, repsMin: 8 });
    const eight = setRowValue(nine, key, 'reps', 8);
    expect(rowOf(eight, 'ex_bench')).not.toHaveProperty('repsMin');
    expect(itemOf(appliedDay(eight), 'ex_bench')).not.toHaveProperty('targetRepsMin');
  });

  it('valuesDiffer sees the bottom and the bracket', () => {
    const was = { sets: 3, reps: 10, weightKg: 0 };
    expect(valuesDiffer({ ...was }, was)).toBe(false);
    expect(valuesDiffer({ ...was, repsMin: 8 }, was)).toBe(true);
    expect(valuesDiffer({ ...was, superset: true }, was)).toBe(true);
    expect(valuesDiffer({ ...was, superset: false }, was)).toBe(false);
    expect(valuesDiffer({ ...was, repsMin: 8 }, { ...was, repsMin: 8 })).toBe(false);
  });
});

describe('a superset', () => {
  it('a row that says nothing keeps its bracket', () => {
    const r = review([p('ex_curl', { reps: 15, change: 'changed' })]);
    expect(rowOf(r, 'ex_curl').superset).toBe(true);
    const day = appliedDay(r);
    // No bracket moved: the group strings are exactly the editor's.
    expect(itemOf(day, 'ex_row').supersetGroup).toBe('g1');
    expect(itemOf(day, 'ex_curl').supersetGroup).toBe('g1');
  });

  it('a `same` row copied with superset:false keeps the bracket', () => {
    const row = rowOf(review([p('ex_curl', { superset: false })]), 'ex_curl');
    expect(row.superset).toBe(true);
    expect(rowStatus(row)).toBe('same');
  });

  it('split: Curl leaves Row', () => {
    const r = review([p('ex_curl', { superset: false, change: 'changed' })]);
    expect(rowStatus(rowOf(r, 'ex_curl'))).toBe('changed');
    const day = appliedDay(r);
    expect(bracketed(day)).toEqual([
      ['ex_bench', false],
      ['ex_row', false],
      ['ex_curl', false],
      ['ex_dips', false],
    ]);
    expect(day.items.every((i) => i.supersetGroup === undefined)).toBe(true);
  });

  it('join: Dips joins Row + Curl as a run of three', () => {
    const r = review([p('ex_dips', { superset: true, change: 'changed' })]);
    expect(bracketed(appliedDay(r))).toEqual([
      ['ex_bench', false],
      ['ex_row', false],
      ['ex_curl', true],
      ['ex_dips', true],
    ]);
  });

  it('join: Row joins Bench, and the run carries on through Curl', () => {
    const r = review([p('ex_row', { superset: true, change: 'changed' })]);
    const day = appliedDay(r);
    expect(bracketed(day)).toEqual([
      ['ex_bench', false],
      ['ex_row', true],
      ['ex_curl', true],
      ['ex_dips', false],
    ]);
    expect(new Set(day.items.slice(0, 3).map((i) => i.supersetGroup)).size).toBe(1);
  });

  it('on a new routine, from the flags', () => {
    const r = normalizeProposal(
      {
        kind: 'new',
        name: 'Pair',
        why: 'x',
        exercises: [p('ex_row'), p('ex_curl', { superset: true }), p('ex_dips')],
      },
      ctx(),
    )!;
    const result = apply(r);
    const pair = result.routines.find((x) => x.id === result.routineId)!;
    expect(bracketed(pair)).toEqual([
      ['ex_row', false],
      ['ex_curl', true],
      ['ex_dips', false],
    ]);
    expect(pair.items[2]).not.toHaveProperty('supersetGroup');
  });

  it('a new exercise added in a bracket', () => {
    const r = review([
      ...asIs().slice(0, 3),
      { name: 'Face pull', sets: 3, reps: 15, weightKg: 0, change: 'new', superset: true },
      p('ex_dips'),
    ]);
    const day = appliedDay(r);
    const sorted = [...day.items].sort((a, b) => a.order - b.order);
    expect(sorted).toHaveLength(5);
    expect(sorted[3].exerciseId).toMatch(/^ex_ai/);
    expect(sorted.map((_, i) => isSupersettedWithAbove(sorted, i))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
  });

  it('regroup leaves an untouched item the same object', () => {
    const items = routine().items;
    const out = regroup(items, [false, false, true, false]);
    expect(out[0]).toBe(items[0]);
    expect(out[3]).toBe(items[3]);
    expect(out[1].supersetGroup).toBe(out[2].supersetGroup);
    // A first item can never be "with the one above".
    expect(regroup(items, [true, false, false, false])[0]).not.toHaveProperty('supersetGroup');
  });
});

describe('the order', () => {
  it('a whole list in a new order moves the rows, marks them, and applies the order', () => {
    const r = review([p('ex_row'), p('ex_curl'), p('ex_bench'), p('ex_dips')]);
    expect(r.rows.map((row) => row.exerciseId)).toEqual([
      'ex_row',
      'ex_curl',
      'ex_bench',
      'ex_dips',
    ]);
    const moved = Object.fromEntries(r.rows.map((row) => [row.exerciseId, row.moved === true]));
    expect(moved).toEqual({ ex_row: true, ex_curl: true, ex_bench: true, ex_dips: false });
    expect(rowStatus(rowOf(r, 'ex_bench'))).toBe('changed');
    expect(rowStatus(rowOf(r, 'ex_dips'))).toBe('same');

    const day = appliedDay(r);
    const sorted = [...day.items].sort((a, b) => a.order - b.order);
    expect(sorted.map((i) => i.id)).toEqual(['i_row', 'i_curl', 'i_bench', 'i_dips']);
    expect(sorted.map((i) => i.order)).toEqual([0, 1, 2, 3]);
    // The pair moved together, still a pair; Bench is not pulled into it.
    expect(bracketed(day)).toEqual([
      ['ex_row', false],
      ['ex_curl', true],
      ['ex_bench', false],
      ['ex_dips', false],
    ]);
    // Range and numbers untouched by the move.
    expect(itemOf(day, 'ex_bench')).toMatchObject({
      targetRepsMin: 8,
      targetRepsMax: 10,
      targetSets: 3,
    });
  });

  it('a whole list that leaves one out: the order is taken, the omitted row stays after its neighbour', () => {
    const r = review([p('ex_dips'), p('ex_bench'), p('ex_row')]);
    expect(r.rows.map((row) => [row.exerciseId, row.removed])).toEqual([
      ['ex_dips', false],
      ['ex_bench', false],
      ['ex_row', false],
      ['ex_curl', true],
    ]);
    const day = appliedDay(r);
    expect([...day.items].sort((a, b) => a.order - b.order).map((i) => i.exerciseId)).toEqual([
      'ex_dips',
      'ex_bench',
      'ex_row',
    ]);
  });

  it('a new exercise in a whole list moves nothing else', () => {
    const r = review([
      p('ex_bench'),
      { name: 'Face pull', sets: 3, reps: 15, weightKg: 0, change: 'new' },
      ...asIs().slice(1),
    ]);
    expect(r.rows.map((row) => row.exerciseId ?? row.name)).toEqual([
      'ex_bench',
      'Face pull',
      'ex_row',
      'ex_curl',
      'ex_dips',
    ]);
    expect(r.rows.some((row) => row.moved)).toBe(false);
    const day = appliedDay(r);
    // The existing pair keeps its very group string: no bracket moved.
    expect(itemOf(day, 'ex_curl').supersetGroup).toBe('g1');
  });

  it('a partial list says nothing about the order', () => {
    // Two of four is not "most of the routine".
    const r = review([p('ex_dips', { sets: 4, change: 'changed' }), p('ex_bench')]);
    expect(r.rows.map((row) => row.exerciseId)).toEqual([
      'ex_bench',
      'ex_row',
      'ex_curl',
      'ex_dips',
    ]);
    expect(r.rows.some((row) => row.moved)).toBe(false);
    expect(r.rows.some((row) => row.removed)).toBe(false);
    const day = appliedDay(r);
    expect([...day.items].sort((a, b) => a.order - b.order).map((i) => i.id)).toEqual([
      'i_bench',
      'i_row',
      'i_curl',
      'i_dips',
    ]);
    expect(itemOf(day, 'ex_dips').targetSets).toBe(4);
  });

  it('one exercise named first is a partial edit too', () => {
    const r = review([p('ex_dips')]);
    expect(r.rows.map((row: ProposalRow) => row.exerciseId)).toEqual([
      'ex_bench',
      'ex_row',
      'ex_curl',
      'ex_dips',
    ]);
  });
});

describe('a bracket under a new neighbour', () => {
  it('Dips moved between Row and Curl does not pull Curl into a superset with Dips', () => {
    const r = review([p('ex_bench'), p('ex_row'), p('ex_dips'), p('ex_curl')]);
    expect(rowOf(r, 'ex_curl').superset).toBeUndefined();
    expect(bracketed(appliedDay(r))).toEqual([
      ['ex_bench', false],
      ['ex_row', false],
      ['ex_dips', false],
      ['ex_curl', false],
    ]);
  });

  it('keeps a bracket the model set on purpose under the new neighbour', () => {
    const r = review([
      p('ex_bench'),
      p('ex_row'),
      p('ex_dips', { superset: true, change: 'changed' }),
      p('ex_curl'),
    ]);
    expect(bracketed(appliedDay(r))).toEqual([
      ['ex_bench', false],
      ['ex_row', false],
      ['ex_dips', true],
      ['ex_curl', false],
    ]);
  });
});
