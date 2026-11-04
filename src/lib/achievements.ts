/**
 * Achievements (E1, behind the one switch in `lib/engagement.ts`): eight quiet
 * badges for the task log, and the facts they are read off.
 *
 *   100 tasks done      ● Silver   earned 14 Sep 2026
 *   30-day streak       ┆ locked   23 / 30 days
 *
 * ── A PURE FUNCTION OF THE LOG ────────────────────────────────────────────
 *
 * Nothing here is stored. `logFacts` walks the log once and turns it into
 * dated events (a task done on a day, a perfect day, a full week); every badge
 * is a threshold over one of those series, and the day it was earned is the
 * day of the event that crossed it. So:
 *
 *  • RETROACTIVE. Switching the layer on a year in shows a year of badges, each
 *    with the day it was really earned.
 *  • STABLE. The same log always gives the same badges and the same dates —
 *    recomputing on every render cannot move an earned date, because the date
 *    is the log's, not the clock's.
 *  • HONEST ABOUT EDITS. Clear the hundredth tick and "100 tasks done" is not
 *    earned until there are a hundred again. Rejected: storing earned badges so
 *    they are "never taken back" — that is a second record of the past that can
 *    disagree with the log, and the log is the one the user can see and edit.
 *    Nothing in the UI ever says a badge was lost: a locked badge is a locked
 *    badge, with its progress.
 *
 * ── THE RULES THE SERIES FOLLOW ───────────────────────────────────────────
 *
 * A done mark counts on a day the task asked, up to today. A day EXCUSED ON
 * PURPOSE counts for nothing: it is not a done day, so it adds no task, no day
 * to a run (it is stepped over, as the streak steps over it) and it cannot make
 * a day or a week "full" — a paused week earns no badge. Runs are days in a row
 * of one daily-kind task (weekly tasks run in weeks and are left out of the day
 * badges). A perfect day is one whose every asked, non-excused task was done
 * (`dayProgress`), with at least one.
 *
 * The badge ids are the ones Momentum gave these eight, so nothing that names a
 * badge by id has to change.
 *
 * ── TIERS ─────────────────────────────────────────────────────────────────
 *
 * Bronze, silver and gold are drawn in the THEME's three stops — c3, c2, c1 —
 * not in metal colours (the design's note): a gold badge is the brightest stop
 * of whatever theme is on, so a badge never clashes with the app around it.
 */

import { formatLongDay, shiftDay, weekStart } from './days';
import { formatWhole } from './formatNumber';
import { plural, t, term, type Language } from './i18n';
import {
  ageInDays,
  allExcusedOn,
  asksOn,
  dayProgress,
  entryOf,
  isWeekly,
  weekdayOf,
  type Task,
  type TaskLog,
} from './tasks';

/* ------------------------------------------------------------------ */
/* The facts                                                           */
/* ------------------------------------------------------------------ */

export interface LogsInput {
  /** `YYYY-MM-DD`. Nothing after it counts. */
  today: string;
  tasks: readonly Task[];
  log: TaskLog;
}

/** One dated event and its size: a run's length, or 1. */
export interface FactPoint {
  day: string;
  value: number;
}

/** Every series a badge or the XP table reads, each OLDEST FIRST. */
export interface LogFacts {
  /** One per done mark on an asked day, up to today. */
  tasksDone: FactPoint[];
  /** One per done day of a daily-kind task; value = the run it made (≥ 1). */
  runs: FactPoint[];
  /** One per day whose every asked, non-excused task was done. */
  perfectDays: FactPoint[];
  /** One per complete Mon–Sun week with ≥ 5 perfect days and no imperfect one; day = Sunday. */
  fullWeeks: FactPoint[];
}

const byDay = (a: FactPoint, b: FactPoint) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

/** A full week needs this many perfect days (so a weekday-only list can earn it). */
export const FULL_WEEK_DAYS = 5;

export function logFacts({ tasks, log, today }: LogsInput): LogFacts {
  return taskFacts(tasks, log, today);
}

function taskFacts(tasks: readonly Task[], log: TaskLog, today: string): LogFacts {
  const tasksDone: FactPoint[] = [];
  for (const task of tasks) {
    for (const [day, entry] of Object.entries(log[task.id] ?? {})) {
      if (entry.mark === 'done' && day <= today && asksOn(task, day)) {
        tasksDone.push({ day, value: 1 });
      }
    }
  }

  const runs: FactPoint[] = [];
  for (const task of tasks) {
    if (isWeekly(task) || task.startedOn > today) continue;
    let run = 0;
    let guard = ageInDays(task.startedOn, today) + 1;
    for (let day = task.startedOn; day <= today && guard > 0; day = shiftDay(day, 1), guard--) {
      if (!asksOn(task, day)) continue;
      const { mark } = entryOf(log, task.id, day);
      if (mark === 'done') {
        run += 1;
        runs.push({ day, value: run });
      } else if (mark === null && day !== today) {
        run = 0;
      }
      // 'missed' — excused on purpose: stepped over, as `streakOf` does.
    }
  }

  const perfectDays: FactPoint[] = [];
  const fullWeeks: FactPoint[] = [];
  const first = tasks.reduce<string | null>(
    (min, task) => (min === null || task.startedOn < min ? task.startedOn : min),
    null,
  );
  if (first !== null && first <= today) {
    const from = weekStart(first);
    let guard = ageInDays(from, today) + 1;
    let weekPerfect = 0;
    let weekBroken = false;
    for (let day = from; day <= today && guard > 0; day = shiftDay(day, 1), guard--) {
      const weekday = weekdayOf(day);
      if (weekday === 0) {
        weekPerfect = 0;
        weekBroken = false;
      }
      const progress = dayProgress(tasks, log, day);
      if (progress.total > 0) {
        if (progress.done === progress.total) {
          perfectDays.push({ day, value: 1 });
          weekPerfect += 1;
        } else {
          weekBroken = true;
        }
      } else if (allExcusedOn(tasks, log, day)) {
        // A paused day is not a full day: a paused week earns nothing.
        weekBroken = true;
      }
      // Only a week that is over: its Sunday is before today.
      if (weekday === 6 && day < today && !weekBroken && weekPerfect >= FULL_WEEK_DAYS) {
        fullWeeks.push({ day, value: 1 });
      }
    }
  }

  return { tasksDone: tasksDone.sort(byDay), runs: runs.sort(byDay), perfectDays, fullWeeks };
}

/* ------------------------------------------------------------------ */
/* The badges                                                          */
/* ------------------------------------------------------------------ */

/** 1 bronze (c3) · 2 silver (c2) · 3 gold (c1). */
export type BadgeTier = 1 | 2 | 3;

/** How a progress figure is printed. */
type BadgeUnit = 'tasks' | 'days' | 'perfectDays' | 'weeks';

interface BadgeDef {
  id: string;
  tier: BadgeTier;
  /** The threshold, in the series' own units. */
  need: number;
  series: keyof LogFacts;
  /** `sum`: the series adds up. `max`: one event has to reach it. */
  measure: 'sum' | 'max';
  unit: BadgeUnit;
  /** English; translated through the catalogue. */
  title: string;
  what: string;
}

/**
 * THE EIGHT, in the order the gallery shows them: each ladder from the first
 * step to the last, so a row reads as a ladder.
 */
export const BADGES: readonly BadgeDef[] = [
  b(
    'tasks1',
    1,
    1,
    'tasksDone',
    'sum',
    'tasks',
    'First task done',
    'Tick a task on a day it asks.',
  ),
  b(
    'tasks100',
    2,
    100,
    'tasksDone',
    'sum',
    'tasks',
    '100 tasks done',
    'Tick 100 tasks, on the days they ask.',
  ),
  b(
    'tasks1000',
    3,
    1000,
    'tasksDone',
    'sum',
    'tasks',
    '1,000 tasks done',
    'Tick 1,000 tasks, on the days they ask.',
  ),
  b(
    'run7',
    1,
    7,
    'runs',
    'max',
    'days',
    '7 days in a row',
    'Do one daily task 7 asked days in a row. A day skipped on purpose is stepped over, not counted.',
  ),
  b(
    'run30',
    2,
    30,
    'runs',
    'max',
    'days',
    '30-day streak',
    'Do one daily task 30 asked days in a row. A day skipped on purpose is stepped over, not counted.',
  ),
  b(
    'run100',
    3,
    100,
    'runs',
    'max',
    'days',
    '100-day streak',
    'Do one daily task 100 asked days in a row. A day skipped on purpose is stepped over, not counted.',
  ),
  b(
    'fullWeek',
    2,
    1,
    'fullWeeks',
    'sum',
    'weeks',
    'A full week',
    'Every task done on every day of a Monday–Sunday week, at least 5 days of it. A paused day does not count.',
  ),
  b(
    'perfect30',
    2,
    30,
    'perfectDays',
    'sum',
    'perfectDays',
    '30 perfect days',
    'Finish every task 30 days. Days skipped on purpose are left out.',
  ),
];

function b(
  id: string,
  tier: BadgeTier,
  need: number,
  series: keyof LogFacts,
  measure: 'sum' | 'max',
  unit: BadgeUnit,
  title: string,
  what: string,
): BadgeDef {
  return { id, tier, need, series, measure, unit, title, what };
}

export interface Badge {
  id: string;
  tier: BadgeTier;
  need: number;
  /** The fact series it counts — what its glyph is drawn from. */
  series: keyof LogFacts;
  /** Where the log stands, capped at `need` once earned; never below 0. */
  have: number;
  /** The day the log crossed `need`, or null while locked. */
  earnedOn: string | null;
  /** 0–1, for the bar. 1 only when earned. */
  fraction: number;
  unit: BadgeUnit;
  title: string;
  what: string;
}

/** Every badge, earned or not, in `BADGES` order. Same facts in, same badges out. */
export function achievements(facts: LogFacts): Badge[] {
  return BADGES.map((def) => {
    const series = facts[def.series];
    let have = 0;
    let earnedOn: string | null = null;
    for (const point of series) {
      have = def.measure === 'sum' ? have + point.value : Math.max(have, point.value);
      if (earnedOn === null && have >= def.need) earnedOn = point.day;
    }
    const capped = earnedOn !== null ? def.need : Math.max(0, have);
    return {
      id: def.id,
      tier: def.tier,
      need: def.need,
      series: def.series,
      have: capped,
      earnedOn,
      // 99% until it is truly there, as every other bar in the app.
      fraction: earnedOn !== null ? 1 : Math.min(0.99, capped / def.need),
      unit: def.unit,
      title: def.title,
      what: def.what,
    };
  });
}

/** The gallery's line: how many are earned. */
function earnedCount(badges: readonly Badge[]): number {
  return badges.filter((badge) => badge.earnedOn !== null).length;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export function tierName(tier: BadgeTier, lang: Language): string {
  return t(tier === 3 ? 'Gold' : tier === 2 ? 'Silver' : 'Bronze', lang);
}

const count = (n: number) => formatWhole(Math.floor(n));

/** The noun after a progress figure, agreeing with `need` — `73 / 100 tasks`. */
function unitWord(unit: BadgeUnit, n: number, lang: Language): string {
  const forms: Record<BadgeUnit, [string, string, string]> = {
    tasks: ['task', 'tasks', 'задачи'],
    days: ['day', 'days', 'дня'],
    perfectDays: ['perfect day', 'perfect days', 'идеальных дня'],
    weeks: ['week', 'weeks', 'недели'],
  };
  const [one, many, few] = forms[unit];
  return plural(n, lang, { one: term('badge', one, lang), few, many: term('badge', many, lang) });
}

/**
 * The progress line: `73 / 100 tasks`. For a one-step badge still locked there
 * is no fraction worth printing, so it says so instead.
 */
export function describeBadgeProgress(badge: Badge, lang: Language): string {
  if (badge.need === 1 && badge.earnedOn === null) return t('Not yet', lang);
  return `${count(badge.have)} / ${count(badge.need)} ${unitWord(badge.unit, badge.need, lang)}`;
}

/** `Earned 14 September 2026`, or null while locked. */
export function describeEarned(badge: Badge, lang: Language): string | null {
  if (badge.earnedOn === null) return null;
  return t('Earned {date}', lang, { date: formatLongDay(badge.earnedOn, lang) });
}

/** The gallery's sentence above the grid. */
export function describeGallery(badges: readonly Badge[], lang: Language): string {
  return t('{n} of {total} earned.', lang, { n: earnedCount(badges), total: badges.length });
}
