/**
 * The finance history's third view: the categories you tick, over the period
 * you pick, both directions at once.
 *
 *   (Week)(Month)(3 months)(Year)(All time)(Custom)
 *   ☑ EXPENSES                     ☐ INCOMES
 *   ☑ 🧊 Food                      ☐ 💼 Salary
 *   ☐ 🚌 Transport                 ☑ 🎁 Gifts
 *   Spent 31,200 AMD · received 20,000 AMD
 *
 * The day list answers "what was that Tuesday" and the trend answers "is it
 * going up". Neither answers "how much went on food and transport since the
 * 1st, and how much came in as gifts" — a question about a HAND-PICKED set of
 * categories over a hand-picked stretch of time, and that is this file.
 *
 * ── EXPENSES AND INCOMES IN ONE LIST, NEVER IN ONE NUMBER ─────────────────
 *
 * A tick does not care which side a category is on, so the filter does not
 * either. The totals do: what went out and what came in are summed apart and
 * shown apart, because a single figure netting salary against rent is a balance,
 * and the balance already has its own line on this screen.
 *
 * ── THE PRESETS ARE THE CHART'S RANGES ────────────────────────────────────
 *
 * Week / Month / 3 months / Year / All time start where the trend line on the
 * Day view starts (`moneyRangeStart`), so the same chip names the same stretch
 * of days everywhere on this screen. Every preset ends today. `Custom` is two
 * days the user picks, inclusive, and either order means the same range.
 *
 * ── A WHOLE-MONTH AMOUNT COUNTS ONLY WHEN ITS WHOLE MONTH IS INSIDE ───────
 *
 * Rent "for September" is on no day (`inInterval`), so it cannot be tested
 * against a day range the way a taxi can. Counting it whenever its month merely
 * touched the range would put all of September's rent into "the last 7 days"
 * on 2 October; leaving it out always would make 1–30 September, picked by
 * hand, disagree with the month it was meant to be. So it is in when the range
 * covers its month from the 1st to the last day, and the screen says so.
 *
 * ── TRANSFERS ARE NEITHER ─────────────────────────────────────────────────
 *
 * Moving money between Cash and Online is not spending and not income, so the
 * Transfer categories are not offered as a tick and a transfer half is never
 * counted, by its `transferId` or by its category — the calendar's rule.
 */

import { dayKey, parseDay } from './days';
import { isTransferCategory, type Amount, type Direction, type MoneyCategory } from './money';
import { moneyRangeStart } from './moneyTrends';
import { TREND_RANGES, type TrendRange } from './trends';
import type { ID } from '../types/models';

/** A preset from the chart's chips, or two days the user picked. */
export type FilterPeriod =
  { kind: 'range'; range: TrendRange } | { kind: 'custom'; from: string; to: string };

/**
 * What the categories view is showing. Held on the history's ROUTE, not in the
 * screen, for the reason `day` is: a row opens the amount editor, a pushed route
 * replaces the screen, and coming back would otherwise untick everything.
 */
export interface CategoryFilter {
  period: FilterPeriod;
  /**
   * The ticked category ids, or null for EVERY category. Null is the default and
   * not a list of today's ids, so a category added later is ticked with the rest
   * instead of being the one silently missing from "everything".
   */
  selected: ID[] | null;
}

export const DEFAULT_CATEGORY_FILTER: CategoryFilter = {
  period: { kind: 'range', range: 'month' },
  selected: null,
};

/** The chips, in order: the chart's five, then `custom`. */
export const FILTER_PERIOD_KINDS: readonly (TrendRange | 'custom')[] = [...TREND_RANGES, 'custom'];

/**
 * What `Custom` opens on when first tapped: the 1st of this month to today — the
 * month so far, which is the stretch a hand-picked range most often starts from.
 */
export function defaultCustomPeriod(today: string): FilterPeriod {
  const at = parseDay(today);
  const from = at ? dayKey(new Date(at.getFullYear(), at.getMonth(), 1)) : today;
  return { kind: 'custom', from, to: today };
}

/** The first and last day a period covers, both inclusive, `from <= to`. */
export function periodBounds(
  amounts: readonly Amount[],
  period: FilterPeriod,
  today: string,
): { from: string; to: string } {
  if (period.kind === 'range') {
    return { from: moneyRangeStart(amounts, period.range, today), to: today };
  }
  return period.from <= period.to
    ? { from: period.from, to: period.to }
    : { from: period.to, to: period.from };
}

/** Is this a transfer half — money moved between your own accounts? */
function isTransfer(amount: Amount): boolean {
  return amount.transferId !== undefined || isTransferCategory(amount.categoryId);
}

/**
 * The categories a tick is offered for, one list per direction, in their order.
 *
 * Live ones, and an ARCHIVED one only while it still has amounts in `amounts`:
 * archiving keeps the amounts, and a filter that could not reach them would make
 * last year's history unreadable the day a category was retired. Never Transfer.
 */
export function filterableCategories<C extends MoneyCategory>(
  categories: readonly C[],
  amounts: readonly Amount[],
): Record<Direction, C[]> {
  const used = new Set(amounts.map((amount) => amount.categoryId));
  const offered = categories
    .filter(
      (category) =>
        !isTransferCategory(category.id) && (category.archivedAt === null || used.has(category.id)),
    )
    .sort((a, b) => a.order - b.order);
  return {
    expense: offered.filter((category) => category.direction === 'expense'),
    income: offered.filter((category) => category.direction === 'income'),
  };
}

export function isTicked(selected: readonly ID[] | null, id: ID): boolean {
  return selected === null || selected.includes(id);
}

/**
 * Tick or untick some categories. `ids` is one category for a row, or a whole
 * direction for its header; `every` is every id on offer, which is what a null
 * (= all) selection expands to before one is taken out of it.
 *
 * The header's rule: if all of `ids` are ticked it unticks them, otherwise it
 * ticks them all — the way a group checkbox in a mail client behaves. A
 * selection that ends up holding every offered id goes back to null, so it keeps
 * up with categories added later.
 */
export function toggleTicks(
  selected: readonly ID[] | null,
  ids: readonly ID[],
  every: readonly ID[],
): ID[] | null {
  const current = new Set(selected ?? every);
  const allOn = ids.every((id) => current.has(id));
  for (const id of ids) {
    if (allOn) current.delete(id);
    else current.add(id);
  }
  const next = every.filter((id) => current.has(id));
  return next.length === every.length ? null : next;
}

/** Does this amount fall inside `[from, to]`? See the header for whole months. */
export function inBounds(amount: Amount, from: string, to: string): boolean {
  if (amount.when.kind === 'day') return amount.when.date >= from && amount.when.date <= to;
  const first = dayKey(new Date(amount.when.year, amount.when.month, 1));
  const last = dayKey(new Date(amount.when.year, amount.when.month + 1, 0));
  return first >= from && last <= to;
}

/** Day amounts by their day, whole-month ones by their month's last day. */
function sortKey(amount: Amount): string {
  if (amount.when.kind === 'day') return `${amount.when.date}#${amount.createdAt}`;
  const last = new Date(amount.when.year, amount.when.month + 1, 0);
  return `${dayKey(last)}#${amount.createdAt}`;
}

/**
 * Every amount in a ticked category inside the period, newest first — the same
 * order as a category's own list, since this is that list for several at once.
 * Transfers are never in it.
 */
export function filterAmounts(
  amounts: readonly Amount[],
  selected: readonly ID[] | null,
  from: string,
  to: string,
): Amount[] {
  return amounts
    .filter(
      (amount) =>
        !isTransfer(amount) && isTicked(selected, amount.categoryId) && inBounds(amount, from, to),
    )
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

/** One ticked category's share of the result. */
export interface FilteredCategoryTotal {
  categoryId: ID;
  direction: Direction;
  total: number;
  count: number;
}

export interface FilteredSummary {
  /** Expenses in the result. */
  spent: number;
  /** Incomes in the result. */
  received: number;
  /** One line per category that has anything in the result, largest first. */
  byCategory: FilteredCategoryTotal[];
}

/** The totals for a filtered list: out and in apart, then per category. */
export function summarizeFiltered(rows: readonly Amount[]): FilteredSummary {
  let spent = 0;
  let received = 0;
  const byCategory = new Map<ID, FilteredCategoryTotal>();
  for (const row of rows) {
    if (row.direction === 'expense') spent += row.value;
    else received += row.value;
    const line = byCategory.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      direction: row.direction,
      total: 0,
      count: 0,
    };
    line.total += row.value;
    line.count += 1;
    byCategory.set(row.categoryId, line);
  }
  return {
    spent,
    received,
    byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total),
  };
}
