/**
 * A routine suggestion, from what the model said to what the library holds.
 *
 *   raw proposal ──normalizeProposal──► ReviewProposal ──(the user edits it)──►
 *                                         planApply ──► the next library
 *
 * ── THE MODEL'S LABELS ARE NOT TRUSTED ─────────────────────────────────────
 *
 * The model says which exercises are `same`, `changed`, `new` and `removed`.
 * It is right most of the time, and "most of the time" is not good enough for a
 * card that crosses out the old value: an exercise marked `same` with a new
 * weight would apply a change the card never showed. So every row's status is
 * DERIVED here from the routine as the store has it — `rowStatus` compares the
 * numbers — and the one label the model is believed on is `removed`, because a
 * removal cannot be inferred from numbers at all.
 *
 * ── NAMES MAP ONTO THE LIBRARY ─────────────────────────────────────────────
 *
 * `matchExercise` tries the id first, then the name and every alias ignoring
 * case and diacritics (the shipped library is Russian with its English names as
 * aliases, so "Bench press" finds «Жим лёжа»), then token overlap at 0.8. A name
 * that matches nothing stays unmatched — `exerciseId: null` — and the review
 * screen marks it `new to library`. It becomes an exercise only if the user
 * accepts the whole proposal.
 *
 * ── WHAT A ROW'S THREE NUMBERS MEAN IN THIS APP ────────────────────────────
 *
 *   sets     → `RoutineItem.targetSets`
 *   reps     → `RoutineItem.targetRepsMax` (a range collapses to the one number)
 *   weightKg → `Exercise.defaultWeightKg`, the weight the movement STARTS at
 *
 * Weight lives on the set and not on the plan (`types/models.ts`, rule 3), so
 * the only place a suggested weight can land is the exercise's starting weight —
 * which the session prefill reads when there is no history, and which is
 * overruled by the last session's weight once there is. The review screen says
 * so. Rest is NOT applied: the house rule is that nothing creates a per-exercise
 * rest on the user's behalf (`lib/rest.ts`), and a model is not the user.
 *
 * A LADDER OWNS ITS REPS. An exercise running a rep ladder, counting to MAX, or
 * counted in anything but reps keeps the reps it has — `repsLocked` — because
 * the app already progresses those and two systems prescribing one exercise's
 * reps is one of them being wrong. The same argument keeps a weight off an
 * exercise that takes none.
 *
 * ── `planApply` RETURNS THE NEXT LIBRARY, NOT A LIST OF ACTIONS ────────────
 *
 * The handoff asked for a list of store actions. A list of actions is a second
 * interpreter of those actions to test; the next `{ exercises, routines }` is a
 * value a test can compare with `toEqual`, and it is also exactly what Undo needs
 * the other half of — the snapshot from before. `libraryStore.replaceLibrary`
 * writes either one through the store's own validator.
 */

import { defaultTargetCount, defaultTargetSets } from '../draft';
import { countsToMax } from '../maxReps';
import { ladderOf } from '../repLadder';
import { CLAMP, clampInt, clampWeight, type RoutineProposal } from './aiSchema';
import type { Exercise, ID, MuscleGroup, Routine, RoutineItem } from '../../types/models';

export interface RowValues {
  sets: number;
  reps: number;
  weightKg: number;
}

export interface ProposalRow extends RowValues {
  /** Stable across edits, so the review list keeps its keys. */
  key: string;
  /** The library exercise it maps to, or null for one that would be created. */
  exerciseId: ID | null;
  name: string;
  /** Only for a new-to-library row: where it would file. */
  muscle?: MuscleGroup;
  /** The routine's current values, for an `edit`. Null = this row is an addition. */
  was: RowValues | null;
  /** The routine item this row came from, for an `edit`. */
  itemId?: ID;
  removed: boolean;
  /** The app owns this exercise's reps — see the file header. */
  repsLocked: boolean;
  /** The exercise takes no weight, so the kg is always 0. */
  weightLocked: boolean;
  /** What the exercise starts at today, so an unchanged weight writes nothing. */
  baseWeightKg: number | null;
}

export interface ReviewProposal {
  kind: 'new' | 'edit';
  targetRoutineId?: ID;
  name: string;
  focus?: string;
  why: string;
  rows: ProposalRow[];
}

export type RowStatus = 'same' | 'changed' | 'new' | 'removed';

/* ------------------------------------------------------------------ */
/* Matching a name to the library                                      */
/* ------------------------------------------------------------------ */

/**
 * Lower case, no diacritics, punctuation as space.
 *
 * Stripping the combining marks also folds `ё` into `е` and `й` into `и`. The
 * first is the point — «лёжа» and «лежа» are one word typed two ways — and the
 * second is harmless, because both sides of every comparison are folded alike.
 */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeName(value).split(' ').filter(Boolean));
}

/** Shared tokens over the longer of the two token sets. 1 = the same words. */
export function tokenOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

/**
 * The library exercise a proposed one refers to, or null.
 *
 * Id → exact name or alias → token overlap ≥ 0.8. Archived rows are skipped: a
 * proposal is about what the user trains now.
 */
export function matchExercise(
  ref: { exerciseId?: string; name: string },
  library: readonly Exercise[],
): Exercise | null {
  const live = library.filter((e) => !e.isArchived);
  if (ref.exerciseId) {
    const byId = live.find((e) => e.id === ref.exerciseId);
    if (byId) return byId;
  }
  const wanted = normalizeName(ref.name);
  if (wanted === '') return null;
  const names = (e: Exercise) => [e.name, ...(e.aliases ?? [])];

  const exact = live.find((e) => names(e).some((n) => normalizeName(n) === wanted));
  if (exact) return exact;

  let best: Exercise | null = null;
  let bestScore = 0;
  for (const exercise of live) {
    for (const name of names(exercise)) {
      const score = tokenOverlap(ref.name, name);
      if (score > bestScore) {
        best = exercise;
        bestScore = score;
      }
    }
  }
  return bestScore >= 0.8 ? best : null;
}

/* ------------------------------------------------------------------ */
/* Normalising what the model proposed                                 */
/* ------------------------------------------------------------------ */

export interface NormalizeContext {
  exercises: readonly Exercise[];
  routines: readonly Routine[];
  /** The last session's top weight per exercise — `aiContext.lastTopWeights`. */
  lastWeights: Record<ID, number>;
}

function repsLockedFor(exercise: Exercise): boolean {
  return exercise.countUnit !== 'reps' || ladderOf(exercise) != null || countsToMax(exercise);
}

/** What this exercise starts at today: last session, else its own start, else nothing. */
function baseWeight(exercise: Exercise, lastWeights: Record<ID, number>): number | null {
  if (!exercise.requiresWeight) return null;
  return lastWeights[exercise.id] ?? exercise.defaultWeightKg ?? null;
}

function itemValues(item: RoutineItem, exercise: Exercise, base: number | null): RowValues {
  return {
    sets: item.targetSets,
    reps: item.targetRepsMax ?? item.targetRepsMin ?? defaultTargetCount(exercise),
    weightKg: base ?? 0,
  };
}

/** The model's numbers, held to what this exercise can take. */
function lockedValues(
  proposed: RowValues,
  exercise: Exercise | null,
  current: RowValues | null,
): RowValues {
  if (!exercise) return proposed;
  const reps = repsLockedFor(exercise)
    ? (current?.reps ?? defaultTargetCount(exercise))
    : proposed.reps;
  return {
    sets: proposed.sets,
    reps,
    weightKg: exercise.requiresWeight ? proposed.weightKg : 0,
  };
}

let keySeed = 0;
function rowKey(): string {
  keySeed += 1;
  return `row_${Date.now().toString(36)}_${keySeed}`;
}

/**
 * The model's proposal, checked against the library and the routine it edits.
 *
 * Null when there is nothing left to propose: an edit of a routine that has
 * since been deleted, or a new routine none of whose rows survived.
 */
export function normalizeProposal(
  raw: RoutineProposal,
  ctx: NormalizeContext,
): ReviewProposal | null {
  const { exercises, routines, lastWeights } = ctx;

  /* Match and de-duplicate: one row per library exercise, one per unknown name. */
  const seen = new Set<string>();
  const entries = raw.exercises
    .map((proposed) => ({ proposed, exercise: matchExercise(proposed, exercises) }))
    .filter(({ proposed, exercise }) => {
      const identity = exercise ? `id:${exercise.id}` : `name:${normalizeName(proposed.name)}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });

  const toRow = (
    proposed: RoutineProposal['exercises'][number],
    exercise: Exercise | null,
    current: RowValues | null,
    extra: Partial<ProposalRow> = {},
  ): ProposalRow => {
    const values = lockedValues(
      { sets: proposed.sets, reps: proposed.reps, weightKg: proposed.weightKg },
      exercise,
      current,
    );
    return {
      key: rowKey(),
      exerciseId: exercise?.id ?? null,
      name: exercise?.name ?? proposed.name,
      ...(exercise ? {} : proposed.muscle ? { muscle: proposed.muscle } : {}),
      ...values,
      was: null,
      removed: false,
      repsLocked: exercise ? repsLockedFor(exercise) : false,
      weightLocked: exercise ? !exercise.requiresWeight : false,
      baseWeightKg: exercise ? baseWeight(exercise, lastWeights) : null,
      ...extra,
    };
  };

  const base = {
    name: raw.name.trim(),
    why: raw.why.trim(),
    ...(raw.focus ? { focus: raw.focus } : {}),
  };

  if (raw.kind === 'new') {
    const rows = entries.map(({ proposed, exercise }) => toRow(proposed, exercise, null));
    return rows.length > 0 ? { kind: 'new', ...base, rows } : null;
  }

  const routine = routines.find((r) => r.id === raw.targetRoutineId);
  if (!routine) return null;
  const byId: Record<ID, Exercise> = Object.fromEntries(exercises.map((e) => [e.id, e]));

  /* Every item of the routine, in order — the model's version where it gave one. */
  const used = new Set<number>();
  const rows: ProposalRow[] = [];
  const rowOfEntry = new Map<number, ProposalRow>();
  for (const item of [...routine.items].sort((a, b) => a.order - b.order)) {
    const exercise = byId[item.exerciseId];
    if (!exercise) continue;
    const was = itemValues(item, exercise, baseWeight(exercise, lastWeights));
    const index = entries.findIndex((e, i) => !used.has(i) && e.exercise?.id === exercise.id);
    if (index === -1) {
      // Not mentioned: kept exactly as it is. The prompt asks for every row, and
      // a row the model forgot is not a row the user asked to lose.
      rows.push({
        key: rowKey(),
        exerciseId: exercise.id,
        name: exercise.name,
        ...was,
        was,
        itemId: item.id,
        removed: false,
        repsLocked: repsLockedFor(exercise),
        weightLocked: !exercise.requiresWeight,
        baseWeightKg: baseWeight(exercise, lastWeights),
      });
      continue;
    }
    used.add(index);
    const { proposed } = entries[index];
    const row = toRow(proposed, exercise, was, {
      was,
      itemId: item.id,
      removed: proposed.change === 'removed',
    });
    rows.push(row);
    rowOfEntry.set(index, row);
  }

  /* Additions, each placed after the row that preceded it in the model's list. */
  let anchor: ProposalRow | null = null;
  entries.forEach((entry, index) => {
    const existing = rowOfEntry.get(index);
    if (existing) {
      anchor = existing;
      return;
    }
    if (used.has(index) || entry.proposed.change === 'removed') return;
    const row = toRow(entry.proposed, entry.exercise, null);
    const at: number = anchor ? rows.indexOf(anchor) + 1 : 0;
    rows.splice(at, 0, row);
    anchor = row;
  });

  return {
    kind: 'edit',
    targetRoutineId: routine.id,
    ...base,
    name: base.name || routine.name,
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* Reading a proposal                                                  */
/* ------------------------------------------------------------------ */

export function rowStatus(row: ProposalRow): RowStatus {
  if (row.removed) return 'removed';
  if (!row.was) return 'new';
  const { was } = row;
  return row.sets !== was.sets || row.reps !== was.reps || row.weightKg !== was.weightKg
    ? 'changed'
    : 'same';
}

/** "5 exercises · 16 sets", and how many rows differ from the routine. */
export function proposalTotals(proposal: ReviewProposal): {
  exercises: number;
  sets: number;
  changes: number;
} {
  const live = proposal.rows.filter((row) => !row.removed);
  return {
    exercises: live.length,
    sets: live.reduce((total, row) => total + row.sets, 0),
    changes: proposal.rows.filter((row) => rowStatus(row) !== 'same').length,
  };
}

/* ------------------------------------------------------------------ */
/* The review screen's edits                                           */
/* ------------------------------------------------------------------ */

export type RowField = 'sets' | 'reps' | 'weightKg';

/** One ± step: a set, a rep, or 2.5 kg. */
export const STEP: Record<RowField, number> = { sets: 1, reps: 1, weightKg: 2.5 };

function clampField(field: RowField, value: number): number {
  if (field === 'weightKg') return clampWeight(value);
  const range = CLAMP[field];
  return clampInt(value, range.min, range.max);
}

function mapRow(
  proposal: ReviewProposal,
  key: string,
  fn: (row: ProposalRow) => ProposalRow,
): ReviewProposal {
  return { ...proposal, rows: proposal.rows.map((row) => (row.key === key ? fn(row) : row)) };
}

/** Set one number on one row, held to its range and to what the exercise can take. */
export function setRowValue(
  proposal: ReviewProposal,
  key: string,
  field: RowField,
  value: number,
): ReviewProposal {
  return mapRow(proposal, key, (row) => {
    if (field === 'reps' && row.repsLocked) return row;
    if (field === 'weightKg' && row.weightLocked) return row;
    return { ...row, [field]: clampField(field, value) };
  });
}

export function stepRow(
  proposal: ReviewProposal,
  key: string,
  field: RowField,
  direction: 1 | -1,
): ReviewProposal {
  const row = proposal.rows.find((r) => r.key === key);
  if (!row) return proposal;
  return setRowValue(proposal, key, field, row[field] + direction * STEP[field]);
}

/**
 * ✕ on a row. An existing exercise of an edit is MARKED removed — it can be kept
 * again — while a row that only exists in the proposal is simply dropped.
 */
export function removeRow(proposal: ReviewProposal, key: string): ReviewProposal {
  const row = proposal.rows.find((r) => r.key === key);
  if (!row) return proposal;
  if (row.itemId) return mapRow(proposal, key, (r) => ({ ...r, removed: true }));
  return { ...proposal, rows: proposal.rows.filter((r) => r.key !== key) };
}

export function keepRow(proposal: ReviewProposal, key: string): ReviewProposal {
  return mapRow(proposal, key, (row) => ({ ...row, removed: false }));
}

/** `+ Add an exercise`, from the library, at the plan's own defaults. */
export function addRow(
  proposal: ReviewProposal,
  exercise: Exercise,
  lastWeights: Record<ID, number>,
): ReviewProposal {
  const base = baseWeight(exercise, lastWeights);
  const row: ProposalRow = {
    key: rowKey(),
    exerciseId: exercise.id,
    name: exercise.name,
    sets: clampInt(defaultTargetSets(exercise), CLAMP.sets.min, CLAMP.sets.max),
    reps: repsLockedFor(exercise)
      ? defaultTargetCount(exercise)
      : clampInt(defaultTargetCount(exercise), CLAMP.reps.min, CLAMP.reps.max),
    weightKg: base ?? 0,
    was: null,
    removed: false,
    repsLocked: repsLockedFor(exercise),
    weightLocked: !exercise.requiresWeight,
    baseWeightKg: base,
  };
  return { ...proposal, rows: [...proposal.rows, row] };
}

export function renameProposal(proposal: ReviewProposal, name: string): ReviewProposal {
  return { ...proposal, name: name.slice(0, 40) };
}

/* ------------------------------------------------------------------ */
/* Applying it                                                         */
/* ------------------------------------------------------------------ */

export interface Library {
  exercises: Exercise[];
  routines: Routine[];
}

export interface ApplyResult extends Library {
  routineId: ID;
  routineName: string;
}

/** An id nothing in `taken` claims. */
function freshId(prefix: string, stamp: string, taken: Set<string>): string {
  let n = 0;
  let id = `${prefix}_${stamp}`;
  while (taken.has(id)) {
    n += 1;
    id = `${prefix}_${stamp}${n.toString(36)}`;
  }
  taken.add(id);
  return id;
}

/** `Legs + Core`, or `Legs + Core (AI)` when that name is already a routine. */
export function uniqueRoutineName(name: string, routines: readonly Routine[]): string {
  const taken = new Set(routines.map((r) => r.name));
  const base = name.trim() || 'AI routine';
  if (!taken.has(base)) return base;
  if (!taken.has(`${base} (AI)`)) return `${base} (AI)`;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.has(`${base} (AI ${n})`)) return `${base} (AI ${n})`;
  }
  return `${base} (AI)`;
}

/**
 * The library with this proposal applied, or null when there is nothing to apply
 * it to. Pure: the inputs are not touched, which is what makes the caller's
 * snapshot a working Undo.
 */
export function planApply(
  proposal: ReviewProposal,
  library: Library,
  opts: { now?: Date; ownerId: ID },
): ApplyResult | null {
  const now = opts.now ?? new Date();
  const iso = now.toISOString();
  const stamp = now.getTime().toString(36);
  const live = proposal.rows.filter((row) => !row.removed);
  if (live.length === 0) return null;

  const takenExercise = new Set(library.exercises.map((e) => e.id));
  const takenRoutine = new Set(library.routines.map((r) => r.id));
  const takenItem = new Set(library.routines.flatMap((r) => r.items.map((i) => i.id)));

  /* 1. Exercises: create the unknown ones, move the starting weight on the rest. */
  const created: Exercise[] = [];
  const idOfRow = new Map<string, ID>();
  const startingWeight = new Map<ID, number>();
  for (const row of live) {
    if (row.exerciseId) {
      idOfRow.set(row.key, row.exerciseId);
      if (!row.weightLocked && row.weightKg > 0 && row.weightKg !== row.baseWeightKg) {
        startingWeight.set(row.exerciseId, row.weightKg);
      }
      continue;
    }
    const weighted = row.weightKg > 0;
    const exercise: Exercise = {
      id: freshId('ex_ai', stamp, takenExercise),
      ownerId: opts.ownerId,
      name: row.name,
      muscleGroups: row.muscle ? [row.muscle] : [],
      requiresWeight: weighted,
      countUnit: 'reps',
      loadMode: weighted ? 'external' : 'none',
      isUnilateral: false,
      ...(weighted ? { defaultWeightKg: row.weightKg } : {}),
      defaultCount: row.reps,
      defaultSets: row.sets,
      isArchived: false,
      createdAt: iso,
    };
    created.push(exercise);
    idOfRow.set(row.key, exercise.id);
  }
  const exercises = [
    ...library.exercises.map((e) =>
      startingWeight.has(e.id) ? { ...e, defaultWeightKg: startingWeight.get(e.id) } : e,
    ),
    ...created,
  ];

  const newItem = (row: ProposalRow, order: number): RoutineItem => ({
    id: freshId('ri_ai', `${stamp}_${order}`, takenItem),
    exerciseId: idOfRow.get(row.key)!,
    order,
    targetSets: row.sets,
    targetRepsMax: row.reps,
  });

  /* 2a. A new routine. */
  if (proposal.kind === 'new') {
    const name = uniqueRoutineName(proposal.name, library.routines);
    const routine: Routine = {
      id: freshId('r_ai', stamp, takenRoutine),
      ownerId: opts.ownerId,
      name,
      items: live.map((row, order) => newItem(row, order)),
      createdAt: iso,
      updatedAt: iso,
    };
    return {
      exercises,
      routines: [...library.routines, routine],
      routineId: routine.id,
      routineName: name,
    };
  }

  /* 2b. An edit: every untouched field of every kept item stays as it was. */
  const target = library.routines.find((r) => r.id === proposal.targetRoutineId);
  if (!target) return null;
  const itemsById = new Map(target.items.map((item) => [item.id, item]));
  let items: RoutineItem[] = [];
  for (const row of proposal.rows) {
    if (row.removed) continue;
    const order = items.length;
    const original = row.itemId ? itemsById.get(row.itemId) : undefined;
    if (!original) {
      // A row that named an item the user has since deleted stays deleted: the
      // suggestion was about a routine that no longer has it.
      if (row.itemId) continue;
      items.push(newItem(row, order));
      continue;
    }
    const was = row.was;
    const repsChanged = was != null && row.reps !== was.reps;
    const setsChanged = was != null && row.sets !== was.sets;
    if (!repsChanged && !setsChanged) {
      items.push(original);
      continue;
    }
    const next: RoutineItem = { ...original, order, targetSets: row.sets };
    if (repsChanged) {
      next.targetRepsMax = row.reps;
      delete next.targetRepsMin;
    }
    items.push(next);
  }
  /*
   * AN ITEM NO ROW MENTIONS IS KEPT, where it was. A suggestion is stored and can
   * be applied an hour later, after the user has added Dips to the routine in the
   * editor — and applying it must not quietly delete them. Same for an item whose
   * exercise was missing when the suggestion was built. Each goes back in after
   * the nearest item that preceded it in the routine as it is now.
   */
  const mentioned = new Set(proposal.rows.map((row) => row.itemId).filter(Boolean));
  const current = [...target.items].sort((a, b) => a.order - b.order);
  current.forEach((item, index) => {
    if (mentioned.has(item.id)) return;
    let at = 0;
    for (let j = index - 1; j >= 0; j -= 1) {
      const found = items.findIndex((x) => x.id === current[j].id);
      if (found !== -1) {
        at = found + 1;
        break;
      }
    }
    items.splice(at, 0, item);
  });
  items = items.map((item, order) => (item.order === order ? item : { ...item, order }));
  const name = proposal.name.trim() || target.name;
  const routine: Routine = { ...target, name, items, updatedAt: iso };
  return {
    exercises,
    routines: library.routines.map((r) => (r.id === target.id ? routine : r)),
    routineId: target.id,
    routineName: name,
  };
}
