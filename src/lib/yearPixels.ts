/**
 * Year in Pixels (T5): a whole year of the daily list, one small square a day.
 *
 *   2026 · YEAR IN PIXELS
 *   J ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪
 *   F ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪
 *   …
 *     1        10        20        31
 *
 * ── TWELVE ROWS OF THIRTY-ONE, NOT FIFTY-THREE COLUMNS OF SEVEN ──────────
 *
 * The two shapes a "year of squares" comes in are GitHub's (53 week-columns of
 * 7 weekdays) and Daylio's (12 month-rows of 31 days). This is Daylio's, as the
 * design draws it, and for a reason that is about the phone: 53 columns across
 * 328 dp is a 6 dp square, below anything a finger can land near, and the grid
 * would have to scroll sideways to be usable. 31 columns is a 9–10 dp square
 * with the whole year in view. It also answers the question this screen is
 * opened with — "how did March go" — by reading ONE ROW, where a week grid
 * smears a month across five columns.
 *
 * What that costs is the weekday: Mondays do not line up down a column. That is
 * the honest trade, and the month grid one tap away (`tasksMonth`) is the
 * Monday-first view. So "Monday-first alignment" in this layout means something
 * narrower and still testable: a square sits in the column of its DAY OF THE
 * MONTH, and the dates that do not exist (30 February, 31 April) are not cells
 * at all — they are holes, never a blank day you could tap. No week-column
 * helper is built: nothing in this layout would read it.
 *
 * ── WHAT A SQUARE SAYS ────────────────────────────────────────────────────
 *
 * The same rules the month grid follows (`tasksMonth`), so the two zoom levels
 * can never disagree about a day:
 *  - ALL TASKS: the share of that day's tasks done, in the month's four steps
 *    (`heatLevel` — the same cut points the month grid's bubbles use). A day on
 *    which every task that asked was excused is `paused` (hatched): not a score.
 *    A partial excusal just shrinks that day's denominator, as everywhere.
 *  - ONE TASK: done is the top step, an unanswered asked day is the empty step,
 *    an excused day (a skip on purpose, or a pause) is `paused` — distinct, and
 *    out of the count. Days it did not ask on — before `startedOn`, off its
 *    weekdays, after an archive — are `blank`.
 *  - A day after today is `future` unless a pause already excused it: a pause is
 *    written ahead of time, and the grid shows the fact that is written down.
 *
 * Rejected: a fifth, darker step for "perfect day" in the all-tasks view (the
 * month grid's top step already is a full day), and colouring a single task's
 * squares by streak length (a streak is a number on the task screen; here a
 * square is one day's answer).
 */

import { dayKey, formatShortDay } from './days';
import { t, type Language } from './i18n';
import { asksOn, dayProgress, entryOf, type Task, type TaskLog } from './tasks';
import type { ID } from '../types/models';

/** 0 = the empty step, 1–4 = the four heat steps (`greenSteps()` 24/42/60/82%). */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * - `none`   — no such date (30 February): a hole, not a cell.
 * - `blank`  — nothing asked that day (before the start, off the schedule).
 * - `future` — not yet lived, and not paused ahead.
 * - `paused` — every task that asked was excused (one task: that task was).
 * - `score`  — a day with an answer; `level` is its fill.
 */
export type PixelKind = 'none' | 'blank' | 'future' | 'paused' | 'score';

export interface Pixel {
  /** Day of the month, 1–31: the column. */
  day: number;
  /** `YYYY-MM-DD`, or null for a date that does not exist. */
  date: string | null;
  kind: PixelKind;
  level: HeatLevel;
  /** That day's tasks done, and asked less the excused ones. */
  done: number;
  asked: number;
  isToday: boolean;
}

export interface PixelMonth {
  /** 0-based, as `Date` uses it. */
  month: number;
  /** Always 31 — the row is the same length every month; the tail is `none`. */
  cells: Pixel[];
}

export interface YearPixels {
  year: number;
  months: PixelMonth[];
  /** Summed over the scored days, like the month's `done of asked`. */
  done: number;
  asked: number;
  /** Days drawn hatched, ahead of today included. */
  paused: number;
}

/** `'all'`, or one task's id. */
export type PixelScope = 'all' | ID;

/** Columns in a row: the longest month. */
export const PIXEL_COLUMNS = 31;

/**
 * Five steps from a share done — the month grid's own cut points, so a day is
 * the same shade at both zoom levels. A full day is the top step and only a
 * full day is; anything done at all is at least the first.
 */
export function heatLevel(fraction: number): HeatLevel {
  if (!(fraction > 0)) return 0;
  if (fraction >= 1) return 4;
  if (fraction >= 0.75) return 3;
  if (fraction >= 0.5) return 2;
  return 1;
}

/**
 * The date in row `month`, column `day` — or null when that date does not
 * exist. This IS the layout's alignment rule: column = day of the month.
 */
export function pixelDate(year: number, month: number, day: number): string | null {
  if (day < 1 || day > PIXEL_COLUMNS) return null;
  const date = new Date(year, month, day);
  // `Date` rolls 30 February into March; a rolled date is not this cell's.
  if (date.getMonth() !== month || date.getDate() !== day) return null;
  return dayKey(date);
}

function emptyPixel(day: number, date: string | null, kind: PixelKind, today: string): Pixel {
  return { day, date, kind, level: 0, done: 0, asked: 0, isToday: date === today };
}

function allTasksPixel(
  tasks: readonly Task[],
  log: TaskLog,
  day: number,
  date: string,
  today: string,
): Pixel {
  if (!tasks.some((task) => asksOn(task, date))) return emptyPixel(day, date, 'blank', today);
  const progress = dayProgress(tasks, log, date);
  // `total` is what is left after excusals: zero with tasks asking means all of them.
  if (progress.total === 0) return emptyPixel(day, date, 'paused', today);
  if (date > today) return emptyPixel(day, date, 'future', today);
  return {
    day,
    date,
    kind: 'score',
    level: heatLevel(progress.fraction),
    done: progress.done,
    asked: progress.total,
    isToday: date === today,
  };
}

function oneTaskPixel(task: Task, log: TaskLog, day: number, date: string, today: string): Pixel {
  if (!asksOn(task, date)) return emptyPixel(day, date, 'blank', today);
  const { mark } = entryOf(log, task.id, date);
  if (mark === 'missed') return emptyPixel(day, date, 'paused', today);
  if (date > today) return emptyPixel(day, date, 'future', today);
  const done = mark === 'done' ? 1 : 0;
  return {
    day,
    date,
    kind: 'score',
    level: done ? 4 : 0,
    done,
    asked: 1,
    isToday: date === today,
  };
}

/**
 * The year, as 12 rows of 31. `scope` is `'all'` or a task id; an id that
 * matches no task draws every day blank rather than silently showing the list.
 */
export function yearPixels(
  tasks: readonly Task[],
  log: TaskLog,
  year: number,
  today: string,
  scope: PixelScope = 'all',
): YearPixels {
  const one = scope === 'all' ? null : (tasks.find((task) => task.id === scope) ?? null);
  const months: PixelMonth[] = [];
  let done = 0;
  let asked = 0;
  let paused = 0;

  for (let month = 0; month < 12; month += 1) {
    const cells: Pixel[] = [];
    for (let day = 1; day <= PIXEL_COLUMNS; day += 1) {
      const date = pixelDate(year, month, day);
      let pixel: Pixel;
      if (date === null) pixel = emptyPixel(day, null, 'none', today);
      else if (scope === 'all') pixel = allTasksPixel(tasks, log, day, date, today);
      else if (one) pixel = oneTaskPixel(one, log, day, date, today);
      else pixel = emptyPixel(day, date, 'blank', today);

      if (pixel.kind === 'score') {
        done += pixel.done;
        asked += pixel.asked;
      } else if (pixel.kind === 'paused') {
        paused += 1;
      }
      cells.push(pixel);
    }
    months.push({ month, cells });
  }

  return { year, months, done, asked, paused };
}

/**
 * The year's share done, as the kicker's whole percent — or null when nothing
 * was asked. Rounded, except at the ends: 0% only when nothing was done and
 * 100% only when everything was, so 997 of 1000 reads 99%, not a perfect year.
 */
export function yearPercent(year: Pick<YearPixels, 'done' | 'asked'>): number | null {
  if (year.asked <= 0) return null;
  const share = Math.round((year.done / year.asked) * 100);
  if (year.done >= year.asked) return 100;
  if (year.done <= 0) return 0;
  return Math.min(99, Math.max(1, share));
}

/**
 * The tasks a year can be drawn for: repeating ones, live, in their order.
 * A one-day task is one square in 365 — nothing to see — and an archived one
 * is still inside `All tasks` for the days it asked.
 */
export function pixelTaskChoices(tasks: readonly Task[]): Task[] {
  return tasks
    .filter((task) => task.archivedAt === null && task.schedule.kind !== 'once')
    .sort((a, b) => a.order - b.order);
}

/** The years the pager walks: from the first task's start to this year. */
export function pixelYears(tasks: readonly Task[], today: string): { first: number; last: number } {
  const last = Number(today.slice(0, 4));
  let first = last;
  for (const task of tasks) {
    const start = Number(task.startedOn.slice(0, 4));
    if (Number.isFinite(start) && start > 1970 && start < first) first = start;
  }
  return { first, last };
}

/**
 * Which square a tap at `(x, y)` landed on, in a grid `width` wide whose rows
 * start after a `labelWidth` gutter. Squares are square, so a row is the column
 * width tall, plus `rowGap` between rows (room for the month initial). Null off
 * the grid or on a hole (`pixelDate` decides).
 *
 * One press target for the whole grid rather than 372 Pressables: a 10 dp square
 * is too small to be its own target, and a tap between two squares should land
 * on one of them, not on nothing.
 */
export function pixelAtPoint(
  x: number,
  y: number,
  width: number,
  labelWidth: number,
  year: number,
  rowGap = 0,
): { month: number; day: number; date: string } | null {
  const slot = (width - labelWidth) / PIXEL_COLUMNS;
  if (!(slot > 0) || x < labelWidth || y < 0) return null;
  const month = Math.floor(y / (slot + rowGap));
  const day = Math.min(PIXEL_COLUMNS, Math.floor((x - labelWidth) / slot) + 1);
  if (month > 11) return null;
  const date = pixelDate(year, month, day);
  return date ? { month, day, date } : null;
}

/**
 * The line under the grid: the date and what it holds. `task` is the one task
 * on screen, or null for all of them.
 */
export function describePixel(pixel: Pixel, task: Task | null, lang: Language = 'en'): string {
  if (pixel.date === null) return '';
  const day = formatShortDay(pixel.date, lang);
  switch (pixel.kind) {
    case 'future':
      return t('{day} · not yet', lang, { day });
    case 'paused':
      return task
        ? t('{day} · excused · not counted', lang, { day })
        : t('{day} · paused · not counted', lang, { day });
    case 'blank':
      if (task && pixel.date < task.startedOn) {
        return t('{day} · before this task started', lang, { day });
      }
      return t('{day} · nothing asked', lang, { day });
    case 'score':
      if (task) {
        if (pixel.done > 0) return t('{day} · done', lang, { day });
        return pixel.isToday
          ? t('{day} · not answered yet', lang, { day })
          : t('{day} · not done', lang, { day });
      }
      return t('{day} · {done} of {asked} done', lang, {
        day,
        done: pixel.done,
        asked: pixel.asked,
      });
    default:
      return '';
  }
}
