import { describe, expect, it } from 'vitest';

import {
  addRow,
  keepRow,
  matchExercise,
  normalizeName,
  normalizeProposal,
  planApply,
  proposalTotals,
  removeRow,
  rowStatus,
  setRowValue,
  stepRow,
  tokenOverlap,
  uniqueRoutineName,
  type Library,
  type ReviewProposal,
} from './aiProposal';
import type { RoutineProposal } from './aiSchema';
import { seedExercises, seedExercisesById, seedRoutines } from '../../data/seed';
import type { Exercise, Routine } from '../../types/models';

/**
 * From what the model proposed to what the library becomes. The properties that
 * matter are the ones a wrong answer would silently cost the user: an edit must
 * leave everything it did not change exactly as it was, a name must find the
 * exercise it means in either language, and Undo must put back what was there.
 */

const NOW = new Date('2026-09-27T18:00:00Z');
const OWNER = 'u1';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The shipped library, with the push routine given a superset and a transition. */
function library(): Library {
  const routines = clone(seedRoutines);
  const push = routines.find((r) => r.id === 'r_push')!;
  push.items[0] = { ...push.items[0], supersetGroup: 'ss1', transitionRestSeconds: 120 };
  push.items[1] = { ...push.items[1], supersetGroup: 'ss1' };
  return { exercises: clone(seedExercises), routines };
}

const ctx = (lib: Library = library()) => ({
  exercises: lib.exercises,
  routines: lib.routines,
  lastWeights: { ex_dips_weighted: 30 },
});

describe('matching a name to the library', () => {
  it('by id first', () => {
    expect(matchExercise({ exerciseId: 'ex_squat', name: 'whatever' }, seedExercises)?.id).toBe(
      'ex_squat',
    );
  });

  it('by the English alias of a Russian row', () => {
    expect(matchExercise({ name: 'Back squat' }, seedExercises)?.id).toBe('ex_squat');
    expect(matchExercise({ name: 'barbell ROW' }, seedExercises)?.id).toBe('ex_row_barbell');
  });

  it('by the Russian name, ignoring case and ё', () => {
    expect(matchExercise({ name: 'приседания со штангой' }, seedExercises)?.id).toBe('ex_squat');
    expect(matchExercise({ name: 'Подъемы ног в висе' }, seedExercises)?.id).toBe(
      'ex_hanging_leg_raise',
    );
    expect(normalizeName('Сгибания «молот»')).toBe('сгибания молот');
  });

  it('by token overlap at 0.8, and not below it', () => {
    expect(tokenOverlap('Тяга штанги в наклоне стоя', 'Тяга штанги в наклоне')).toBe(0.8);
    expect(matchExercise({ name: 'Тяга штанги в наклоне стоя' }, seedExercises)?.id).toBe(
      'ex_row_barbell',
    );
    expect(matchExercise({ name: 'Cable face pulls high' }, seedExercises)).toBeNull();
  });

  it('returns nothing for an exercise the library does not have', () => {
    expect(matchExercise({ name: 'Hip thrust' }, seedExercises)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

const editOfPush = (exercises: RoutineProposal['exercises']): RoutineProposal => ({
  kind: 'edit',
  targetRoutineId: 'r_push',
  name: 'Push',
  why: 'Dips reached 12 on every set.',
  exercises,
});

describe('normalising an edit', () => {
  const lib = library();
  const proposal = normalizeProposal(
    editOfPush([
      {
        exerciseId: 'ex_dips_weighted',
        name: 'Dips',
        sets: 5,
        reps: 10,
        weightKg: 35,
        change: 'same',
      },
      { name: 'Face pulls', sets: 3, reps: 15, weightKg: 20, change: 'new' },
      { name: 'Push-ups', sets: 4, reps: 15, weightKg: 20, change: 'removed' },
      { name: 'Cable fly', sets: 3, reps: 12, weightKg: 15, change: 'new', muscle: 'chest' },
    ]),
    ctx(lib),
  )!;

  it('lists the routine in order, with additions after the row they followed', () => {
    expect(proposal.rows.map((r) => r.name)).toEqual([
      seedExercisesById.ex_dips_weighted.name,
      seedExercisesById.ex_face_pull.name,
      seedExercisesById.ex_pushups.name,
      'Cable fly',
    ]);
  });

  it('derives every status from the numbers, not from the model’s label', () => {
    // The model said `same`; the numbers say otherwise.
    expect(proposal.rows.map(rowStatus)).toEqual(['changed', 'new', 'removed', 'new']);
  });

  it('records what the routine has now, weight included', () => {
    expect(proposal.rows[0].was).toEqual({ sets: 4, reps: 12, weightKg: 30 });
  });

  it('marks an unknown name as new to the library, with its muscle', () => {
    expect(proposal.rows[3]).toMatchObject({ exerciseId: null, muscle: 'chest' });
    expect(proposal.rows[1].exerciseId).toBe('ex_face_pull');
  });

  it('keeps a weight off an exercise that takes none', () => {
    const pushups = normalizeProposal(
      editOfPush([{ name: 'Push-ups', sets: 4, reps: 15, weightKg: 20 }]),
      ctx(lib),
    )!.rows.find((r) => r.exerciseId === 'ex_pushups')!;
    expect(pushups.weightKg).toBe(0);
    expect(pushups.weightLocked).toBe(true);
  });

  it('keeps a row the model forgot, unchanged', () => {
    const partial = normalizeProposal(
      editOfPush([
        { exerciseId: 'ex_dips_weighted', name: 'Dips', sets: 5, reps: 10, weightKg: 35 },
      ]),
      ctx(lib),
    )!;
    const pushups = partial.rows.find((r) => r.exerciseId === 'ex_pushups')!;
    expect(rowStatus(pushups)).toBe('same');
    expect(pushups.removed).toBe(false);
  });

  it('does not touch the reps of an exercise running a ladder', () => {
    const laddered = library();
    laddered.exercises = laddered.exercises.map((e) =>
      e.id === 'ex_dips_weighted' ? { ...e, ladder: { max: 12, earned: 0 } } : e,
    );
    const row = normalizeProposal(
      editOfPush([
        { exerciseId: 'ex_dips_weighted', name: 'Dips', sets: 4, reps: 6, weightKg: 30 },
      ]),
      ctx(laddered),
    )!.rows[0];
    expect(row.reps).toBe(12);
    expect(row.repsLocked).toBe(true);
    expect(setRowValue({ ...proposal, rows: [row] }, row.key, 'reps', 3).rows[0].reps).toBe(12);
  });

  it('is null when the routine it edits is gone', () => {
    expect(
      normalizeProposal({ ...editOfPush([]), targetRoutineId: 'r_deleted' }, ctx(lib)),
    ).toBeNull();
  });

  it('adds up what the card says', () => {
    expect(proposalTotals(proposal)).toEqual({ exercises: 3, sets: 11, changes: 4 });
  });
});

/* ------------------------------------------------------------------ */

describe('applying an edit', () => {
  const lib = library();
  const before = clone(lib);
  const proposal = normalizeProposal(
    editOfPush([
      { exerciseId: 'ex_dips_weighted', name: 'Dips', sets: 5, reps: 10, weightKg: 35 },
      { name: 'Face pulls', sets: 3, reps: 15, weightKg: 20 },
      { name: 'Push-ups', sets: 4, reps: 15, weightKg: 0, change: 'removed' },
      { name: 'Cable fly', sets: 3, reps: 12, weightKg: 15, muscle: 'chest' },
    ]),
    ctx(lib),
  )!;
  const result = planApply(proposal, lib, { now: NOW, ownerId: OWNER })!;
  const push = result.routines.find((r) => r.id === 'r_push')!;

  it('removes, inserts at position and renumbers', () => {
    expect(push.items.map((i) => i.exerciseId)).toEqual([
      'ex_dips_weighted',
      'ex_face_pull',
      result.exercises.find((e) => e.name === 'Cable fly')!.id,
    ]);
    expect(push.items.map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it('keeps every untouched field of a changed item — the superset, the transition', () => {
    const { targetRepsMin: _range, ...original } = before.routines.find((r) => r.id === 'r_push')!
      .items[0];
    expect(push.items[0]).toEqual({ ...original, targetSets: 5, targetRepsMax: 10 });
    // A range collapses to the one number it was changed to.
    expect(push.items[0].targetRepsMin).toBeUndefined();
    expect(push.items[0].supersetGroup).toBe('ss1');
    expect(push.items[0].transitionRestSeconds).toBe(120);
  });

  it('moves the starting weight, and only where it changed', () => {
    const dips = result.exercises.find((e) => e.id === 'ex_dips_weighted')!;
    expect(dips.defaultWeightKg).toBe(35);
    const untouched = result.exercises.filter(
      (e) => e.id !== 'ex_dips_weighted' && e.id !== 'ex_face_pull',
    );
    expect(untouched.filter((e) => before.exercises.some((b) => b.id === e.id))).toEqual(
      before.exercises.filter((e) => e.id !== 'ex_dips_weighted' && e.id !== 'ex_face_pull'),
    );
  });

  it('creates the exercise the library did not have, filed under its muscle', () => {
    const fly = result.exercises.find((e) => e.name === 'Cable fly')!;
    expect(fly).toMatchObject({
      ownerId: OWNER,
      muscleGroups: ['chest'],
      requiresWeight: true,
      loadMode: 'external',
      countUnit: 'reps',
      defaultWeightKg: 15,
      defaultCount: 12,
      defaultSets: 3,
      isArchived: false,
    });
    expect(result.exercises).toHaveLength(before.exercises.length + 1);
  });

  it('leaves every other routine exactly as it was', () => {
    expect(result.routines.filter((r) => r.id !== 'r_push')).toEqual(
      before.routines.filter((r) => r.id !== 'r_push'),
    );
  });

  it('does not touch its input, so the snapshot IS the undo', () => {
    expect(lib).toEqual(before);
  });

  it('leaves an unchanged item as the very same object', () => {
    const same = normalizeProposal(editOfPush([]), ctx(lib))!;
    const applied = planApply(same, lib, { now: NOW, ownerId: OWNER })!;
    const original = lib.routines.find((r) => r.id === 'r_push')!;
    const next = applied.routines.find((r) => r.id === 'r_push')!;
    expect(next.items[0]).toBe(original.items[0]);
    expect(next.items[1]).toBe(original.items[1]);
  });
});

/* ------------------------------------------------------------------ */

describe('applying a new routine', () => {
  const raw: RoutineProposal = {
    kind: 'new',
    name: 'Жим',
    why: 'Legs had 8 sets in four weeks.',
    exercises: [
      { name: 'Back squat', sets: 4, reps: 6, weightKg: 80 },
      { name: 'Hip thrust', sets: 3, reps: 10, weightKg: 60, muscle: 'glutes' },
      { name: 'back squat', sets: 3, reps: 8, weightKg: 70 },
    ],
  };

  it('de-duplicates, and names itself away from an existing routine', () => {
    const lib = library();
    const proposal = normalizeProposal(raw, ctx(lib))!;
    expect(proposal.rows).toHaveLength(2);
    const result = planApply(proposal, lib, { now: NOW, ownerId: OWNER })!;
    // `Жим` is the shipped push routine's name.
    expect(result.routineName).toBe('Жим (AI)');
    const routine = result.routines.find((r) => r.id === result.routineId)!;
    expect(routine.items).toEqual([
      expect.objectContaining({
        exerciseId: 'ex_squat',
        order: 0,
        targetSets: 4,
        targetRepsMax: 6,
      }),
      expect.objectContaining({ order: 1, targetSets: 3, targetRepsMax: 10 }),
    ]);
    expect(result.routines).toHaveLength(lib.routines.length + 1);
  });

  it('counts the collision suffix past the first', () => {
    const routines = [{ name: 'Legs' }, { name: 'Legs (AI)' }] as Routine[];
    expect(uniqueRoutineName('Legs', routines)).toBe('Legs (AI 2)');
    expect(uniqueRoutineName('Arms', routines)).toBe('Arms');
  });

  it('applies nothing when every row was removed', () => {
    const lib = library();
    const proposal = normalizeProposal(raw, ctx(lib))!;
    const empty = proposal.rows.reduce((p, row) => removeRow(p, row.key), proposal);
    expect(empty.rows).toHaveLength(0);
    expect(planApply(empty, lib, { now: NOW, ownerId: OWNER })).toBeNull();
  });

  it('round-trips through undo', () => {
    const lib = library();
    const snapshot: Library = { exercises: lib.exercises, routines: lib.routines };
    const frozen = clone(snapshot);
    const applied = planApply(normalizeProposal(raw, ctx(lib))!, lib, {
      now: NOW,
      ownerId: OWNER,
    })!;
    expect(applied.routines).not.toEqual(frozen.routines);
    // Undo writes the snapshot back — and the snapshot is still the library it was.
    expect(snapshot).toEqual(frozen);
  });
});

/* ------------------------------------------------------------------ */

describe('the review screen’s edits', () => {
  const lib = library();
  const proposal: ReviewProposal = normalizeProposal(
    editOfPush([
      { exerciseId: 'ex_dips_weighted', name: 'Dips', sets: 4, reps: 12, weightKg: 30 },
      { name: 'Face pulls', sets: 3, reps: 15, weightKg: 20 },
    ]),
    ctx(lib),
  )!;
  const [dips, face] = proposal.rows;

  it('steps in ones and in 2.5 kg, held to the clamps', () => {
    expect(stepRow(proposal, dips.key, 'weightKg', 1).rows[0].weightKg).toBe(32.5);
    expect(stepRow(proposal, dips.key, 'sets', 1).rows[0].sets).toBe(5);
    expect(setRowValue(proposal, dips.key, 'sets', 30).rows[0].sets).toBe(10);
    expect(setRowValue(proposal, dips.key, 'weightKg', -10).rows[0].weightKg).toBe(0);
    expect(rowStatus(stepRow(proposal, dips.key, 'sets', 1).rows[0])).toBe('changed');
  });

  it('✕ marks an existing exercise removed and Keep restores it', () => {
    const removed = removeRow(proposal, dips.key);
    expect(removed.rows[0].removed).toBe(true);
    expect(keepRow(removed, dips.key).rows[0].removed).toBe(false);
  });

  it('✕ deletes a row that only exists in the proposal', () => {
    expect(removeRow(proposal, face.key).rows.map((r) => r.key)).toEqual([
      dips.key,
      ...proposal.rows.slice(2).map((r) => r.key),
    ]);
  });

  it('adds a library exercise at its own defaults', () => {
    const squat = lib.exercises.find((e) => e.id === 'ex_squat') as Exercise;
    const added = addRow(proposal, squat, {}).rows.at(-1)!;
    expect(added).toMatchObject({ exerciseId: 'ex_squat', was: null, sets: 4, removed: false });
    expect(rowStatus(added)).toBe('new');
  });
});
