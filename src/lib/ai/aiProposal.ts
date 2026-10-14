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
 * removal cannot be inferred from numbers at all. (Or from its silence: an
 * exercise left out of a list that names most of the routine is a removal too —
 * see `wholeList` in `normalizeProposal`.)
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
import { isSupersettedWithAbove } from '../routinePlan';
import { CLAMP, clampInt, clampWeight, type RoutineProposal } from './aiSchema';
import type { Exercise, ID, MuscleGroup, Routine, RoutineItem } from '../../types/models';

export interface RowValues {
  sets: number;
  /** The TOP of the range when there is one — what the plan is aiming for. */
  reps: number;
  weightKg: number;
  /** The bottom of a rep range (`8` of `8–10`). Absent = one number. */
  repsMin?: number;
  /** Supersetted with the row above it. Absent = not. */
  superset?: boolean;
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
  /**
   * The model put this exercise somewhere else in the routine. Only an edit that
   * lists the whole routine can move one — see `normalizeProposal`.
   */
  moved?: boolean;
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
  /** What each exercise starts at next session — `aiContext.nextStartWeights`. */
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

function itemValues(
  item: RoutineItem,
  exercise: Exercise,
  base: number | null,
  superset = false,
): RowValues {
  const values: RowValues = {
    sets: item.targetSets,
    reps: item.targetRepsMax ?? item.targetRepsMin ?? defaultTargetCount(exercise),
    weightKg: base ?? 0,
  };
  const { targetRepsMin: min, targetRepsMax: max } = item;
  if (min != null && max != null && min < max) values.repsMin = min;
  if (superset) values.superset = true;
  return values;
}

/** A range bottom worth keeping: a whole number under the top. */
function usableMin(min: number | undefined, reps: number): number | undefined {
  return min != null && Number.isFinite(min) && min >= 1 && min < reps
    ? Math.round(min)
    : undefined;
}

/** The model's numbers, held to what this exercise can take. */
function lockedValues(
  proposed: RowValues,
  exercise: Exercise | null,
  current: RowValues | null,
): RowValues {
  /*
   * THE TWO OPTIONAL FIELDS DEFAULT TO WHAT IS THERE. A model copying a row it is
   * not changing writes `"reps": 10` and nothing else far more often than it
   * copies the 8 of `8–10` — and reading that as "drop the range" crossed out a
   * change nobody asked for. So an untouched top keeps its bottom, and a missing
   * superset flag keeps the bracket; `false` is how the model removes one.
   */
  const locked = exercise != null && repsLockedFor(exercise);
  const reps = locked ? (current?.reps ?? defaultTargetCount(exercise)) : proposed.reps;
  const repsMin = locked
    ? current?.repsMin
    : usableMin(
        proposed.repsMin ?? (current && reps === current.reps ? current.repsMin : undefined),
        reps,
      );
  const superset = proposed.superset ?? current?.superset ?? false;
  const values: RowValues = {
    sets: proposed.sets,
    reps,
    weightKg: exercise && !exercise.requiresWeight ? 0 : proposed.weightKg,
  };
  if (repsMin != null) values.repsMin = repsMin;
  if (superset) values.superset = true;
  return values;
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
    /*
     * A row the model calls `same`, with the top it already has, keeps its range
     * and its bracket whatever else was written beside them: copying `12` back
     * as `"10-12"` is the sloppy copy this file exists to absorb, and taking it
     * as a new range drew a change nobody asked for. To change a range the model
     * says `changed`; the label is only believed in this one, harmless direction.
     */
    const copied = proposed.change === 'same' && current != null && proposed.reps === current.reps;
    const values = lockedValues(
      {
        sets: proposed.sets,
        reps: proposed.reps,
        weightKg: proposed.weightKg,
        ...(proposed.repsMin != null && !copied ? { repsMin: proposed.repsMin } : {}),
        ...(proposed.superset != null && !copied ? { superset: proposed.superset } : {}),
      },
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

  /*
   * A WHOLE LIST OMITS ON PURPOSE. The prompt asks for every exercise of the
   * routine, removals included as `removed`; what the model actually does, more
   * often than not, is write the routine as it should BE and leave the dropped
   * exercise out — and then say in its text that it removed it. Keeping such a
   * row drew a card that contradicted the sentence above it, three times running.
   * So when the model's list names most of the routine (more than half, and at
   * least two), it is the new routine, and an item it leaves out is marked
   * removed — on the card, struck through, where the user sees it and can keep it
   * again. A list naming one or two exercises of a long routine is a partial
   * edit, and the rest stays exactly as it is.
   */
  const routineIds = new Set(routine.items.map((item) => item.exerciseId));
  const named = new Set(
    entries.flatMap(({ exercise }) =>
      exercise && routineIds.has(exercise.id) ? [exercise.id] : [],
    ),
  );
  const wholeList = named.size >= 2 && named.size * 2 > routineIds.size;

  /* Every item of the routine, in order — the model's version where it gave one. */
  const used = new Set<number>();
  const rows: ProposalRow[] = [];
  const rowOfEntry = new Map<number, ProposalRow>();
  const sorted = [...routine.items].sort((a, b) => a.order - b.order);
  for (const [position, item] of sorted.entries()) {
    const exercise = byId[item.exerciseId];
    if (!exercise) continue;
    const was = itemValues(
      item,
      exercise,
      baseWeight(exercise, lastWeights),
      isSupersettedWithAbove(sorted, position),
    );
    const index = entries.findIndex((e, i) => !used.has(i) && e.exercise?.id === exercise.id);
    if (index === -1) {
      // Not mentioned: dropped from a whole list (above), otherwise kept as it is.
      rows.push({
        key: rowKey(),
        exerciseId: exercise.id,
        name: exercise.name,
        ...was,
        was,
        itemId: item.id,
        removed: wholeList,
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
    rowOfEntry.set(index, row);
    anchor = row;
  });

  /*
   * THE ORDER, when the model wrote the whole routine. Rows above follow the
   * routine's own order — a partial edit naming two exercises says nothing about
   * where the rest go — so "move squats first" used to be answered with a card
   * that moved nothing. A whole list IS an order: the rows take the model's, and
   * a row it left out (now removed) stays after the row that preceded it.
   */
  const ordered = wholeList ? reorderToModel(rows, entries.length, rowOfEntry) : rows;

  return {
    kind: 'edit',
    targetRoutineId: routine.id,
    ...base,
    name: base.name || routine.name,
    rows: ordered,
  };
}

/** `rows` in the model's order, with `moved` on each existing row that changed place. */
function reorderToModel(
  rows: readonly ProposalRow[],
  entryCount: number,
  rowOfEntry: ReadonlyMap<number, ProposalRow>,
): ProposalRow[] {
  const out: ProposalRow[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    const row = rowOfEntry.get(i);
    if (row && !out.includes(row)) out.push(row);
  }
  rows.forEach((row, index) => {
    if (out.includes(row)) return;
    const before = rows
      .slice(0, index)
      .reverse()
      .find((r) => out.includes(r));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, row);
  });
  // Moved = its place among the routine's own rows is not what it was.
  const existingBefore = rows.filter((row) => row.itemId);
  const existingAfter = out.filter((row) => row.itemId);
  /*
   * A BRACKET MEANS "WITH THE ONE ABOVE", so it does not survive a new neighbour
   * above. Dips moved between Row and Curl would otherwise pull Curl out of its
   * superset with Row and into one with Dips — a pairing nobody asked for. A row
   * whose row above changed keeps its flag only if the model set it on purpose
   * (it differs from what the row had); an inherited one is dropped.
   */
  const live = (list: readonly ProposalRow[]) => list.filter((row) => !row.removed);
  const aboveBefore = new Map(live(rows).map((row, i, all) => [row, all[i - 1]]));
  const aboveAfter = new Map(live(out).map((row, i, all) => [row, all[i - 1]]));
  return out.map((row) => {
    if (!row.itemId || row.removed) return row;
    let next = row;
    if (existingAfter.indexOf(row) !== existingBefore.indexOf(row)) next = { ...next, moved: true };
    const inherited = Boolean(row.superset) === Boolean(row.was?.superset);
    if (row.superset && inherited && aboveBefore.get(row) !== aboveAfter.get(row)) {
      next = { ...next };
      delete next.superset;
    }
    return next;
  });
}

/* ------------------------------------------------------------------ */
/* Reading a proposal                                                  */
/* ------------------------------------------------------------------ */

export function rowStatus(row: ProposalRow): RowStatus {
  if (row.removed) return 'removed';
  if (!row.was) return 'new';
  return row.moved || valuesDiffer(row, row.was) ? 'changed' : 'same';
}

/** Any of a row's numbers, its range or its bracket, against what it was. */
export function valuesDiffer(row: RowValues, was: RowValues): boolean {
  return (
    row.sets !== was.sets ||
    row.reps !== was.reps ||
    row.weightKg !== was.weightKg ||
    (row.repsMin ?? null) !== (was.repsMin ?? null) ||
    Boolean(row.superset) !== Boolean(was.superset)
  );
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
const STEP: Record<RowField, number> = { sets: 1, reps: 1, weightKg: 2.5 };

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
    const next = { ...row, [field]: clampField(field, value) };
    // A top stepped down onto its bottom is one number again, not `10–10`.
    if (field === 'reps' && next.repsMin != null && next.repsMin >= next.reps) delete next.repsMin;
    return next;
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

/**
 * Superset groups rebuilt from one flag per item — "with the one above". A run
 * shares the group of its first item; an item on its own carries none. Group
 * strings are only ever compared (`lib/routinePlan.ts`), so rebuilding them is
 * invisible except where a bracket actually changed.
 */
export function regroup(
  items: readonly RoutineItem[],
  withAbove: readonly boolean[],
): RoutineItem[] {
  const groups: (string | undefined)[] = [];
  items.forEach((_item, i) => {
    if (i > 0 && withAbove[i]) {
      const group = groups[i - 1] ?? `sg_${items[i - 1].id}`;
      groups[i - 1] = group;
      groups[i] = group;
    } else {
      groups[i] = undefined;
    }
  });
  return items.map((item, i) => {
    const group = groups[i];
    if (group === item.supersetGroup) return item;
    const next = { ...item };
    if (group) next.supersetGroup = group;
    else delete next.supersetGroup;
    return next;
  });
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
  /* Each kept row with the exercise it lands on, so step 2 reads the id off the
     row instead of looking it up in a side map that the type cannot promise. */
  const created: Exercise[] = [];
  const resolved: (ProposalRow & { exerciseId: ID })[] = [];
  const startingWeight = new Map<ID, number>();
  for (const row of live) {
    if (row.exerciseId) {
      resolved.push({ ...row, exerciseId: row.exerciseId });
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
    resolved.push({ ...row, exerciseId: exercise.id });
  }
  const exercises = [
    ...library.exercises.map((e) =>
      startingWeight.has(e.id)
        ? // Stamped, so the next session starts here rather than at last
          // session's weight — see `Exercise.startWeightSetAt`.
          { ...e, defaultWeightKg: startingWeight.get(e.id), startWeightSetAt: iso }
        : e,
    ),
    ...created,
  ];

  const newItem = (row: ProposalRow & { exerciseId: ID }, order: number): RoutineItem => ({
    id: freshId('ri_ai', `${stamp}_${order}`, takenItem),
    exerciseId: row.exerciseId,
    order,
    targetSets: row.sets,
    targetRepsMax: row.reps,
    ...(row.repsMin != null && row.repsMin < row.reps ? { targetRepsMin: row.repsMin } : {}),
  });

  /* 2a. A new routine. */
  if (proposal.kind === 'new') {
    const name = uniqueRoutineName(proposal.name, library.routines);
    const items = resolved.map((row, order) => newItem(row, order));
    const routine: Routine = {
      id: freshId('r_ai', stamp, takenRoutine),
      ownerId: opts.ownerId,
      name,
      items: regroup(
        items,
        resolved.map((row) => row.superset === true),
      ),
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
  for (const row of resolved) {
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
    const repsChanged =
      was != null && (row.reps !== was.reps || (row.repsMin ?? null) !== (was.repsMin ?? null));
    const setsChanged = was != null && row.sets !== was.sets;
    if (!repsChanged && !setsChanged) {
      items.push(original);
      continue;
    }
    const next: RoutineItem = { ...original, order, targetSets: row.sets };
    if (repsChanged) {
      next.targetRepsMax = row.reps;
      if (row.repsMin != null && row.repsMin < row.reps) next.targetRepsMin = row.repsMin;
      else delete next.targetRepsMin;
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
  /*
   * THE BRACKETS, only when a row asks for a different one — otherwise every
   * group string stays exactly as the editor left it. Each item's "with the one
   * above" comes from its row, or, for an item no row mentions, from where it
   * stood before.
   */
  const rowOfItem = new Map(resolved.filter((r) => r.itemId).map((r) => [r.itemId as ID, r]));
  const bracketsMoved = resolved.some((row) =>
    row.was ? Boolean(row.superset) !== Boolean(row.was.superset) || row.moved : row.superset,
  );
  if (bracketsMoved) {
    const before = [...target.items].sort((a, b) => a.order - b.order);
    const added = new Map(
      items.filter((item) => !itemsById.has(item.id)).map((item) => [item.id, item]),
    );
    const rowOfNew = new Map<ID, ProposalRow>();
    resolved
      .filter((row) => !row.itemId)
      .forEach((row, i) => {
        const item = [...added.values()][i];
        if (item) rowOfNew.set(item.id, row);
      });
    items = regroup(
      items,
      items.map((item) => {
        const row = rowOfItem.get(item.id) ?? rowOfNew.get(item.id);
        if (row) return row.superset === true;
        const at = before.findIndex((x) => x.id === item.id);
        return at > 0 && isSupersettedWithAbove(before, at);
      }),
    );
  }
  const name = proposal.name.trim() || target.name;
  const routine: Routine = { ...target, name, items, updatedAt: iso };
  return {
    exercises,
    routines: library.routines.map((r) => (r.id === target.id ? routine : r)),
    routineId: target.id,
    routineName: name,
  };
}
