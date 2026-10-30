/**
 * The decisions behind the Workout section and Home's running-workout card
 * (the 2.9 findability redesign, #7 #8 #11 #13 #18). Pure, so each one is
 * tested without a renderer; the screens are composition.
 *
 * ── WHERE YOU ARE, NOT HOW FAR ────────────────────────────────────────────
 *
 * Home's running card reads `28:40 · Bench press, set 3 of 4`. The set it names
 * is `upNextSet` — the one the session glows — so the card, the glow and Focus
 * can never point at three different sets. Counted among the exercise's WORKING
 * sets, as the set rows number them: a warm-up is a `W`, not "set 1", so an
 * up-next warm-up says `warm-up` instead of a number. With nothing left to log
 * the line falls back to the session's own count, `17 of 17 sets`.
 *
 * ── THE PROGRESS SPARKLINE IS VOLUME, AND ONLY THE HONEST KIND ─────────────
 *
 * Session volume over the last ten workouts, oldest first. A workout whose
 * volume is a floor (`volumeIsPartial`) or zero (all bodyweight with no
 * bodyweight set, all timed holds) is left out rather than drawn as a dip —
 * a line that drops because the user did planks is a line that lies. It is a
 * shape, not a chart: the numbers live behind `Graphs ›`. Rejected: workouts
 * per week (the weekly goal card right above already says that) and a top-set
 * line (which exercise's?).
 *
 * ── THE EXTENDED ▶ PILL ────────────────────────────────────────────────────
 *
 * At the top of the list there is room, and `▶ Open Push` says what the slot
 * does in words; once the list moves, the words would sit over the rows being
 * read, so it folds to the round ▶. Hysteresis (fold past 32, unfold under 16)
 * for the same reason the bubble has it: a thumb resting near one line would
 * make it flicker.
 *
 * ── AN EMPTY WORKOUT IS A ROUTINE WITH NO ID ───────────────────────────────
 *
 * `Start an empty workout` builds the session from a routine with no items and
 * an EMPTY id, never stored in the library. Every reader of `routineId` in the
 * app already tests it for truthiness (`buildCompletedWorkout`, the sequence
 * advance, the plan diff, the debrief), so `''` reads as "not from a routine"
 * everywhere without a new code path. The session screen's own empty state is
 * what greets it — `Add an exercise` — which is the next thing to do anyway.
 */

import type { CompletedWorkout } from './completedWorkout';
import type { DraftSession } from './draft';
import { t, type Language } from './i18n';
import { upNextSet } from './upNext';
import type { ID, Routine } from '../types/models';

/* ------------------------------------------------------------------ */
/* #7 — Home's running-workout card                                   */
/* ------------------------------------------------------------------ */

export type RunningSet =
  | { kind: 'set'; exercise: string; set: number; of: number }
  | { kind: 'warmup'; exercise: string }
  | { kind: 'done'; done: number; total: number };

/** The set the session is up to, as the running card names it. */
export function runningSet(session: DraftSession | null): RunningSet | null {
  if (!session) return null;
  const next = upNextSet(session);
  if (!next) {
    let total = 0;
    for (const entry of session.entries) total += entry.sets.length;
    return { kind: 'done', done: total, total };
  }
  const entry = session.entries.find((e) => e.localId === next.entryId);
  const set = entry?.sets.find((s) => s.localId === next.setId);
  if (!entry || !set) return null;
  if (set.isWarmup) return { kind: 'warmup', exercise: entry.exercise.name };
  const working = entry.sets.filter((s) => !s.isWarmup);
  return {
    kind: 'set',
    exercise: entry.exercise.name,
    set: working.findIndex((s) => s.localId === set.localId) + 1,
    of: working.length,
  };
}

/** `28:40 · Bench press, set 3 of 4` — the card's second line. */
export function describeRunningSet(running: RunningSet | null, time: string, lang: Language) {
  if (!running) return time;
  switch (running.kind) {
    case 'set':
      return t('{time} · {exercise}, set {set} of {of}', lang, {
        time,
        exercise: running.exercise,
        set: running.set,
        of: running.of,
      });
    case 'warmup':
      return t('{time} · {exercise}, warm-up', lang, { time, exercise: running.exercise });
    case 'done':
      return `${time} · ${t('{done} of {total} sets', lang, {
        done: running.done,
        total: running.total,
      })}`;
  }
}

/* ------------------------------------------------------------------ */
/* #8 — the floating ▶, extended at the top                           */
/* ------------------------------------------------------------------ */

const FAB_FOLD_Y = 32;
const FAB_UNFOLD_Y = 16;

/** Whether the ▶ shows its words at scroll offset `y`, given what it showed. */
export function nextFabExtended(extended: boolean, y: number): boolean {
  if (!Number.isFinite(y)) return extended;
  if (extended) return y <= FAB_FOLD_Y;
  return y < FAB_UNFOLD_Y;
}

/* ------------------------------------------------------------------ */
/* #11 — the Progress card and the last-session card                  */
/* ------------------------------------------------------------------ */

export const PROGRESS_SPARK_COUNT = 10;

/**
 * The sparkline's points: whole volumes of the last `count` workouts that have
 * one, oldest first, with a band padded so a flat run does not draw on the floor.
 * Null under two points — one point is not a shape.
 */
export function progressSpark(
  workouts: readonly CompletedWorkout[],
  count: number = PROGRESS_SPARK_COUNT,
): { values: number[]; min: number; max: number } | null {
  const values = workouts
    .filter((w) => !w.volumeIsPartial && w.totalVolumeKg > 0)
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
    .slice(-count)
    .map((w) => w.totalVolumeKg);
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = Math.max((high - low) * 0.15, high * 0.05, 1);
  return { values, min: Math.max(0, low - pad), max: high + pad };
}

export interface LastSession {
  workoutId: ID;
  title: string;
  startedAt: string;
  /** In the order they were trained, each exercise once. */
  exercises: { exerciseId: ID; name: string }[];
}

/** The most recent workout, with its exercises as the links the card draws. */
export function lastSession(workouts: readonly CompletedWorkout[]): LastSession | null {
  let latest: CompletedWorkout | null = null;
  for (const workout of workouts) {
    if (!latest || workout.startedAt > latest.startedAt) latest = workout;
  }
  if (!latest) return null;
  const seen = new Set<ID>();
  const exercises: LastSession['exercises'] = [];
  for (const exercise of latest.exercises) {
    if (seen.has(exercise.exerciseId)) continue;
    seen.add(exercise.exerciseId);
    exercises.push({ exerciseId: exercise.exerciseId, name: exercise.name });
  }
  return { workoutId: latest.id, title: latest.title, startedAt: latest.startedAt, exercises };
}

/* ------------------------------------------------------------------ */
/* #11 / #13 — the weekly workout goal card                           */
/* ------------------------------------------------------------------ */

/** One pip per workout of the goal, the first `done` of them lit. */
export function goalPips(done: number, goal: number): boolean[] {
  const size = Math.max(0, Math.floor(goal));
  return Array.from({ length: size }, (_, i) => i < done);
}

/** `2 of 4 this week`, or `… · excused`. */
export function describeGoalShort(
  status: { done: number; goal: number; excused: boolean },
  lang: Language,
): string {
  const line = t('{done} of {goal} this week', lang, { done: status.done, goal: status.goal });
  return status.excused ? t('{line} · excused', lang, { line }) : line;
}

/* ------------------------------------------------------------------ */
/* #18 — Start an empty workout                                       */
/* ------------------------------------------------------------------ */

/** The routine an empty workout is built from. See the file header. */
export function emptyWorkoutRoutine(input: { name: string; ownerId: ID; now: Date }): Routine {
  const at = input.now.toISOString();
  return {
    id: '',
    ownerId: input.ownerId,
    name: input.name,
    items: [],
    createdAt: at,
    updatedAt: at,
  };
}
