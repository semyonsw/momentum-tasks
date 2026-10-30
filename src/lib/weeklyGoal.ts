/**
 * The weekly training goal (W8): workouts this week against a number the user
 * chose — a ring on the Workout home, `2 of 3 workouts this week`.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ (◔)  THIS WEEK                         › │
 *   │      2 of 3 workouts this week           │
 *   ╰──────────────────────────────────────────╯
 *
 * ── A RING, AND NO STREAK ─────────────────────────────────────────────────
 *
 * The design carried "6 weeks in a row at 3+" beside the bar. It is not built
 * (IMPLEMENTATION_DECISIONS row 5): a streak turns one week of flu into the loss
 * of everything before it, and for training the honest response to a lost week
 * is to rest, which a streak punishes. So every week starts empty on Monday and
 * is about itself; nothing here counts weeks, and nothing compares one with the
 * one before. Rejected: a streak that skips excused weeks — it is still a number
 * that a single bad week resets, and the reset is the part that hurts.
 *
 * ── ISO WEEKS, IN LOCAL DAYS ──────────────────────────────────────────────
 *
 * Monday to Sunday, the week every other screen in the app draws
 * (`days.weekStart`). A workout belongs to the local day it STARTED on — the
 * same rule the weekly review counts by, so the two can never disagree about
 * last week. Sunday is the last day of its week, not the first of the next, and
 * a week that straddles New Year (28 Dec – 3 Jan) is one week: the key is its
 * Monday, a plain `YYYY-MM-DD`, so no week number and no year is ever computed.
 *
 * WORKOUTS, NOT DAYS. Two sessions on one day are two workouts — the label says
 * "workouts", and a morning swim and an evening lift are both training.
 *
 * ── EXCUSED WEEKS ─────────────────────────────────────────────────────────
 *
 * Illness, travel: the user can mark this week or one already past as excused
 * (`settings.excusedWeeks`, a list of Mondays). An excused week reads "excused"
 * instead of a fraction short of its goal — it is not a miss, because there are
 * no misses to count. A week still ahead cannot be excused: a future week has
 * not happened, and excusing it now is a promise, not a fact.
 *
 * ── THE GOAL ──────────────────────────────────────────────────────────────
 *
 * 1–7, three by default. Seven is every day; above that is two a day, which is a
 * plan nobody needs a ring for. Stored only when the user set it
 * (`settings.weeklyWorkoutGoal`), so a phone that never touched it reads 3.
 *
 * ALWAYS SHOWN since 2.9 (redesign #13). It was opt-in with the rest of Wave 3,
 * behind the engagement switch, and that put a plain training target behind a
 * switch called "Achievements and levels" — a goal for the week is not a game
 * mechanic, and nobody looking for one would think to turn on levels to find it.
 * The card is on the Workout section and its number is a row in Workout
 * settings, whatever that switch says.
 */

import type { CompletedWorkout } from './completedWorkout';
import { dayKey, parseDay, shiftDay, weekStart } from './days';
import { plural, t, type Language } from './i18n';

export const WEEKLY_GOAL_LIMITS = { min: 1, max: 7, default: 3 } as const;

/** Enough for five years of excused weeks; a corrupt blob cannot grow past it. */
const EXCUSED_CAP = 260;

/**
 * The stored goal, or undefined. A whole number clamped into 1–7; anything that
 * is not a finite number is "never set", not a guess.
 */
export function usableWeeklyGoal(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const { min, max } = WEEKLY_GOAL_LIMITS;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** The goal in force: the stored one, or three. */
export function weeklyGoalOf(stored: number | undefined): number {
  return usableWeeklyGoal(stored) ?? WEEKLY_GOAL_LIMITS.default;
}

/** One step of the ± chips, staying inside 1–7. */
export function stepWeeklyGoal(stored: number | undefined, delta: number): number {
  return usableWeeklyGoal(weeklyGoalOf(stored) + delta) ?? WEEKLY_GOAL_LIMITS.default;
}

/** A real date that is a Monday, as `YYYY-MM-DD`. */
function isMonday(value: unknown): value is string {
  return typeof value === 'string' && parseDay(value) != null && weekStart(value) === value;
}

/**
 * The excused weeks: real Mondays, once each, oldest first, capped. Absent when
 * empty, so a 2.2.0 phone and one that excused and un-excused a week look alike.
 */
export function usableExcusedWeeks(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept = [...new Set(value.filter(isMonday))].sort().slice(-EXCUSED_CAP);
  return kept.length > 0 ? kept : undefined;
}

/**
 * Excuse, or stop excusing, the week `day` falls in. A week after `today`'s is
 * refused (returned unchanged) — see the file header.
 */
export function setWeekExcused(
  list: readonly string[] | undefined,
  day: string,
  excused: boolean,
  today: string,
): string[] | undefined {
  const monday = weekStart(day);
  if (!isMonday(monday)) return usableExcusedWeeks(list);
  if (excused && monday > weekStart(today)) return usableExcusedWeeks(list);
  const rest = (list ?? []).filter((week) => week !== monday);
  return usableExcusedWeeks(excused ? [...rest, monday] : rest);
}

/** Whether the week `day` falls in is excused. */
export function isWeekExcused(list: readonly string[] | undefined, day: string): boolean {
  return (list ?? []).includes(weekStart(day));
}

/** Workouts that started on a local day of the week `day` falls in. */
export function workoutsInWeek(workouts: readonly CompletedWorkout[], day: string): number {
  const from = weekStart(day);
  const to = shiftDay(from, 6);
  let count = 0;
  for (const workout of workouts) {
    const started = dayKey(workout.startedAt);
    if (started >= from && started <= to) count += 1;
  }
  return count;
}

export interface WeekGoalStatus {
  /** The Monday, and the Sunday, of the week. */
  from: string;
  to: string;
  done: number;
  goal: number;
  /** 0–1, for the ring. Capped at 1: a fourth workout over three is not 133%. */
  fraction: number;
  met: boolean;
  excused: boolean;
}

/** One week against the goal. Pure: today is not read, `day` names the week. */
export function weekGoalStatus(input: {
  workouts: readonly CompletedWorkout[];
  day: string;
  goal: number | undefined;
  excusedWeeks: readonly string[] | undefined;
}): WeekGoalStatus {
  const from = weekStart(input.day);
  const goal = weeklyGoalOf(input.goal);
  const done = workoutsInWeek(input.workouts, from);
  return {
    from,
    to: shiftDay(from, 6),
    done,
    goal,
    fraction: Math.min(1, done / goal),
    met: done >= goal,
    excused: isWeekExcused(input.excusedWeeks, from),
  };
}

/**
 * The ring's sentence. Counted against the GOAL's plural ("2 of 3 workouts",
 * "1 of 1 workout"; Russian "из 3 тренировок", "из 1 тренировки"), and an
 * excused week says so instead of a fraction — the count stays beside it,
 * because a workout done in an excused week still happened.
 */
export function describeWeekGoal(status: WeekGoalStatus, lang: Language): string {
  const vars = { done: status.done, goal: status.goal };
  const line = t(
    plural(status.goal, lang, {
      one: '{done} of {goal} workout this week',
      many: '{done} of {goal} workouts this week',
    }),
    lang,
    vars,
  );
  return status.excused ? t('{line} · excused', lang, { line }) : line;
}
