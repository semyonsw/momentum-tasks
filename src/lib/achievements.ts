/**
 * Achievements (E1, Wave 3, behind the one switch in `lib/engagement.ts`):
 * thirty-three quiet badges across the three logs, and the facts they are read
 * off.
 *
 *   100 workouts        ● Gold     earned 14 Sep 2026
 *   1 tonne in a session ● Bronze  earned 2 Mar 2026
 *   30-day streak       ┆ locked   23 / 30 days
 *
 * ── A PURE FUNCTION OF THE LOGS ───────────────────────────────────────────
 *
 * Nothing here is stored. `logFacts` walks the three logs once and turns them
 * into dated events (a workout on a day, a task done on a day, a month whose
 * budgets held); every badge is a threshold over one of those series, and the
 * day it was earned is the day of the event that crossed it. So:
 *
 *  • RETROACTIVE. Switching the layer on a year in shows a year of badges, each
 *    with the day it was really earned.
 *  • STABLE. The same logs always give the same badges and the same dates —
 *    recomputing on every render cannot move an earned date, because the date
 *    is the log's, not the clock's.
 *  • HONEST ABOUT EDITS. Delete the hundredth workout and "100 workouts" is not
 *    earned until there are a hundred again. Rejected: storing earned badges so
 *    they are "never taken back" — that is a second record of the past that can
 *    disagree with the log, and the log is the one the user can see and edit.
 *    Nothing in the UI ever says a badge was lost: a locked badge is a locked
 *    badge, with its progress.
 *
 * ── THE RULES THE SERIES FOLLOW ───────────────────────────────────────────
 *
 *  • Workouts: one per saved session, on the day it started. Tonnage is the
 *    stored `totalVolumeKg` (working sets, `lib/draft.ts`), the same figure the
 *    history and Wrapped print. Records are `recordMoments` — the Finish
 *    sheet's rules, so the first record is the session whose sheet said so.
 *  • Tasks: a done mark on a day the task asked, up to today. A day EXCUSED ON
 *    PURPOSE counts for nothing: it is not a done day, so it adds no task, no
 *    day to a run (it is stepped over, as the streak steps over it) and it
 *    cannot make a day or a week "full" — a paused week earns no badge.
 *    Runs are days in a row of one daily-kind task (weekly tasks run in weeks
 *    and are left out of the day badges). A perfect day is one whose every
 *    asked, non-excused task was done (`dayProgress`), with at least one.
 *  • Money: an amount is one the user recorded — transfer halves are a move,
 *    not a record, and are left out. A day of logging is a day with a spending
 *    amount on it (`isSpending`). A budget month is a COMPLETE month, with
 *    something spent in it, in which every budget now set held — budgets carry
 *    no history, so the current figures are applied to past months; that is the
 *    only reading the data allows, and it is the one the budgets screen makes.
 *    A savings goal is reached on the first day, from the day it was set, that
 *    its subsection's balance stood at the target.
 *
 * ── TIERS ─────────────────────────────────────────────────────────────────
 *
 * Bronze, silver and gold are drawn in the THEME's three stops — c3, c2, c1 —
 * not in metal colours (the design's note): a gold badge is the brightest stop
 * of whatever theme is on, so a badge never clashes with the app around it.
 */

import { recordMoments, type BodyweightLookup } from './records';
import type { Budget } from './budgets';
import { inMonth, monthKey, spentInMonth, daysInMonth } from './budgets';
import type { CompletedWorkout } from './completedWorkout';
import { dayKey, formatLongDay, pad, shiftDay, weekStart } from './days';
import type { SavingsGoal } from './goals';
import { plural, t, term, type Language } from './i18n';
import { formatValue, isTransferCategory, type Amount, type MoneyAccount } from './money';
import { isSpending } from './moneyCalendar';
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
  /** Newest first, as the store keeps them — order does not matter here. */
  workouts: readonly CompletedWorkout[];
  tasks: readonly Task[];
  log: TaskLog;
  amounts: readonly Amount[];
  budgets?: readonly Budget[];
  goals?: readonly SavingsGoal[];
  accounts?: readonly MoneyAccount[];
  /** For bodyweight work's records, as the exercise screen weighs them. */
  bodyweightAtDate?: BodyweightLookup;
}

/** One dated event and its size: a session's kilograms, a run's length, or 1. */
export interface FactPoint {
  day: string;
  value: number;
}

/** Every series a badge or the XP table reads, each OLDEST FIRST. */
export interface LogFacts {
  /** One per saved workout. */
  workouts: FactPoint[];
  /** One per saved workout; value = its working sets. */
  sets: FactPoint[];
  /** One per saved workout; value = kilograms moved in working sets. */
  tonnage: FactPoint[];
  /** One per (session, exercise) that set a record. */
  records: FactPoint[];
  /** One per done mark on an asked day, up to today. */
  tasksDone: FactPoint[];
  /** One per done day of a daily-kind task; value = the run it made (≥ 1). */
  runs: FactPoint[];
  /** One per day whose every asked, non-excused task was done. */
  perfectDays: FactPoint[];
  /** One per complete Mon–Sun week with ≥ 5 perfect days and no imperfect one; day = Sunday. */
  fullWeeks: FactPoint[];
  /** One per recorded amount, transfers out; day = its day (a month amount: the 1st). */
  amounts: FactPoint[];
  /** One per day with something spent on it. */
  spendDays: FactPoint[];
  /** One per complete month every budget held; day = its last day. */
  budgetMonths: FactPoint[];
  /** One per savings goal reached; day = the day it was. */
  goalsReached: FactPoint[];
}

const byDay = (a: FactPoint, b: FactPoint) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

/** A full week needs this many perfect days (so a weekday-only list can earn it). */
export const FULL_WEEK_DAYS = 5;

export function logFacts(input: LogsInput): LogFacts {
  const { today } = input;
  return {
    ...workoutFacts(input.workouts, today, input.bodyweightAtDate),
    ...taskFacts(input.tasks, input.log, today),
    ...moneyFacts(input),
  };
}

function workoutFacts(
  workouts: readonly CompletedWorkout[],
  today: string,
  bodyweightAtDate?: BodyweightLookup,
): Pick<LogFacts, 'workouts' | 'sets' | 'tonnage' | 'records'> {
  const kept = workouts.filter((w) => dayKey(w.startedAt) <= today);
  const sessions = kept.map((w) => ({ day: dayKey(w.startedAt), value: 1 })).sort(byDay);
  const sets = kept
    .map((w) => ({ day: dayKey(w.startedAt), value: Math.max(0, w.setCount || 0) }))
    .sort(byDay);
  const tonnage = kept
    .map((w) => ({
      day: dayKey(w.startedAt),
      value: Number.isFinite(w.totalVolumeKg) ? Math.max(0, w.totalVolumeKg) : 0,
    }))
    .sort(byDay);
  const records = recordMoments(
    kept.flatMap((w) => w.sets),
    bodyweightAtDate,
  ).map((moment) => ({ day: dayKey(moment.at), value: 1 }));
  return { workouts: sessions, sets, tonnage, records };
}

function taskFacts(
  tasks: readonly Task[],
  log: TaskLog,
  today: string,
): Pick<LogFacts, 'tasksDone' | 'runs' | 'perfectDays' | 'fullWeeks'> {
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

/** The day an amount belongs to: its own, or the 1st of its month. */
function amountDay(amount: Amount): string {
  return amount.when.kind === 'day'
    ? amount.when.date
    : `${monthKey(amount.when.year, amount.when.month)}-01`;
}

function moneyFacts(
  input: LogsInput,
): Pick<LogFacts, 'amounts' | 'spendDays' | 'budgetMonths' | 'goalsReached'> {
  const { today } = input;
  const recorded = input.amounts.filter(
    (amount) => !isTransferCategory(amount.categoryId) && amountDay(amount) <= today,
  );
  const amounts = recorded.map((amount) => ({ day: amountDay(amount), value: 1 })).sort(byDay);

  const spent = new Set<string>();
  for (const amount of input.amounts) {
    if (amount.when.kind === 'day' && amount.when.date <= today && isSpending(amount)) {
      spent.add(amount.when.date);
    }
  }
  const spendDays = [...spent].sort().map((day) => ({ day, value: 1 }));

  return {
    amounts,
    spendDays,
    budgetMonths: budgetMonths(input.amounts, input.budgets ?? [], today),
    goalsReached: goalsReached(input.amounts, input.goals ?? [], input.accounts ?? [], today),
  };
}

function budgetMonths(
  amounts: readonly Amount[],
  budgets: readonly Budget[],
  today: string,
): FactPoint[] {
  if (budgets.length === 0) return [];
  const spending = amounts.filter((amount) => isSpending(amount));
  if (spending.length === 0) return [];
  const firstDay = spending.map(amountDay).sort()[0];
  let year = Number(firstDay.slice(0, 4));
  let month = Number(firstDay.slice(5, 7)) - 1;
  const thisMonth = today.slice(0, 7);
  const out: FactPoint[] = [];
  // Complete months only: the month `today` is in is still being spent.
  for (let guard = 0; monthKey(year, month) < thisMonth && guard < 1200; guard++) {
    const any = spending.some((amount) => inMonth(amount, year, month));
    const held = budgets.every(
      (budget) => spentInMonth(amounts, budget.categoryId, year, month) <= budget.monthly,
    );
    if (any && held) {
      out.push({
        day: `${monthKey(year, month)}-${pad(daysInMonth(year, month))}`,
        value: 1,
      });
    }
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return out;
}

function goalsReached(
  amounts: readonly Amount[],
  goals: readonly SavingsGoal[],
  accounts: readonly MoneyAccount[],
  today: string,
): FactPoint[] {
  const out: FactPoint[] = [];
  for (const goal of goals) {
    const account = accounts.find((row) => row.id === goal.accountId);
    if (!account || !(goal.target > 0)) continue;
    const set = dayKey(goal.createdAt);
    if (set > today) continue;
    const own = amounts
      .filter((amount) => amount.accountId === account.id && amountDay(amount) <= today)
      .sort((a, b) => (amountDay(a) < amountDay(b) ? -1 : amountDay(a) > amountDay(b) ? 1 : 0));
    let balance = account.opening;
    let reached: string | null = null;
    let i = 0;
    // Everything up to the day it was set, then one day of the log at a time.
    for (; i < own.length && amountDay(own[i]) <= set; i++) balance += signed(own[i]);
    if (balance >= goal.target) reached = set;
    while (reached === null && i < own.length) {
      const day = amountDay(own[i]);
      for (; i < own.length && amountDay(own[i]) === day; i++) balance += signed(own[i]);
      if (balance >= goal.target) reached = day;
    }
    if (reached !== null) out.push({ day: reached, value: 1 });
  }
  return out.sort(byDay);
}

const signed = (amount: Amount) => (amount.direction === 'expense' ? -amount.value : amount.value);

/* ------------------------------------------------------------------ */
/* The badges                                                          */
/* ------------------------------------------------------------------ */

export type BadgeDomain = 'workout' | 'tasks' | 'money';
/** 1 bronze (c3) · 2 silver (c2) · 3 gold (c1). */
export type BadgeTier = 1 | 2 | 3;

/** How a progress figure is printed. */
type BadgeUnit =
  | 'workouts'
  | 'tonnes'
  | 'records'
  | 'sets'
  | 'tasks'
  | 'days'
  | 'perfectDays'
  | 'weeks'
  | 'amounts'
  | 'loggedDays'
  | 'months'
  | 'goals';

interface BadgeDef {
  id: string;
  domain: BadgeDomain;
  tier: BadgeTier;
  /** The threshold, in the series' own units (kilograms for tonnage). */
  need: number;
  series: keyof LogFacts;
  /** `sum`: the series adds up. `max`: one event has to reach it. */
  measure: 'sum' | 'max';
  unit: BadgeUnit;
  /** English; translated through the catalogue. */
  title: string;
  what: string;
}

const TONNE = 1000;

/**
 * THE THIRTY-THREE, in the order the gallery shows them: each domain from the
 * first step to the last, so a row reads as a ladder.
 */
export const BADGES: readonly BadgeDef[] = [
  // Workout
  b(
    'workouts1',
    'workout',
    1,
    1,
    'workouts',
    'sum',
    'workouts',
    'First workout',
    'Save your first workout.',
  ),
  b(
    'workouts10',
    'workout',
    1,
    10,
    'workouts',
    'sum',
    'workouts',
    '10 workouts',
    'Save 10 workouts.',
  ),
  b(
    'workouts50',
    'workout',
    2,
    50,
    'workouts',
    'sum',
    'workouts',
    '50 workouts',
    'Save 50 workouts.',
  ),
  b(
    'workouts100',
    'workout',
    3,
    100,
    'workouts',
    'sum',
    'workouts',
    '100 workouts',
    'Save 100 workouts.',
  ),
  b(
    'workouts250',
    'workout',
    3,
    250,
    'workouts',
    'sum',
    'workouts',
    '250 workouts',
    'Save 250 workouts.',
  ),
  b(
    'workouts500',
    'workout',
    3,
    500,
    'workouts',
    'sum',
    'workouts',
    '500 workouts',
    'Save 500 workouts.',
  ),
  b(
    'session1t',
    'workout',
    1,
    TONNE,
    'tonnage',
    'max',
    'tonnes',
    '1 tonne in a session',
    'Move 1,000 kg in the working sets of one workout.',
  ),
  b(
    'session5t',
    'workout',
    2,
    5 * TONNE,
    'tonnage',
    'max',
    'tonnes',
    '5 tonnes in a session',
    'Move 5,000 kg in the working sets of one workout.',
  ),
  b(
    'session10t',
    'workout',
    3,
    10 * TONNE,
    'tonnage',
    'max',
    'tonnes',
    '10 tonnes in a session',
    'Move 10,000 kg in the working sets of one workout.',
  ),
  b(
    'tonnage10',
    'workout',
    1,
    10 * TONNE,
    'tonnage',
    'sum',
    'tonnes',
    '10 tonnes moved',
    'Move 10 tonnes in working sets, all workouts together.',
  ),
  b(
    'tonnage100',
    'workout',
    2,
    100 * TONNE,
    'tonnage',
    'sum',
    'tonnes',
    '100 tonnes moved',
    'Move 100 tonnes in working sets, all workouts together.',
  ),
  b(
    'tonnage1000',
    'workout',
    3,
    1000 * TONNE,
    'tonnage',
    'sum',
    'tonnes',
    '1,000 tonnes moved',
    'Move 1,000 tonnes in working sets, all workouts together.',
  ),
  b(
    'records1',
    'workout',
    1,
    1,
    'records',
    'sum',
    'records',
    'First record',
    'Beat a previous best: a new e1RM, heaviest set or most reps.',
  ),
  b(
    'records10',
    'workout',
    2,
    10,
    'records',
    'sum',
    'records',
    '10 records',
    'Beat a previous best in 10 exercise sessions.',
  ),
  b(
    'records50',
    'workout',
    3,
    50,
    'records',
    'sum',
    'records',
    '50 records',
    'Beat a previous best in 50 exercise sessions.',
  ),
  b(
    'sets1000',
    'workout',
    2,
    1000,
    'sets',
    'sum',
    'sets',
    '1,000 working sets',
    'Log 1,000 working sets. Warm-ups are not counted.',
  ),
  // Tasks
  b(
    'tasks1',
    'tasks',
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
    'tasks',
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
    'tasks',
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
    'tasks',
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
    'tasks',
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
    'tasks',
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
    'tasks',
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
    'tasks',
    2,
    30,
    'perfectDays',
    'sum',
    'perfectDays',
    '30 perfect days',
    'Finish every task 30 days. Days skipped on purpose are left out.',
  ),
  // Money
  b(
    'amounts1',
    'money',
    1,
    1,
    'amounts',
    'sum',
    'amounts',
    'First amount',
    'Record your first amount. Transfers are not counted.',
  ),
  b(
    'amounts100',
    'money',
    2,
    100,
    'amounts',
    'sum',
    'amounts',
    '100 amounts',
    'Record 100 amounts. Transfers are not counted.',
  ),
  b(
    'logging30',
    'money',
    1,
    30,
    'spendDays',
    'sum',
    'loggedDays',
    '30 days of logging',
    'Record spending on 30 different days.',
  ),
  b(
    'logging100',
    'money',
    2,
    100,
    'spendDays',
    'sum',
    'loggedDays',
    '100 days of logging',
    'Record spending on 100 different days.',
  ),
  b(
    'logging365',
    'money',
    3,
    365,
    'spendDays',
    'sum',
    'loggedDays',
    'A year of logging',
    'Record spending on 365 different days.',
  ),
  b(
    'budget1',
    'money',
    1,
    1,
    'budgetMonths',
    'sum',
    'months',
    'Budget kept',
    'A whole month inside every budget you have set.',
  ),
  b(
    'budget3',
    'money',
    2,
    3,
    'budgetMonths',
    'sum',
    'months',
    'Budget kept 3 months',
    'Three whole months inside every budget you have set.',
  ),
  b(
    'budget12',
    'money',
    3,
    12,
    'budgetMonths',
    'sum',
    'months',
    'Budget kept a year',
    'Twelve whole months inside every budget you have set.',
  ),
  b(
    'goal1',
    'money',
    2,
    1,
    'goalsReached',
    'sum',
    'goals',
    'Goal reached',
    'A savings goal’s subsection reaches its target.',
  ),
];

function b(
  id: string,
  domain: BadgeDomain,
  tier: BadgeTier,
  need: number,
  series: keyof LogFacts,
  measure: 'sum' | 'max',
  unit: BadgeUnit,
  title: string,
  what: string,
): BadgeDef {
  return { id, domain, tier, need, series, measure, unit, title, what };
}

export interface Badge {
  id: string;
  domain: BadgeDomain;
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
      domain: def.domain,
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

/** `whole` tonnes from kilograms, rounded DOWN so a locked badge never reads as reached. */
function tonnes(kg: number): string {
  const tonnes = kg / TONNE;
  if (tonnes < 10) return String(Math.floor(tonnes * 10) / 10);
  return formatValue(Math.floor(tonnes));
}

const count = (n: number) => formatValue(Math.floor(n));

/** The noun after a progress figure, agreeing with `need` — `73 / 100 workouts`. */
function unitWord(unit: BadgeUnit, n: number, lang: Language): string {
  const forms: Record<BadgeUnit, [string, string, string]> = {
    workouts: ['workout', 'workouts', 'тренировки'],
    tonnes: ['t', 't', 'т'],
    records: ['record', 'records', 'рекорда'],
    sets: ['set', 'sets', 'подхода'],
    tasks: ['task', 'tasks', 'задачи'],
    days: ['day', 'days', 'дня'],
    perfectDays: ['perfect day', 'perfect days', 'идеальных дня'],
    weeks: ['week', 'weeks', 'недели'],
    amounts: ['amount', 'amounts', 'суммы'],
    loggedDays: ['day logged', 'days logged', 'дня с записями'],
    months: ['month', 'months', 'месяца'],
    goals: ['goal', 'goals', 'цели'],
  };
  const [one, many, few] = forms[unit];
  return plural(n, lang, { one: term('badge', one, lang), few, many: term('badge', many, lang) });
}

/**
 * The progress line: `73 / 100 workouts`, `0.6 / 1 t`. For a one-step badge
 * still locked there is no fraction worth printing, so it says so instead.
 */
export function describeBadgeProgress(badge: Badge, lang: Language): string {
  if (badge.unit === 'tonnes') {
    return `${tonnes(badge.have)} / ${tonnes(badge.need)} ${unitWord('tonnes', badge.need, lang)}`;
  }
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
