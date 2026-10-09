/**
 * The month-end forecast (M3): one line under the balance.
 *
 *   CASH · ALL TIME
 *   284,600 AMD
 *   ≈ 212,400 AMD on 31 Oct · estimate
 *
 * ── THE ARITHMETIC, ALL OF IT ─────────────────────────────────────────────
 *
 *   balance today
 *   − planned recurring payments not yet answered, due by month end
 *     (overdue ones included: they are not in the balance yet; a planned
 *     recurring INCOME adds instead)
 *   − average daily spend × days left after today
 *
 * Today's own spending is already in the balance, so "days left" starts
 * tomorrow. Incomes that are not planned are not guessed at: a salary that has
 * not been set up as a recurring income is not in the estimate, and the line
 * says `estimate` for exactly this kind of reason.
 *
 * ── THE AVERAGE, DEFINED ──────────────────────────────────────────────────
 *
 * The MEAN of day-spend over the last 28 full days (yesterday back), counting
 * days with nothing spent as zero, and leaving out:
 *   • whole-month amounts — rent "for October" is not a daily habit, and it is
 *     already either in the balance or in "planned";
 *   • amounts a recurring payment recorded — the same reason, or they would be
 *     counted twice, once as history and once as plan;
 *   • transfers and incomes (`isSpending`).
 * Fewer than 28 days of history uses what there is, down to 14; under 14 there
 * is no forecast at all (`FORECAST_MIN_DAYS`). Two weeks is the least that holds
 * both a weekday and a weekend twice.
 *
 * REJECTED: the MEDIAN day. It is the honest "typical day", but the line
 * estimates a SUM over the days left, and for a sum the mean is the right
 * statistic: someone who shops big on Saturdays and spends nothing on weekdays
 * has a median day of 0, and a forecast that ignored their Saturdays would be
 * wrong every single month.
 *
 * ── WHOSE BALANCE ─────────────────────────────────────────────────────────
 *
 * One subsection's, like the figure it sits under — its balance, its planned
 * payments, its own spending history. `accountId: null` asks for every live
 * subsection together; the lib answers it (tests pin that the two agree), and
 * the screen does not ask, for the reason `lib/money.ts` gives about sums
 * across pockets.
 *
 * No subsection, or not enough history: no forecast — never a zero, never a
 * guess.
 */

import { daysBetween, formatShortDay, parseDay, shiftDay } from './days';
import { t, type Language } from './i18n';
import { balanceOfAccount, formatMoney, type Amount, type MoneyAccount } from './money';
import { isSpending } from './moneyCalendar';
import { unansweredThrough, type RecurringPayment } from './recurring';
import type { ID } from '../types/models';

export const FORECAST_MIN_DAYS = 14;
export const FORECAST_WINDOW_DAYS = 28;

export interface DailySpend {
  /** Mean spend per day over the window, in the log's units (not rounded). */
  perDay: number;
  /** How many days it was taken over: 14–28. */
  days: number;
}

/**
 * The average daily spend — see the header for what is in and out. Null below
 * `FORECAST_MIN_DAYS` of history in the scope.
 */
export function averageDailySpend(params: {
  amounts: readonly Amount[];
  accountId: ID | null;
  today: string;
  /** Amount ids recorded by recurring payments: plan, not habit. */
  exclude?: ReadonlySet<ID>;
}): DailySpend | null {
  const { amounts, accountId, today } = params;
  let earliest: string | null = null;
  for (const amount of amounts) {
    if (accountId !== null && amount.accountId !== accountId) continue;
    if (amount.when.kind !== 'day') continue;
    if (earliest === null || amount.when.date < earliest) earliest = amount.when.date;
  }
  if (earliest === null) return null;
  const history = daysBetween(earliest, today);
  if (history < FORECAST_MIN_DAYS) return null;
  const days = Math.min(FORECAST_WINDOW_DAYS, history);
  const from = shiftDay(today, -days);
  let sum = 0;
  for (const amount of amounts) {
    if (amount.when.kind !== 'day') continue;
    if (!isSpending(amount, accountId)) continue;
    if (params.exclude?.has(amount.id)) continue;
    if (amount.when.date < from || amount.when.date >= today) continue;
    sum += amount.value;
  }
  return { perDay: sum / days, days };
}

/** The last day of `today`'s month. */
export function monthEndOf(today: string): string {
  const date = parseDay(today);
  if (!date) return today;
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(
    last.getDate(),
  ).padStart(2, '0')}`;
}

export interface Forecast {
  /** The estimate, in the log's units, rounded to a whole stored unit. */
  value: number;
  /** The day it is for: the month's last. */
  on: string;
  balance: number;
  /** Planned recurring money to month end, signed: out negative, in positive. */
  planned: number;
  perDay: number;
  /** perDay × daysLeft, rounded. */
  spendAhead: number;
  daysLeft: number;
}

/** Every amount a recurring payment wrote — the average leaves them out. */
export function recurringAmountIds(items: readonly RecurringPayment[]): Set<ID> {
  const ids = new Set<ID>();
  for (const item of items) {
    for (const answer of Object.values(item.handled)) {
      if (answer.amountId) ids.add(answer.amountId);
    }
  }
  return ids;
}

export function monthEndForecast(params: {
  accounts: readonly MoneyAccount[];
  amounts: readonly Amount[];
  recurring: readonly RecurringPayment[];
  /** One subsection, or null for every live one together. */
  accountId: ID | null;
  today: string;
}): Forecast | null {
  const { amounts, today, accountId } = params;
  const live = params.accounts.filter((account) => account.archivedAt === null);
  const scope = accountId === null ? live : live.filter((account) => account.id === accountId);
  if (scope.length === 0) return null;
  const inScope = new Set(scope.map((account) => account.id));

  const average = averageDailySpend({
    amounts,
    accountId,
    today,
    exclude: recurringAmountIds(params.recurring),
  });
  if (!average) return null;

  const on = monthEndOf(today);
  const daysLeft = Math.max(0, daysBetween(today, on));
  const balance = scope.reduce((sum, account) => sum + balanceOfAccount(account, amounts), 0);
  let planned = 0;
  for (const item of params.recurring) {
    if (!inScope.has(item.accountId)) continue;
    const count = unansweredThrough(item, today, on).length;
    planned += (item.direction === 'income' ? 1 : -1) * count * item.value;
  }
  const spendAhead = Math.round(average.perDay * daysLeft);
  return {
    value: balance + planned - spendAhead,
    on,
    balance,
    planned,
    perDay: average.perDay,
    spendAhead,
    daysLeft,
  };
}

/** `≈ 212,400 AMD on 31 October · estimate` — the word is part of the figure. */
export function describeForecast(
  forecast: Forecast,
  currency: string,
  scale: number,
  lang: Language = 'en',
): string {
  return t('≈ {amount} on {date} · estimate', lang, {
    amount: formatMoney(forecast.value, currency, scale),
    date: formatShortDay(forecast.on, lang),
  });
}
