import { describe, expect, it } from 'vitest';

import { transferPair, type Amount, type MoneyCategory } from './money';
import {
  DEFAULT_CATEGORY_FILTER,
  FILTER_PERIOD_KINDS,
  defaultCustomPeriod,
  filterAmounts,
  filterableCategories,
  inBounds,
  isTicked,
  periodBounds,
  summarizeFiltered,
  toggleTicks,
} from './moneyFilter';
import { moneyRangeStart } from './moneyTrends';

/**
 * The finance history's categories view. What is worth pinning: expenses and
 * incomes tick alike but never sum together, the presets mean what the chart's
 * chips mean, whole-month amounts count only inside a whole month, transfers
 * never count, and "everything" keeps meaning everything as categories change.
 */

let seq = 0;
function amount(
  categoryId: string,
  direction: 'expense' | 'income',
  date: string,
  value: number,
  over: Partial<Amount> = {},
): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId,
    accountId: 'cash',
    direction,
    value,
    when: { kind: 'day', date },
    note: '',
    createdAt: `2026-09-01T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ...over,
  };
}
const out = (categoryId: string, date: string, value: number, over: Partial<Amount> = {}) =>
  amount(categoryId, 'expense', date, value, over);
const into = (categoryId: string, date: string, value: number, over: Partial<Amount> = {}) =>
  amount(categoryId, 'income', date, value, over);
const forMonth = (
  categoryId: string,
  direction: 'expense' | 'income',
  year: number,
  month: number,
  value: number,
) => amount(categoryId, direction, '2026-01-01', value, { when: { kind: 'month', year, month } });

function category(
  id: string,
  direction: 'expense' | 'income',
  order: number,
  archivedAt: string | null = null,
): MoneyCategory {
  return { id, name: id, glyph: '•', direction, order, archivedAt };
}

const TODAY = '2026-10-20';

describe('the period', () => {
  it('offers the chart’s five presets, then Custom', () => {
    expect(FILTER_PERIOD_KINDS).toEqual(['week', 'month', 'quarter', 'year', 'all', 'custom']);
  });

  it('opens on this month’s preset with every category ticked', () => {
    expect(DEFAULT_CATEGORY_FILTER).toEqual({
      period: { kind: 'range', range: 'month' },
      selected: null,
    });
  });

  it('starts a preset where the trend line starts, and ends it today', () => {
    const log = [out('food', '2025-03-04', 100)];
    for (const range of ['week', 'month', 'quarter', 'year', 'all'] as const) {
      expect(periodBounds(log, { kind: 'range', range }, TODAY)).toEqual({
        from: moneyRangeStart(log, range, TODAY),
        to: TODAY,
      });
    }
    expect(periodBounds(log, { kind: 'range', range: 'week' }, TODAY)).toEqual({
      from: '2026-10-14',
      to: TODAY,
    });
    expect(periodBounds(log, { kind: 'range', range: 'all' }, TODAY).from).toBe('2025-03-01');
  });

  it('takes a custom range as given, and either way round', () => {
    expect(
      periodBounds([], { kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, TODAY),
    ).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(
      periodBounds([], { kind: 'custom', from: '2026-09-30', to: '2026-09-01' }, TODAY),
    ).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('opens Custom on the month so far', () => {
    expect(defaultCustomPeriod(TODAY)).toEqual({
      kind: 'custom',
      from: '2026-10-01',
      to: TODAY,
    });
    expect(defaultCustomPeriod('2026-03-01')).toEqual({
      kind: 'custom',
      from: '2026-03-01',
      to: '2026-03-01',
    });
  });
});

describe('which categories get a checkbox', () => {
  const categories = [
    category('salary', 'income', 1),
    category('food', 'expense', 2),
    category('taxi', 'expense', 1),
    category('transfer_out', 'expense', 0),
    category('transfer_in', 'income', 0),
    category('old_gym', 'expense', 3, '2026-05-01T00:00:00.000Z'),
    category('old_bonus', 'income', 2, '2026-05-01T00:00:00.000Z'),
  ];

  it('both directions, apart and in their own order, never Transfer', () => {
    const groups = filterableCategories(categories, []);
    expect(groups.expense.map((c) => c.id)).toEqual(['taxi', 'food']);
    expect(groups.income.map((c) => c.id)).toEqual(['salary']);
  });

  it('keeps an archived category while it still has amounts', () => {
    const groups = filterableCategories(categories, [out('old_gym', '2026-01-03', 9000)]);
    expect(groups.expense.map((c) => c.id)).toEqual(['taxi', 'food', 'old_gym']);
    expect(groups.income.map((c) => c.id)).toEqual(['salary']);
  });
});

describe('ticking', () => {
  const every = ['food', 'taxi', 'salary', 'gift'];

  it('null is everything, including a category nobody has seen yet', () => {
    expect(isTicked(null, 'food')).toBe(true);
    expect(isTicked(null, 'added-tomorrow')).toBe(true);
    expect(isTicked([], 'food')).toBe(false);
    expect(isTicked(['food'], 'food')).toBe(true);
    expect(isTicked(['food'], 'taxi')).toBe(false);
  });

  it('unticks one out of everything', () => {
    expect(toggleTicks(null, ['taxi'], every)).toEqual(['food', 'salary', 'gift']);
  });

  it('ticks one back, and a full set goes back to null', () => {
    expect(toggleTicks(['food'], ['taxi'], every)).toEqual(['food', 'taxi']);
    expect(toggleTicks(['food', 'salary', 'gift'], ['taxi'], every)).toBeNull();
  });

  it('mixes expense and income categories freely', () => {
    expect(toggleTicks([], ['food'], every)).toEqual(['food']);
    expect(toggleTicks(['food'], ['salary'], every)).toEqual(['food', 'salary']);
  });

  it('a group header unticks a fully ticked group…', () => {
    expect(toggleTicks(null, ['salary', 'gift'], every)).toEqual(['food', 'taxi']);
  });

  it('…and ticks the rest of a partly ticked one', () => {
    expect(toggleTicks(['food', 'salary'], ['salary', 'gift'], every)).toEqual([
      'food',
      'salary',
      'gift',
    ]);
    expect(toggleTicks([], ['salary', 'gift'], every)).toEqual(['salary', 'gift']);
  });

  it('can untick everything', () => {
    expect(toggleTicks(['food'], ['food'], every)).toEqual([]);
  });

  it('forgets an id that is no longer on offer', () => {
    expect(toggleTicks(['food', 'deleted'], ['taxi'], every)).toEqual(['food', 'taxi']);
  });
});

describe('a whole-month amount', () => {
  const rent = forMonth('rent', 'expense', 2026, 8, 150000); // September

  it('counts when the period covers its whole month', () => {
    expect(inBounds(rent, '2026-09-01', '2026-09-30')).toBe(true);
    expect(inBounds(rent, '2026-08-15', '2026-10-02')).toBe(true);
  });

  it('does not when the period only touches it', () => {
    expect(inBounds(rent, '2026-09-02', '2026-09-30')).toBe(false);
    expect(inBounds(rent, '2026-09-01', '2026-09-29')).toBe(false);
    expect(inBounds(rent, '2026-09-28', '2026-10-04')).toBe(false);
  });

  it('knows February’s last day', () => {
    const feb = forMonth('rent', 'expense', 2028, 1, 1); // leap year
    expect(inBounds(feb, '2028-02-01', '2028-02-28')).toBe(false);
    expect(inBounds(feb, '2028-02-01', '2028-02-29')).toBe(true);
  });

  it('a day amount is in on both edges', () => {
    expect(inBounds(out('food', '2026-09-01', 1), '2026-09-01', '2026-09-30')).toBe(true);
    expect(inBounds(out('food', '2026-09-30', 1), '2026-09-01', '2026-09-30')).toBe(true);
    expect(inBounds(out('food', '2026-10-01', 1), '2026-09-01', '2026-09-30')).toBe(false);
    expect(inBounds(out('food', '2026-08-31', 1), '2026-09-01', '2026-09-30')).toBe(false);
  });
});

describe('the result', () => {
  const pair =
    transferPair(
      { fromAccountId: 'cash', toAccountId: 'card', value: 50000, date: '2026-09-10' },
      { transferId: 'tr1', outId: 'tout', inId: 'tin' },
      '2026-09-10T10:00:00.000Z',
    ) ?? [];
  const log: Amount[] = [
    out('food', '2026-09-03', 2600, { note: 'groceries' }),
    out('taxi', '2026-09-05', 400),
    into('salary', '2026-09-05', 300000),
    out('food', '2026-09-20', 1400),
    into('gift', '2026-09-21', 20000),
    out('food', '2026-10-02', 999), // outside September
    forMonth('rent', 'expense', 2026, 8, 150000),
    ...pair,
    out('food', '2026-09-11', 5000, { transferId: 'stray' }), // a transfer half filed oddly
  ];

  it('holds only the ticked categories, expenses and incomes together', () => {
    const rows = filterAmounts(log, ['food', 'gift'], '2026-09-01', '2026-09-30');
    expect(rows.map((r) => [r.categoryId, r.value])).toEqual([
      ['gift', 20000],
      ['food', 1400],
      ['food', 2600],
    ]);
  });

  it('everything ticked is every category, minus transfers', () => {
    const rows = filterAmounts(log, null, '2026-09-01', '2026-09-30');
    expect(rows.map((r) => r.categoryId).sort()).toEqual(
      ['food', 'food', 'gift', 'rent', 'salary', 'taxi'].sort(),
    );
    expect(rows.some((r) => r.transferId !== undefined)).toBe(false);
  });

  it('nothing ticked is nothing', () => {
    expect(filterAmounts(log, [], '2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('is newest first, a whole-month amount sorting on its month’s last day', () => {
    const rows = filterAmounts(log, ['food', 'rent'], '2026-09-01', '2026-10-31');
    expect(rows.map((r) => r.categoryId + ':' + r.value)).toEqual([
      'food:999',
      'rent:150000',
      'food:1400',
      'food:2600',
    ]);
  });

  it('a custom range picked backwards reads the same', () => {
    const a = periodBounds(log, { kind: 'custom', from: '2026-09-30', to: '2026-09-01' }, TODAY);
    const b = periodBounds(log, { kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, TODAY);
    expect(filterAmounts(log, null, a.from, a.to)).toEqual(filterAmounts(log, null, b.from, b.to));
  });

  it('sums out and in apart, and per category largest first', () => {
    const rows = filterAmounts(log, ['food', 'taxi', 'salary', 'gift'], '2026-09-01', '2026-09-30');
    const summary = summarizeFiltered(rows);
    expect(summary.spent).toBe(2600 + 400 + 1400);
    expect(summary.received).toBe(300000 + 20000);
    expect(summary.byCategory).toEqual([
      { categoryId: 'salary', direction: 'income', total: 300000, count: 1 },
      { categoryId: 'gift', direction: 'income', total: 20000, count: 1 },
      { categoryId: 'food', direction: 'expense', total: 4000, count: 2 },
      { categoryId: 'taxi', direction: 'expense', total: 400, count: 1 },
    ]);
  });

  it('an income-only selection spends nothing', () => {
    const summary = summarizeFiltered(filterAmounts(log, ['salary'], '2026-09-01', '2026-09-30'));
    expect(summary).toEqual({
      spent: 0,
      received: 300000,
      byCategory: [{ categoryId: 'salary', direction: 'income', total: 300000, count: 1 }],
    });
  });

  it('an empty result sums to zero', () => {
    expect(summarizeFiltered([])).toEqual({ spent: 0, received: 0, byCategory: [] });
  });
});
