/**
 * Weekly sets per MUSCLE (W3), for the body map — the sets-per-cluster count
 * one level down.
 *
 *   week of 28 Sep          chest 14   back 18   biceps 12 …
 *   bench  ['chest', 'triceps']   → chest +1, triceps +½ per set
 *
 * ── WHAT IT EXTENDS, AND WHY IT DOES NOT REPLACE IT ────────────────────────
 *
 * `lib/balance.ts` counts each working set ONCE, under the cluster of the
 * exercise's primary muscle, and the user's weekly targets (`weeklySetTargets`)
 * are numbers typed against exactly that count. So the cluster figures this file
 * returns are `clusterBalance` itself, run over the same week's workouts — not a
 * second opinion computed beside it — and a target is only ever compared with
 * the count it was set against.
 *
 * The map needs more than that, because a muscle is not a cluster: a bench press
 * works the triceps too. `Exercise.muscleGroups` is ORDERED — the first is the
 * primary, the rest are secondary (`lib/muscles.ts`) — so that data exists, and
 * the map uses it:
 *
 *  • PRIMARY MUSCLE: 1 per working set.
 *  • EACH SECONDARY MUSCLE: ½ per working set (IMPLEMENTATION_DECISIONS T-21).
 *    Rejected: 1 (a set of bench would count as two sets of work, and the map
 *    would show more sets than were done), and 0 (triceps after a month of
 *    pressing would read as never trained). The screen says "secondary muscles
 *    count half" in its micro text, so a 14.5 is never a mystery.
 *  • An exercise with ONE muscle has no secondaries — the half rule applies only
 *    where the library declares them.
 *
 * ── COUNTING RULES (shared with `balance.ts`) ──────────────────────────────
 *
 *  1. Completed working sets only; warm-ups out, drop/failure/AMRAP in (T-12).
 *  2. An exercise deleted from the library since cannot be placed on a body; its
 *     sets land in `unfiled` rather than disappearing.
 *  3. THE WEEK IS THE ISO WEEK, Monday to Sunday, of the workout's LOCAL start
 *     day — the day the user trained, as every other week in the app.
 *  4. `cardio` and `calisthenics` are muscle groups with no place on a body;
 *     they are counted (and the screen lists them under the map) but not drawn.
 */

import { clusterBalance } from './balance';
import type { CompletedWorkout } from './completedWorkout';
import { dayKey, shiftDay, weekStart } from './days';
import { MUSCLE_GROUPS } from './muscles';
import type { Exercise, ID, MuscleCluster, MuscleGroup } from '../types/models';

/** What a secondary muscle gets per working set. */
export const SECONDARY_SHARE = 0.5;

export interface WeekRange {
  /** Monday, `YYYY-MM-DD`. */
  from: string;
  /** Sunday, `YYYY-MM-DD`. */
  to: string;
}

export interface MuscleVolume {
  week: WeekRange;
  /** Every muscle group, always — a zero is the point. Halves possible. */
  muscles: Record<MuscleGroup, number>;
  /** Primary-only working sets per cluster: exactly `clusterBalance` over the week. */
  clusters: Record<MuscleCluster, number>;
  /** Sets whose exercise is gone from the library. */
  unfiled: number;
  /** Working sets in the week, unfiled included. */
  totalSets: number;
}

/** The ISO week (Mon–Sun) `day` falls in. */
export function isoWeek(day: string): WeekRange {
  const from = weekStart(day);
  return { from, to: shiftDay(from, 6) };
}

/** Whether a workout belongs to the week, by its local start day. */
export function inWeek(workout: Pick<CompletedWorkout, 'startedAt'>, week: WeekRange): boolean {
  const day = dayKey(workout.startedAt);
  return day !== '' && day >= week.from && day <= week.to;
}

export function muscleVolume(params: {
  workouts: readonly CompletedWorkout[];
  exercisesById: Record<ID, Pick<Exercise, 'muscleGroups'>>;
  /** Any day in the week wanted. */
  day: string;
}): MuscleVolume {
  const week = isoWeek(params.day);
  const workouts = params.workouts.filter((workout) => inWeek(workout, week));

  const muscles = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as Record<
    MuscleGroup,
    number
  >;
  for (const workout of workouts) {
    for (const row of workout.sets) {
      if (row.isWarmup || !row.isCompleted) continue;
      const groups = params.exercisesById[row.exerciseId]?.muscleGroups ?? [];
      const [primary, ...rest] = groups;
      if (!primary || !(primary in muscles)) continue;
      muscles[primary] += 1;
      // Distinct, and never the primary again: a library row that lists a muscle
      // twice must not earn it a set and a half.
      for (const secondary of new Set(rest)) {
        if (secondary !== primary && secondary in muscles) muscles[secondary] += SECONDARY_SHARE;
      }
    }
  }

  // The existing count, over the same week — so a target meets the number it was set against.
  const balance = clusterBalance({
    workouts,
    exercisesById: params.exercisesById,
    windowDays: null,
  });

  return {
    week,
    muscles,
    clusters: Object.fromEntries(balance.clusters.map((c) => [c.cluster, c.sets])) as Record<
      MuscleCluster,
      number
    >,
    unfiled: balance.unfiled,
    totalSets: balance.totalSets,
  };
}

/**
 * The four heat steps of the map, plus 0: none, 1–4, 5–9, 10–14, 15+ (design 17).
 * A half counts toward the step it is in — 4.5 is still "1–4".
 */
export function muscleHeat(sets: number): 0 | 1 | 2 | 3 | 4 {
  if (!(sets > 0)) return 0;
  if (sets < 5) return 1;
  if (sets < 10) return 2;
  if (sets < 15) return 3;
  return 4;
}

/** `14`, `14.5` — a half is real here, and a `.0` is not. */
export function formatSets(sets: number): string {
  return Number.isInteger(sets) ? String(sets) : sets.toFixed(1);
}

/** The muscles the map draws; the rest are listed under it. */
export const OFF_MAP: readonly MuscleGroup[] = ['cardio', 'calisthenics'];

/**
 * What a tapped cluster line says about its target, or null without one:
 * "2 sets to your target" / "Target met · 3 over". Sets are the cluster's
 * primary-only count — the count the target was typed against.
 */
export function targetNote(
  sets: number,
  target: number | undefined,
): { kind: 'short'; left: number } | { kind: 'met'; over: number } | null {
  if (target == null) return null;
  return sets >= target
    ? { kind: 'met', over: sets - target }
    : { kind: 'short', left: target - sets };
}
