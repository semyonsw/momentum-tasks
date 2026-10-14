/**
 * Monthly budgets per expense category (M1).
 *
 *   BUDGETS
 *   October · day 5 of 31. The tick on each bar is how much of the month has passed.
 *   🛒 Food          65,800 left      ▕██▏──────────────▏  14,200 / 80,000 AMD
 *   🎁 Gifts      8,000 over budget   ▕██████████████████▏  18,000 / 10,000 AMD
 *
 * A budget is ONE figure: what the user means to spend in a category in a month.
 * It is optional — a category without one is drawn exactly as it always was —
 * and it is a plan, not a record: nothing here writes an amount or moves one.
 *
 * ── WHAT COUNTS AS SPENT ──────────────────────────────────────────────────
 *
 * Every expense in that category in that month, from EVERY subsection: a day
 * amount on any day of the month AND a whole-month amount filed for the month.
 * Rent "for October" is October's rent whichever day it was paid, which is the
 * whole reason whole-month amounts exist (`lib/money.ts`). The exclusions are
 * `isSpending`'s, the one list the calendar already reads: incomes are not
 * spending and neither is either half of a transfer.
 *
 * Every subsection, because the question a budget answers is "how much went on
 * food", and food bought with the card is still food. The money screen reads
 * one pocket at a time; a budget that only saw the pocket on screen would read
 * half-spent with the other half in the next chip along.
 *
 * ── NO ROLLOVER ───────────────────────────────────────────────────────────
 *
 * Each month starts at its own figure. Carrying an underspend forward is a real
 * feature in some apps, and it is not offered here: it turns one honest number
 * ("80,000 a month") into one that changes on its own and has to be explained,
 * and it answers a question nobody asked yet. `BUDGET_ROLLOVER` is the constant
 * a test pins, so turning it on later is a decision and not an accident.
 *
 * ── ARCHIVED CATEGORIES ───────────────────────────────────────────────────
 *
 * Their budgets are KEPT (un-archiving is not a thing today, but the figure is
 * the user's and costs nothing to keep) and are neither shown nor alerted. A
 * budget on a category that no longer exists at all is dropped by the store.
 *
 * ── THE ALERTS ────────────────────────────────────────────────────────────
 *
 * Off unless a budget has its own switch turned on. When the month's spending
 * crosses 80% and 100% of the figure a local notification says so, ONCE per
 * threshold per month: the fired thresholds are remembered by key
 * (`food:2026-10:80`), and a jump straight past both fires only the 100% one —
 * "you're at 80%" arriving beside "you're over" is one message too many. Keys
 * from earlier months are pruned, so the list stays a month long.
 *
 * REJECTED: one switch in the money settings for every budget. A budget on
 * Gifts and a budget on Food are not equally worth a buzz, and a single switch
 * would make the user choose between all of them and none.
 *
 * ── THE SCALE ─────────────────────────────────────────────────────────────
 *
 * A budget is an integer in the log's units like every amount, so it compares
 * with sums directly. The ± chips step by `BUDGET_STEP` STORED units — 5,000 in a
 * whole-unit log, 50.00 in a log kept in cents — which is the same size of nudge
 * relative to what anybody spends in either.
 */

import { daysBetween, formatMonth, pad, parseDay } from './days';
import { t, type Language } from './i18n';
import { formatMoney, isTransferCategory, type Amount, type MoneyCategory } from './money';
import { isSpending } from './moneyCalendar';
import type { ID } from '../types/models';

export interface Budget {
  categoryId: ID;
  /** What the month may cost, in the log's units. Always > 0; no budget = no row. */
  monthly: number;
  /** The 80% / 100% notification, opted into per budget. Absent = off. */
  alerts?: true;
}

/** See the header: each month starts at its own figure. */
export const BUDGET_ROLLOVER = false;

/** The ± chips' step, in stored units — see the header. */
export const BUDGET_STEP = 5000;

const ALERT_THRESHOLDS = [80, 100] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

/** The store's validator. One budget per category, the first one wins. */
export function sanitizeBudgets(raw: unknown, known: ReadonlySet<ID>): Budget[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ID>();
  const out: Budget[] = [];
  for (const entry of raw) {
    const value = entry as Partial<Budget> | undefined;
    if (!value || typeof value.categoryId !== 'string' || !known.has(value.categoryId)) continue;
    if (seen.has(value.categoryId)) continue;
    const monthly = Math.round(Number(value.monthly));
    if (!Number.isFinite(monthly) || monthly <= 0) continue;
    seen.add(value.categoryId);
    out.push({
      categoryId: value.categoryId,
      monthly,
      ...(value.alerts === true ? { alerts: true as const } : {}),
    });
  }
  return out;
}

/** The fired-alert keys, kept only while they look like keys. */
export function sanitizeFired(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((key): key is string => typeof key === 'string' && key !== ''))];
}

/** `2026-10` — the month an alert key and a budget line are about. */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month + 1)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Does this amount belong to that month — on one of its days, or for the whole of it? */
export function inMonth(amount: Amount, year: number, month: number): boolean {
  if (amount.when.kind === 'month') {
    return amount.when.year === year && amount.when.month === month;
  }
  return amount.when.date.startsWith(`${monthKey(year, month)}-`);
}

/** Spent in one category in one month, every subsection (see the header). */
export function spentInMonth(
  amounts: readonly Amount[],
  categoryId: ID,
  year: number,
  month: number,
): number {
  let sum = 0;
  for (const amount of amounts) {
    if (amount.categoryId !== categoryId) continue;
    if (!isSpending(amount) || !inMonth(amount, year, month)) continue;
    sum += amount.value;
  }
  return sum;
}

/**
 * What the month may cost. The budget's own figure, whatever the month before
 * did — `BUDGET_ROLLOVER` is off and this is where it would act.
 */
export function budgetLimit(budget: Budget): number {
  return budget.monthly;
}

/**
 * How much of the month has passed, 0–1: today counts as passed (the tick is
 * read at the end of the day it is drawn on). A past month is 1, a future one 0.
 */
export function monthElapsed(year: number, month: number, today: string): number {
  const first = `${monthKey(year, month)}-01`;
  const total = daysInMonth(year, month);
  const into = daysBetween(first, today) + 1;
  if (!parseDay(today) || into <= 0) return 0;
  return Math.min(1, into / total);
}

export interface BudgetStatus {
  categoryId: ID;
  limit: number;
  spent: number;
  /** spent / limit, unclamped — past 1 is over. */
  fraction: number;
  over: boolean;
  /** limit − spent, never below 0. */
  left: number;
  /** spent − limit, never below 0. */
  overBy: number;
  /**
   * Spending is running well ahead of the calendar: more than a fifth of the
   * budget ahead of the share of the month gone. Said in words, not in coral —
   * coral is for past 100% only.
   */
  ahead: boolean;
}

/** One budget, read against one month. */
export function budgetStatus(
  budget: Budget,
  amounts: readonly Amount[],
  year: number,
  month: number,
  today: string,
): BudgetStatus {
  const limit = budgetLimit(budget);
  const spent = spentInMonth(amounts, budget.categoryId, year, month);
  const fraction = limit > 0 ? spent / limit : 0;
  const over = spent > limit;
  return {
    categoryId: budget.categoryId,
    limit,
    spent,
    fraction,
    over,
    left: Math.max(0, limit - spent),
    overBy: Math.max(0, spent - limit),
    ahead: !over && fraction < 1 && fraction > monthElapsed(year, month, today) + 0.2,
  };
}

/** Is this budget one the screens show and the alerts watch? (Archived: kept, silent.) */
function liveBudgetCategory(category: MoneyCategory | undefined): category is MoneyCategory {
  return (
    category !== undefined &&
    category.archivedAt === null &&
    category.direction === 'expense' &&
    !isTransferCategory(category.id)
  );
}

/** The budgets the screens show: live expense categories only, in the grid's order. */
export function visibleBudgets(
  budgets: readonly Budget[],
  categories: readonly MoneyCategory[],
): Budget[] {
  const byId = new Map(budgets.map((budget) => [budget.categoryId, budget]));
  return categories
    .filter(liveBudgetCategory)
    .map((category) => byId.get(category.id))
    .filter((budget): budget is Budget => budget !== undefined);
}

/** Every visible budget's status for the month, in the grid's order. */
export function budgetStatuses(params: {
  budgets: readonly Budget[];
  categories: readonly MoneyCategory[];
  amounts: readonly Amount[];
  year: number;
  month: number;
  today: string;
}): BudgetStatus[] {
  return visibleBudgets(params.budgets, params.categories).map((budget) =>
    budgetStatus(budget, params.amounts, params.year, params.month, params.today),
  );
}

/** The figure in a budget's corner: `65,800 AMD left`, `8,000 AMD over budget`, `ahead of the month`. */
export function budgetNote(
  status: BudgetStatus,
  currency: string,
  scale: number,
  lang: Language = 'en',
): string {
  if (status.over) {
    return t('{amount} over budget', lang, {
      amount: formatMoney(status.overBy, currency, scale),
    });
  }
  if (status.ahead) return t('ahead of the month', lang);
  return t('{amount} left', lang, { amount: formatMoney(status.left, currency, scale) });
}

/** The line on a category tile: `18% of 80,000` or `8,000 AMD over budget`. */
export function tileBudgetLine(
  status: BudgetStatus,
  currency: string,
  scale: number,
  lang: Language = 'en',
): string {
  if (status.over) return budgetNote(status, currency, scale, lang);
  return t('{percent}% of {amount}', lang, {
    percent: Math.floor(status.fraction * 100),
    amount: formatMoney(status.limit, currency, scale),
  });
}

/** `October · day 5 of 31.` — the head of the overview, the tick's legend. */
export function describeBudgetMonth(
  year: number,
  month: number,
  today: string,
  lang: Language = 'en',
): string {
  const total = daysInMonth(year, month);
  const day = Math.round(monthElapsed(year, month, today) * total);
  const name = formatMonth(year, month, lang).replace(/ \d+$/, '');
  return t('{month} · day {day} of {total}.', lang, { month: name, day, total });
}

/** A budget nudged by one chip: never below zero (zero = no budget). */
export function stepBudget(value: number, direction: 1 | -1): number {
  return Math.max(0, Math.round(value) + direction * BUDGET_STEP);
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export function alertKey(
  categoryId: ID,
  year: number,
  month: number,
  threshold: AlertThreshold,
): string {
  return `${categoryId}:${monthKey(year, month)}:${threshold}`;
}

export interface BudgetAlert {
  categoryId: ID;
  threshold: AlertThreshold;
  spent: number;
  limit: number;
}

/**
 * What to notify about now, and which keys to remember having done so.
 *
 * `record` holds every threshold crossed and not yet remembered — including an
 * 80% that is being folded into a 100% — so neither is said again this month.
 * `fire` is at most one per budget: the highest one crossed.
 */
export function budgetAlertsDue(params: {
  budgets: readonly Budget[];
  categories: readonly MoneyCategory[];
  amounts: readonly Amount[];
  year: number;
  month: number;
  fired: readonly string[];
}): { fire: BudgetAlert[]; record: string[] } {
  const fired = new Set(params.fired);
  const fire: BudgetAlert[] = [];
  const record: string[] = [];
  for (const budget of visibleBudgets(params.budgets, params.categories)) {
    if (!budget.alerts) continue;
    const limit = budgetLimit(budget);
    const spent = spentInMonth(params.amounts, budget.categoryId, params.year, params.month);
    let top: AlertThreshold | null = null;
    for (const threshold of ALERT_THRESHOLDS) {
      if (spent * 100 < limit * threshold) continue;
      const key = alertKey(budget.categoryId, params.year, params.month, threshold);
      if (fired.has(key)) continue;
      record.push(key);
      top = threshold;
    }
    if (top !== null) fire.push({ categoryId: budget.categoryId, threshold: top, spent, limit });
  }
  return { fire, record };
}

/** The remembered keys for this month only — earlier months can never fire again. */
export function pruneFired(fired: readonly string[], year: number, month: number): string[] {
  const tag = `:${monthKey(year, month)}:`;
  return fired.filter((key) => key.includes(tag));
}

/** The notification's words. */
export function describeBudgetAlert(
  alert: BudgetAlert,
  categoryName: string,
  currency: string,
  scale: number,
  lang: Language = 'en',
): { title: string; body: string } {
  const spent = formatMoney(alert.spent, currency, scale);
  const limit = formatMoney(alert.limit, currency, scale);
  if (alert.threshold === 100) {
    return {
      title: t('{name}: the budget is spent', lang, { name: categoryName }),
      body: t('{spent} of {limit} this month.', lang, { spent, limit }),
    };
  }
  return {
    title: t('{name}: 80% of the budget', lang, { name: categoryName }),
    body: t('{spent} of {limit} this month.', lang, { spent, limit }),
  };
}
