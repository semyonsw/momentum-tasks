/**
 * The money calendar (M4): a month of SPENDING, one square a day, darker the
 * more that day cost.
 *
 *   ‹      September 2026      ›
 *        171,400 AMD out
 *   ┌ WHOLE MONTH · NOT ON ANY DAY ───────────┐
 *   │ 🏠 Rent · 150,000   📱 Phone · 5,900     │
 *   └─────────────────────────────────────────┘
 *    M    T    W    T    F    S    S
 *        ▢1   ▣2   ▤3   ▥4   ▦5   ▢6
 *         ·  2.4k  900  12k  152k   ·
 *
 * The history's day list answers "what was that Tuesday"; the trend line
 * answers "is it going up". Neither answers the question this one is opened
 * with — WHICH days were the expensive ones — and a month of squares is the
 * shape that does, the same way the task month is.
 *
 * ── EXPENSES ONLY ─────────────────────────────────────────────────────────
 *
 * A calendar of "money moved" would put a salary day and a rent day at the same
 * darkness, and a heat scale that cannot tell in from out is not saying
 * anything. This is a calendar of spending, so incomes are not on it at all —
 * not netted against a day (a day you were paid would look like a day you spent
 * nothing) and not drawn in a second colour (one hue at four alphas is the
 * whole visual language of the app's grids). Incomes stay where they are read
 * today: the day list and the trend.
 *
 * ── TRANSFERS ARE NOT SPENDING ────────────────────────────────────────────
 *
 * Moving 50,000 from Cash to Online writes an expense half in Cash. That money
 * was not spent, and a calendar that showed the day you topped up a card as the
 * darkest of the month would be lying in the one place it is meant to be read
 * at a glance. A transfer half is recognised by its `transferId` OR its
 * category, either being enough — an old half that lost its id still sits in
 * `transfer_out`.
 *
 * ── WHOLE-MONTH AMOUNTS ARE ON NO DAY ─────────────────────────────────────
 *
 * Rent paid "for September" was not spent on the 1st, and putting it there
 * makes the 1st the darkest square every month and every other day pale next
 * to it. The rule is `inInterval`'s (a whole-month amount belongs to no day and
 * no week), so it is this screen's too: those amounts are summed separately and
 * shown in a strip ABOVE the grid, grouped by category, and they count in the
 * month's total but not in any square or in the scale.
 *
 * ── THE FOUR STEPS: A SHARE OF THE MONTH'S DEAREST DAY ─────────────────────
 *
 * A day's step is its spend as a share of the most spent on any single day of
 * that month: above 0 is step 1, past a quarter step 2, past half step 3, past
 * three quarters step 4 — so the dearest day is always the darkest square and
 * every other square says how it compares to it. That is a statement anyone can
 * check against the numbers in the cells, which is the test for "honest".
 *
 * Rejected:
 *  - FIXED THRESHOLDS (1,000 / 5,000 / 20,000): a guessed number, and the
 *    currency is a label — the same thresholds in AMD and in USD would mean
 *    nothing in one of them.
 *  - QUARTILES of the spending days: every month would come out evenly
 *    shaded however lopsided it was, and a quiet month's dearest 800 would be
 *    drawn as dark as a heavy month's 150,000.
 *  - A continuous alpha: unreadable back off a screen; four steps plus empty is
 *    what the eye can count, as on the task grids.
 * What the share-of-max scale costs: one huge day pushes the rest to step 1.
 * That is true of the month, and the exact figure is printed in every cell.
 *
 * ── THE SUBSECTION ────────────────────────────────────────────────────────
 *
 * `accountId` filters to one account, or `null` for all of them. The screen
 * passes the subsection the history was opened for, for the reason the history
 * itself gives: a total that disagrees with the screen it came from is a total
 * nobody can use.
 *
 * ── THE SCALE ─────────────────────────────────────────────────────────────
 *
 * Amounts are integers in the log's own units (`lib/moneyUnits.ts`): sums here
 * stay integers, and only `compactMoney` / the screen's `formatMoney` read the
 * scale — so a USD log's `1250` is 12.50 in the line under the grid and `12.5`
 * in its cell.
 */

import { dayKey, formatMonth, formatShortDay, weekdayIndex } from './days';
import { plural, t, type Language } from './i18n';
import { formatMoney, isTransferCategory, type Amount } from './money';
import type { ID } from '../types/models';

/** 0 = nothing spent, 1–4 = the four heat steps (`greenSteps()` 24/42/60/82%). */
export type SpendLevel = 0 | 1 | 2 | 3 | 4;

export interface SpendDay {
  /** Day of the month, or null for the lead padding before the 1st. */
  day: number | null;
  date: string | null;
  /** Spent on that day, in the log's units (whole-month amounts excluded). */
  total: number;
  /** How many expense amounts made it up. */
  count: number;
  level: SpendLevel;
  /** The category that took the most that day, for the line under the grid. */
  topCategoryId: ID | null;
  isToday: boolean;
  isFuture: boolean;
}

/** One category's whole-month spending: a chip in the strip above the grid. */
export interface WholeMonthItem {
  categoryId: ID;
  total: number;
  count: number;
}

export interface SpendMonth {
  year: number;
  /** 0-based, as `Date` uses it. */
  month: number;
  label: string;
  /** Monday-first weeks, padded at the start only (like `tasksMonth`). */
  weeks: SpendDay[][];
  /** Spent on days. */
  daysTotal: number;
  /** Spent "for the whole month", on no day. */
  wholeTotal: number;
  /** The two together: what the month cost. */
  total: number;
  /** The dearest single day — the top of the scale. 0 when nothing was spent on a day. */
  peak: number;
  /** Whole-month spending by category, largest first. */
  whole: WholeMonthItem[];
}

/** Is this amount spending, in this account? The three exclusions, in one place. */
export function isSpending(amount: Amount, accountId: ID | null = null): boolean {
  if (amount.direction !== 'expense') return false;
  if (amount.transferId !== undefined || isTransferCategory(amount.categoryId)) return false;
  return accountId === null || amount.accountId === accountId;
}

/** A day's step: its share of the month's dearest day, in quarters (see the header). */
export function spendLevel(total: number, peak: number): SpendLevel {
  if (!(total > 0) || !(peak > 0)) return 0;
  const share = total / peak;
  if (share > 0.75) return 4;
  if (share > 0.5) return 3;
  if (share > 0.25) return 2;
  return 1;
}

/**
 * The month of spending. `accountId` null = every account; `today` decides
 * `isToday` / `isFuture` only — an amount written on a future day is still drawn.
 */
export function moneyMonth(
  amounts: readonly Amount[],
  year: number,
  month: number,
  today: string,
  accountId: ID | null = null,
  lang: Language = 'en',
): SpendMonth {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totals = new Array<number>(daysInMonth + 1).fill(0);
  const counts = new Array<number>(daysInMonth + 1).fill(0);
  const byCategoryOnDay: Record<ID, number>[] = Array.from({ length: daysInMonth + 1 }, () => ({}));
  const whole = new Map<ID, WholeMonthItem>();
  let wholeTotal = 0;

  const first = dayKey(new Date(year, month, 1));
  const last = dayKey(new Date(year, month, daysInMonth));

  for (const amount of amounts) {
    if (!isSpending(amount, accountId)) continue;
    if (amount.when.kind === 'month') {
      if (amount.when.year !== year || amount.when.month !== month) continue;
      wholeTotal += amount.value;
      const item = whole.get(amount.categoryId) ?? {
        categoryId: amount.categoryId,
        total: 0,
        count: 0,
      };
      item.total += amount.value;
      item.count += 1;
      whole.set(amount.categoryId, item);
      continue;
    }
    const date = amount.when.date;
    if (date < first || date > last) continue;
    const day = Number(date.slice(8, 10));
    if (!(day >= 1 && day <= daysInMonth)) continue;
    totals[day] += amount.value;
    counts[day] += 1;
    const cats = byCategoryOnDay[day];
    cats[amount.categoryId] = (cats[amount.categoryId] ?? 0) + amount.value;
  }

  const peak = Math.max(0, ...totals);
  const lead = weekdayIndex(new Date(year, month, 1));
  const cells: SpendDay[] = [];
  for (let i = 0; i < lead; i += 1) {
    cells.push({
      day: null,
      date: null,
      total: 0,
      count: 0,
      level: 0,
      topCategoryId: null,
      isToday: false,
      isFuture: false,
    });
  }
  let daysTotal = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dayKey(new Date(year, month, day));
    daysTotal += totals[day];
    cells.push({
      day,
      date,
      total: totals[day],
      count: counts[day],
      level: spendLevel(totals[day], peak),
      topCategoryId: topOf(byCategoryOnDay[day]),
      isToday: date === today,
      isFuture: date > today,
    });
  }

  const weeks: SpendDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    year,
    month,
    label: formatMonth(year, month, lang),
    weeks,
    daysTotal,
    wholeTotal,
    total: daysTotal + wholeTotal,
    peak,
    whole: [...whole.values()].sort((a, b) => b.total - a.total),
  };
}

/** The category with the most in it; on a tie, the one met first. */
function topOf(totals: Record<ID, number>): ID | null {
  let best: ID | null = null;
  let value = 0;
  for (const [id, total] of Object.entries(totals)) {
    if (total > value) {
      best = id;
      value = total;
    }
  }
  return best;
}

const SUFFIXES = ['k', 'M', 'B'] as const;

function trimmed(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

/**
 * A spend in four characters or so, for a 46 dp cell: `152k`, `2.4k`, `1.2M`,
 * `900`. An approximation by design — the exact figure is the line under the
 * grid on a tap — so it says the magnitude and two significant digits, never
 * more than a cell can hold. One decimal below ten of a unit (`2.4k`), none
 * above (`152k`), and a value that rounds up to the next unit is written in it
 * (`999,600` is `1M`, not `1000k`). Cents only where a whole number would hide
 * the amount (`0.4`, `12.5` in a USD log); `''` for nothing spent.
 *
 * The suffixes stay Latin in Russian too: `k`/`M` are what a phone keyboard and
 * every banking app already show for thousands, and `тыс.` does not fit a cell.
 */
export function compactMoney(value: number, scale = 0): string {
  if (!(value > 0)) return '';
  const whole = value / 10 ** scale;
  if (whole < 1000) {
    const decimals = scale > 0 && whole < 100 ? 1 : 0;
    const shown = Number(whole.toFixed(decimals));
    if (shown < 1000) return shown === 0 ? trimmed(whole, scale) : String(shown);
  }
  for (let i = 0; i < SUFFIXES.length; i += 1) {
    const unit = 1000 ** (i + 1);
    const q = whole / unit;
    const shown = Number(q.toFixed(q < 10 ? 1 : 0));
    if (shown < 1000 || i === SUFFIXES.length - 1) return `${trimmed(shown, 1)}${SUFFIXES[i]}`;
  }
  return '';
}

/**
 * The line under the grid for a tapped day: the date, the exact sum, and how
 * many amounts — or that nothing was spent. `topName` is the dearest
 * category's name when the day had more than one amount, so a 152k day says
 * where it went without opening it.
 */
export function describeSpendDay(
  cell: SpendDay,
  code: string,
  scale: number,
  lang: Language = 'en',
  topName: string | null = null,
): string {
  if (cell.date === null) return '';
  const day = formatShortDay(cell.date, lang);
  if (cell.total <= 0) return t('{day} · nothing spent', lang, { day });
  const count = t('{count} {amounts}', lang, {
    count: cell.count,
    amounts: plural(cell.count, lang, {
      one: t('amount', lang),
      few: 'суммы',
      many: t('amounts', lang),
    }),
  });
  const parts = [day, formatMoney(cell.total, code, scale), count];
  if (topName && cell.count > 1) parts.push(t('mostly {name}', lang, { name: topName }));
  return parts.join(' · ');
}
