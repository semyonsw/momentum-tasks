/**
 * Habit strength (T4): how established a task is, 0–100, beside the streak.
 *
 *   ( 94% )  Strong — recent days weigh more than old ones.
 *
 * ── WHY A SECOND NUMBER NEXT TO THE STREAK ────────────────────────────────
 *
 * The streak answers "how long since I last let it go", and it answers it
 * honestly — which is also its cruelty: forty days in a row and one unanswered
 * Tuesday reads `0`. Excusals take the deliberate misses out of that, but not
 * the real ones. This is the number that forgives one bad day: it is Loop Habit
 * Tracker's score, an exponential moving average over the days the task asks
 * on, so a single miss after a long run takes off a few points and a month of
 * neglect takes off most of them.
 *
 * ── THE FORMULA, AND THE ONE CHANGE TO IT ─────────────────────────────────
 *
 * Loop: per calendar day, `score = score · m + checkmark · (1 − m)` with
 * `m = 0.5 ^ (√f / 13)`, where `f` is the habit's frequency in times per day.
 * For a daily habit that is a half-life of 13 days.
 *
 * Here the average steps over SCHEDULED days only, so a Mon/Wed/Fri task's
 * weekend is not decay, and the multiplier is rescaled per step so the HALF-LIFE
 * IN CALENDAR TIME is still Loop's: a step covers 1/f days on average, so
 * `m_step = (0.5 ^ (√f / 13)) ^ (1/f) = 0.5 ^ (1 / (13·√f))`. Daily: m ≈ 0.948,
 * half-life 13 asked days. Mon/Wed/Fri (f = 3/7): m ≈ 0.922, half-life ≈ 8.5
 * asked days ≈ 20 calendar days — Loop's own figure for 3/week.
 * Rejected: stepping every calendar day and counting an off day as neither (the
 * score would then freeze over a weekend but take seven calendar days of decay
 * per missed week on a weekly task, which double-counts the schedule), and
 * Loop's raw per-day `m` per asked day (a weekly task would need half a year to
 * reach 50%).
 *
 * ── WHAT COUNTS ───────────────────────────────────────────────────────────
 *
 *  - `done` is a 1; an unanswered PAST day is a 0 — the day went by.
 *  - Excused ("missed on purpose", or a pause) is NEITHER: the day is skipped,
 *    the score neither rises nor decays. That is the same promise the streak
 *    makes, and the design's note says it in so many words.
 *  - TODAY counts only once it is done. Unanswered, it is not evidence yet —
 *    the same rule `streakOf` follows — so the ring does not dip every morning.
 *  - Days before `startedOn` and after an archive do not exist (`asksOn`).
 *  - A one-day task has no habit to be strong at: `null`, and no ring.
 *
 * The score starts at 0, as Loop's does: a habit is not 50% established on the
 * day it is written down.
 *
 * ── THE ONE NUMBER PICKED: X = 10 ─────────────────────────────────────────
 *
 * A single miss after a long run drops the score by `score · (1 − m)`, at most
 * `100 · (1 − m)`: 5.2 points for a daily task, 7.8 for three times a week. So
 * for any task asked at least three days a week, one miss costs LESS THAN 10
 * POINTS — a tenth, which is what "forgives one bad day" has to mean to be
 * visible on a 140 dp ring. A once-a-week task loses up to 13: one miss there is
 * a whole week of its habit, and the number is honest about that.
 *
 * ── N TIMES A WEEK STEPS BY THE WEEK (T2) ─────────────────────────────────
 *
 * A weekly task owes no single day, so it cannot step per asked day: an
 * unanswered Tuesday is not a 0. It steps once per WEEK, with that week's share
 * — done ÷ needed, capped at 1 (`weekProgress`) — so 2 of 3 is two thirds of a
 * good week rather than a failed one. The week's multiplier is the per-day one
 * to the power N (a week is N asked slots, f = N/7), which keeps Loop's calendar
 * half-life: 3 a week ≈ 20 days, the same as Mon/Wed/Fri. A week is applied the
 * day it is met (as today counts once done), or after its Sunday with its
 * share; the week being lived and still short is not evidence yet; a week that
 * asked nothing (paused) is skipped.
 */

import { shiftDay } from './days';
import { asksOn, entryOf, weekProgress, type Task, type TaskLog } from './tasks';

/** Loop's 13: the half-life, in asked days, of a once-a-day habit. */
const HALF_LIFE_DAILY = 13;

/** How far back a score is walked at most: ten years of days. Junk `startedOn` stops here. */
const MAX_WALK_DAYS = 3660;

/** The sparkline's window. */
export const STRENGTH_SERIES_DAYS = 90;

/** Times per day the task asks, on average. `null` for a one-day task or no days. */
export function strengthFrequency(task: Task): number | null {
  if (task.schedule.kind === 'once') return null;
  if (task.schedule.kind === 'daily') return 1;
  if (task.schedule.kind === 'weekly') return task.schedule.times / 7;
  const days = new Set(task.schedule.days).size;
  return days === 0 ? null : days / 7;
}

/** The weight the old score keeps at each asked day. See the header. */
export function strengthMultiplier(frequency: number): number {
  return Math.pow(0.5, 1 / (HALF_LIFE_DAILY * Math.sqrt(frequency)));
}

/** One day of the walk: the score after it, or null before the task existed. */
export interface StrengthPoint {
  day: string;
  value: number | null;
}

/**
 * Walk from `startedOn` to `today`, calling `onDay` with the score after each
 * calendar day. The one loop both answers below share.
 */
function walk(
  task: Task,
  log: TaskLog,
  today: string,
  onDay?: (day: string, value: number | null) => void,
  from?: string,
): number | null {
  const frequency = strengthFrequency(task);
  if (frequency === null) return null;
  if (task.schedule.kind === 'weekly') {
    return walkWeeks(task, log, today, task.schedule.times, frequency, onDay, from);
  }
  const m = strengthMultiplier(frequency);

  const floor = shiftDay(today, -MAX_WALK_DAYS);
  let day = task.startedOn > floor ? task.startedOn : floor;
  // Before the window the caller asked for, only the score matters.
  let score = 0;
  for (let i = 0; i <= MAX_WALK_DAYS + 1 && day <= today; i += 1, day = shiftDay(day, 1)) {
    if (asksOn(task, day)) {
      const { mark } = entryOf(log, task.id, day);
      const evidence = mark !== 'missed' && (day < today || mark === 'done');
      if (evidence) score = score * m + (mark === 'done' ? 1 - m : 0);
    }
    if (onDay && (from === undefined || day >= from)) onDay(day, score * 100);
  }
  return score * 100;
}

/** `walk` for a weekly task (T2): one step per week. See the header. */
function walkWeeks(
  task: Task,
  log: TaskLog,
  today: string,
  times: number,
  frequency: number,
  onDay?: (day: string, value: number | null) => void,
  from?: string,
): number {
  const m = Math.pow(strengthMultiplier(frequency), times);
  const floor = shiftDay(today, -MAX_WALK_DAYS);
  let day = task.startedOn > floor ? task.startedOn : floor;
  let score = 0;
  let week = weekProgress(task, log, day);
  let doneSoFar = 0;
  let applied = false;
  for (let i = 0; i <= MAX_WALK_DAYS + 1 && day <= today; i += 1, day = shiftDay(day, 1)) {
    if (week === null || day > week.to) {
      week = weekProgress(task, log, day);
      doneSoFar = 0;
      applied = false;
    }
    if (week && !applied && week.needed > 0) {
      if (asksOn(task, day) && entryOf(log, task.id, day).mark === 'done') doneSoFar += 1;
      if (doneSoFar >= week.needed) {
        score = score * m + (1 - m);
        applied = true;
      } else if (day === week.to && day < today) {
        score = score * m + (1 - m) * Math.min(1, week.done / week.needed);
        applied = true;
      }
    }
    if (onDay && (from === undefined || day >= from)) onDay(day, score * 100);
  }
  return score * 100;
}

/** The score today, 0–100 (unrounded), or null for a one-day task. */
export function habitStrength(task: Task, log: TaskLog, today: string): number | null {
  return walk(task, log, today);
}

/**
 * The last `days` calendar days of the score, oldest first, ending today — the
 * sparkline under the ring. Days before the task started are `null`, so a task
 * a fortnight old draws a fortnight of line rather than ten weeks of zero.
 */
export function strengthSeries(
  task: Task,
  log: TaskLog,
  today: string,
  days = STRENGTH_SERIES_DAYS,
): StrengthPoint[] | null {
  if (strengthFrequency(task) === null) return null;
  const from = shiftDay(today, -(days - 1));
  const byDay = new Map<string, number>();
  walk(task, log, today, (day, value) => byDay.set(day, value as number), from);
  const points: StrengthPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = shiftDay(from, i);
    points.push({ day, value: day < task.startedOn ? null : (byDay.get(day) ?? null) });
  }
  return points;
}

export type StrengthBand = 'Strong' | 'Steady' | 'Building' | 'Forming';

/**
 * The word under the percentage. Four bands, none of them a scolding: a habit at
 * 12% is `Forming` whether it is new or lapsed, because both are true and only
 * one of them is useful to hear.
 */
export function strengthBand(score: number): StrengthBand {
  if (score >= 75) return 'Strong';
  if (score >= 50) return 'Steady';
  if (score >= 25) return 'Building';
  return 'Forming';
}

/** What the ring prints: a whole percent, never 100 until it truly is. */
export function strengthPercent(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return clamped > 99 && clamped < 100 ? 99 : Math.round(clamped);
}
