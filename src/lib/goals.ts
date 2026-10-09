/**
 * Savings goals (M5): a target, an optional date, and a subsection that holds
 * the money.
 *
 *   ( 58% )  💻 New laptop
 *            380,000 of 650,000 AMD · by 31 March 2027
 *            45,000 AMD a month to get there
 *
 * ── PROGRESS IS THE SUBSECTION'S BALANCE ──────────────────────────────────
 *
 * A goal names one subsection — `Savings`, a deposit, an envelope — and how
 * far along it is IS that subsection's balance, the same figure the Finance
 * screen shows for it. Money reaches it the way money reaches any subsection:
 * a transfer in (`⇄`), an income, an opening balance; money taken out of it
 * moves the goal back. Nothing new is recorded and nothing can disagree.
 *
 * REJECTED: earmarking individual transfers as "for the laptop". It needs a
 * new field on amounts, a picker on every transfer, and an answer to "what if I
 * take 20,000 back out" — and the balance already answers that. The cost of
 * the simple rule: two goals on one subsection each read the whole of it. The
 * screen says so rather than splitting it by a guess.
 *
 * ── WHAT A MONTH NEEDS ────────────────────────────────────────────────────
 *
 * Only with a date, and only while the goal is not reached: what is left,
 * spread over the months left, ROUNDED UP to a whole unit of the currency — a
 * plan that is a dram short every month misses. "Months left" counts the
 * current month's remainder as one: from 9 October, 31 March is 5 months and
 * 22 days away, so 6 (`monthsLeft`), and a date this month is 1.
 *
 * ── PAST THE DATE ─────────────────────────────────────────────────────────
 *
 * Said plainly — `The date has passed · 120,000 AMD to go` — with no red, no
 * "you missed", no streak broken. The goal is still a goal; moving its date
 * is one tap away in the editor.
 *
 * ── AN ARCHIVED SUBSECTION ────────────────────────────────────────────────
 *
 * The goal is PAUSED, not hidden and not deleted: it stays in the list, last,
 * dimmed, saying why, with no monthly figure — its money is frozen where the
 * user put it, and the goal is theirs to delete or keep.
 */

import { formatLongDay, parseDay } from './days';
import { t, type Language } from './i18n';
import {
  balanceOfAccount,
  formatMoney,
  formatValue,
  type Amount,
  type MoneyAccount,
} from './money';
import type { ID } from '../types/models';

export interface SavingsGoal {
  id: ID;
  name: string;
  /** One emoji, the user's. */
  glyph: string;
  /** In the log's units, > 0. */
  target: number;
  /** The day it is wanted by, or absent for "someday". */
  by?: string;
  accountId: ID;
  createdAt: string;
}

export interface GoalDraft {
  name: string;
  glyph: string;
  target: number;
  by: string | null;
  accountId: ID;
}

export type GoalState = 'active' | 'reached' | 'pastDue' | 'paused';

export interface GoalProgress {
  state: GoalState;
  /** The subsection's balance — can be below zero. */
  saved: number;
  /** 0–1, the share of the target the balance covers. */
  fraction: number;
  /** What is still to go, never below 0. */
  left: number;
  /** Months to the date (see the header), or null without one. */
  months: number | null;
  /** Per month to make the date, rounded up to a whole unit; null when not asked. */
  perMonth: number | null;
}

/** The same day `n` months on, clamped to a shorter month's last day. */
function addMonths(day: string, n: number): string {
  const date = parseDay(day);
  if (!date) return day;
  const target = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const d = Math.min(date.getDate(), last);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Whole months to `by`, a remainder counting as one; at least 1. */
export function monthsLeft(today: string, by: string): number {
  if (by <= today) return 1;
  let months = 0;
  while (addMonths(today, months + 1) <= by) months += 1;
  return addMonths(today, months) < by ? months + 1 : Math.max(1, months);
}

/** `left / months`, rounded UP to a whole unit of the currency (`10^scale` stored units). */
export function perMonthNeeded(left: number, months: number, scale: number): number {
  if (left <= 0) return 0;
  const unit = 10 ** scale;
  return Math.ceil(left / Math.max(1, months) / unit) * unit;
}

export function goalProgress(
  goal: SavingsGoal,
  accounts: readonly MoneyAccount[],
  amounts: readonly Amount[],
  today: string,
  scale: number,
): GoalProgress {
  const account = accounts.find((row) => row.id === goal.accountId);
  const saved = account ? balanceOfAccount(account, amounts) : 0;
  const fraction = goal.target > 0 ? Math.max(0, Math.min(1, saved / goal.target)) : 0;
  const left = Math.max(0, goal.target - saved);
  const base = { saved, fraction, left };
  if (!account || account.archivedAt !== null) {
    return { ...base, state: 'paused', months: null, perMonth: null };
  }
  if (left === 0) return { ...base, state: 'reached', months: null, perMonth: null };
  if (goal.by && goal.by < today)
    return { ...base, state: 'pastDue', months: null, perMonth: null };
  if (!goal.by) return { ...base, state: 'active', months: null, perMonth: null };
  const months = monthsLeft(today, goal.by);
  return { ...base, state: 'active', months, perMonth: perMonthNeeded(left, months, scale) };
}

/** Whole percent, never 100 until the target is actually met. */
export function goalPercent(progress: GoalProgress): number {
  const percent = Math.floor(progress.fraction * 100);
  return progress.left > 0 ? Math.min(99, percent) : 100;
}

/** `380,000 of 650,000 AMD · by 31 March 2027`. */
export function describeGoalProgress(
  goal: SavingsGoal,
  progress: GoalProgress,
  currency: string,
  scale: number,
  lang: Language = 'en',
): string {
  const amounts = t('{saved} of {target}', lang, {
    saved: formatValue(Math.max(0, progress.saved), scale),
    target: formatMoney(goal.target, currency, scale),
  });
  return goal.by
    ? `${amounts} · ${t('by {date}', lang, { date: formatLongDay(goal.by, lang) })}`
    : amounts;
}

/** The second line: what a month needs, or why it says nothing about months. */
export function describeGoalStatus(
  progress: GoalProgress,
  accountName: string,
  currency: string,
  scale: number,
  lang: Language = 'en',
): string | null {
  switch (progress.state) {
    case 'reached':
      return t('Reached', lang);
    case 'pastDue':
      return t('The date has passed · {amount} to go', lang, {
        amount: formatMoney(progress.left, currency, scale),
      });
    case 'paused':
      return t('Paused · {name} is archived', lang, { name: accountName });
    default:
      return progress.perMonth === null
        ? null
        : t('{amount} a month to get there', lang, {
            amount: formatMoney(progress.perMonth, currency, scale),
          });
  }
}

/** Live goals first in the order made; paused ones last. */
export function orderGoals<T extends { state: GoalState }>(rows: readonly T[]): T[] {
  return [
    ...rows.filter((row) => row.state !== 'paused'),
    ...rows.filter((row) => row.state === 'paused'),
  ];
}

/** The last day of the month `n` months after `today`'s — the editor's date step. */
export function monthEndAhead(today: string, n: number): string {
  const date = parseDay(today) ?? new Date();
  const last = new Date(date.getFullYear(), date.getMonth() + n + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

/** The store's validator: a name, a positive target, a known subsection, a real date if any. */
export function sanitizeGoals(raw: unknown, accounts: ReadonlySet<ID>): SavingsGoal[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ID>();
  const out: SavingsGoal[] = [];
  for (const entry of raw) {
    const value = entry as Partial<SavingsGoal> | undefined;
    if (!value || typeof value.id !== 'string' || value.id === '' || seen.has(value.id)) continue;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (name === '') continue;
    const target = Math.round(Math.abs(Number(value.target)));
    if (!Number.isFinite(target) || target <= 0) continue;
    if (typeof value.accountId !== 'string' || !accounts.has(value.accountId)) continue;
    seen.add(value.id);
    out.push({
      id: value.id,
      name,
      glyph: typeof value.glyph === 'string' && value.glyph !== '' ? value.glyph : '🎯',
      target,
      ...(typeof value.by === 'string' && parseDay(value.by) ? { by: value.by } : {}),
      accountId: value.accountId,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    });
  }
  return out;
}
