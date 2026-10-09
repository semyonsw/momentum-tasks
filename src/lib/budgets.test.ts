import { describe, expect, it } from 'vitest';

import {
  BUDGET_ROLLOVER,
  BUDGET_STEP,
  alertKey,
  budgetAlertsDue,
  budgetLimit,
  budgetNote,
  budgetStatus,
  budgetStatuses,
  describeBudgetAlert,
  describeBudgetMonth,
  monthElapsed,
  pruneFired,
  sanitizeBudgets,
  sanitizeFired,
  spentInMonth,
  stepBudget,
  tileBudgetLine,
  visibleBudgets,
  type Budget,
} from './budgets';
import { transferPair, type Amount, type MoneyCategory } from './money';

/**
 * Budgets (M1). What has to hold: a month's spending is every expense in the
 * category in that month — day amounts AND whole-month ones, every subsection —
 * and nothing that is not spending; a month starts at its own figure; an
 * archived category keeps its budget and goes quiet; an alert says each
 * threshold once a month; and the log's scale is respected throughout.
 */

let seq = 0;
function spent(date: string, value: number, over: Partial<Amount> = {}): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense',
    value,
    when: { kind: 'day', date },
    note: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function category(id: string, over: Partial<MoneyCategory> = {}): MoneyCategory {
  return { id, name: id, glyph: '•', direction: 'expense', order: 0, archivedAt: null, ...over };
}

const FOOD: Budget = { categoryId: 'food', monthly: 80000 };
const TODAY = '2026-10-05';

describe('what counts as spent in the month', () => {
  it('counts day amounts and whole-month amounts of the category in that month', () => {
    const amounts = [
      spent('2026-10-01', 10000),
      spent('2026-10-31', 4200),
      spent('2026-01-01', 30000, { when: { kind: 'month', year: 2026, month: 9 } }),
      // Another month, both shapes.
      spent('2026-09-30', 99999),
      spent('2026-01-01', 77777, { when: { kind: 'month', year: 2026, month: 8 } }),
    ];
    expect(spentInMonth(amounts, 'food', 2026, 9)).toBe(44200);
  });

  it('counts every subsection, not only the one on screen', () => {
    const amounts = [
      spent('2026-10-02', 5000, { accountId: 'cash' }),
      spent('2026-10-03', 7000, { accountId: 'online' }),
    ];
    expect(spentInMonth(amounts, 'food', 2026, 9)).toBe(12000);
  });

  it('leaves out incomes and other categories', () => {
    const amounts = [
      spent('2026-10-02', 5000),
      spent('2026-10-02', 9000, { direction: 'income' }),
      spent('2026-10-02', 3000, { categoryId: 'cafe' }),
    ];
    expect(spentInMonth(amounts, 'food', 2026, 9)).toBe(5000);
  });

  it('excludes transfers, by id or by category', () => {
    const pair = transferPair(
      { fromAccountId: 'cash', toAccountId: 'online', value: 50000, date: '2026-10-04' },
      { transferId: 't1', outId: 'o', inId: 'i' },
      '2026-10-04T00:00:00.000Z',
    );
    if (!pair) throw new Error('no pair');
    const strayHalf = spent('2026-10-04', 20000, { categoryId: 'transfer_out' });
    const amounts = [...pair, strayHalf, spent('2026-10-04', 1000, { categoryId: 'transfer_out' })];
    expect(spentInMonth(amounts, 'transfer_out', 2026, 9)).toBe(0);
    // A transfer-id'd half in a plain category is still not spending.
    const tagged = spent('2026-10-04', 8000, { transferId: 'x' });
    expect(spentInMonth([tagged, spent('2026-10-04', 100)], 'food', 2026, 9)).toBe(100);
  });
});

describe('rollover', () => {
  it('is off by default: an underspent month does not raise the next one', () => {
    expect(BUDGET_ROLLOVER).toBe(false);
    const amounts = [spent('2026-09-10', 1000), spent('2026-10-02', 70000)];
    const october = budgetStatus(FOOD, amounts, 2026, 9, TODAY);
    expect(budgetLimit(FOOD)).toBe(80000);
    expect(october.limit).toBe(80000);
    expect(october.left).toBe(10000);
  });

  it('nor does an overspent month lower it', () => {
    const amounts = [spent('2026-09-10', 120000)];
    expect(budgetStatus(FOOD, amounts, 2026, 9, TODAY).limit).toBe(80000);
  });
});

describe('a budget read against its month', () => {
  it('says how much is left, and over only once past 100%', () => {
    const at = budgetStatus(FOOD, [spent('2026-10-02', 80000)], 2026, 9, TODAY);
    expect(at.over).toBe(false);
    expect(at.fraction).toBe(1);
    expect(at.left).toBe(0);
    const past = budgetStatus(FOOD, [spent('2026-10-02', 88000)], 2026, 9, TODAY);
    expect(past.over).toBe(true);
    expect(past.overBy).toBe(8000);
    expect(budgetNote(past, 'AMD', 0)).toBe('8,000 AMD over budget');
    expect(tileBudgetLine(past, 'AMD', 0)).toBe('8,000 AMD over budget');
  });

  it('is ahead of the month in words when spending runs well past the calendar', () => {
    // Day 5 of 31: 16% gone. 65% spent is more than a fifth ahead.
    const ahead = budgetStatus(
      { categoryId: 'food', monthly: 15000 },
      [spent('2026-10-02', 9800)],
      2026,
      9,
      TODAY,
    );
    expect(ahead.ahead).toBe(true);
    expect(budgetNote(ahead, 'AMD', 0)).toBe('ahead of the month');
    const calm = budgetStatus(FOOD, [spent('2026-10-02', 14200)], 2026, 9, TODAY);
    expect(calm.ahead).toBe(false);
    expect(budgetNote(calm, 'AMD', 0)).toBe('65,800 AMD left');
    expect(tileBudgetLine(calm, 'AMD', 0)).toBe('17% of 80,000 AMD');
  });

  it('measures the month gone, today included', () => {
    expect(monthElapsed(2026, 9, '2026-10-05')).toBeCloseTo(5 / 31);
    expect(monthElapsed(2026, 9, '2026-11-02')).toBe(1);
    expect(monthElapsed(2026, 9, '2026-09-30')).toBe(0);
    expect(describeBudgetMonth(2026, 9, '2026-10-05')).toBe('October · day 5 of 31.');
    expect(describeBudgetMonth(2026, 9, '2026-10-05', 'ru')).toBe('Октябрь · день 5 из 31.');
  });
});

describe('archived categories', () => {
  const categories = [category('food'), category('gifts', { archivedAt: '2026-10-01' })];
  const budgets: Budget[] = [FOOD, { categoryId: 'gifts', monthly: 10000, alerts: true }];

  it('keep their budget in the store', () => {
    expect(sanitizeBudgets(budgets, new Set(['food', 'gifts']))).toHaveLength(2);
  });

  it('are not shown', () => {
    expect(visibleBudgets(budgets, categories).map((b) => b.categoryId)).toEqual(['food']);
    const statuses = budgetStatuses({
      budgets,
      categories,
      amounts: [spent('2026-10-02', 50000, { categoryId: 'gifts' })],
      year: 2026,
      month: 9,
      today: TODAY,
    });
    expect(statuses.map((s) => s.categoryId)).toEqual(['food']);
  });

  it('are not alerted', () => {
    const due = budgetAlertsDue({
      budgets,
      categories,
      amounts: [spent('2026-10-02', 50000, { categoryId: 'gifts' })],
      year: 2026,
      month: 9,
      fired: [],
    });
    expect(due.fire).toEqual([]);
    expect(due.record).toEqual([]);
  });

  it('nor are income or transfer categories', () => {
    const odd = [category('salary', { direction: 'income' }), category('transfer_out')];
    expect(
      visibleBudgets(
        [
          { categoryId: 'salary', monthly: 1 },
          { categoryId: 'transfer_out', monthly: 1 },
        ],
        odd,
      ),
    ).toEqual([]);
  });
});

describe('the alerts', () => {
  const categories = [category('food')];
  const watched: Budget = { ...FOOD, alerts: true };
  const run = (amounts: Amount[], fired: string[], budgets: Budget[] = [watched]) =>
    budgetAlertsDue({ budgets, categories, amounts, year: 2026, month: 9, fired });

  it('are off unless the budget opted in', () => {
    expect(run([spent('2026-10-02', 90000)], [], [FOOD]).fire).toEqual([]);
  });

  it('fire once at 80%, then once at 100%, each once a month', () => {
    const first = run([spent('2026-10-02', 64000)], []);
    expect(first.fire.map((a) => a.threshold)).toEqual([80]);
    expect(first.record).toEqual([alertKey('food', 2026, 9, 80)]);

    // The same spending again — a double launch, a re-render — says nothing.
    const again = run([spent('2026-10-02', 64000)], first.record);
    expect(again.fire).toEqual([]);
    expect(again.record).toEqual([]);

    const crossed = run([spent('2026-10-02', 64000), spent('2026-10-03', 16000)], first.record);
    expect(crossed.fire.map((a) => a.threshold)).toEqual([100]);
    const after = [...first.record, ...crossed.record];
    expect(run([spent('2026-10-02', 99000)], after).fire).toEqual([]);
  });

  it('jumping straight past both says only the 100%, and remembers both', () => {
    const due = run([spent('2026-10-02', 120000)], []);
    expect(due.fire).toEqual([{ categoryId: 'food', threshold: 100, spent: 120000, limit: 80000 }]);
    expect(due.record).toEqual([alertKey('food', 2026, 9, 80), alertKey('food', 2026, 9, 100)]);
  });

  it('say nothing below 80%', () => {
    expect(run([spent('2026-10-02', 63999)], []).fire).toEqual([]);
  });

  it('start again next month, and old keys are pruned', () => {
    const fired = [alertKey('food', 2026, 8, 80), alertKey('food', 2026, 9, 80)];
    expect(pruneFired(fired, 2026, 9)).toEqual([alertKey('food', 2026, 9, 80)]);
  });

  it('read in words', () => {
    const [alert] = run([spent('2026-10-02', 120000)], []).fire;
    expect(describeBudgetAlert(alert, 'Food', 'AMD', 0)).toEqual({
      title: 'Food: the budget is spent',
      body: '120,000 AMD of 80,000 AMD this month.',
    });
  });
});

describe('the scale', () => {
  it('compares integers in the log’s own units — a USD log in cents', () => {
    const budget: Budget = { categoryId: 'food', monthly: 20000 }; // 200.00
    const status = budgetStatus(budget, [spent('2026-10-02', 1250)], 2026, 9, '2026-10-30');
    expect(status.left).toBe(18750);
    expect(budgetNote(status, 'USD', 2)).toBe('187.50 USD left');
  });

  it('steps by 5,000 stored units: 5,000 AMD, or 50.00 in a log in cents', () => {
    expect(BUDGET_STEP).toBe(5000);
    expect(stepBudget(80000, 1)).toBe(85000);
    expect(stepBudget(80000, -1)).toBe(75000);
    expect(stepBudget(3000, -1)).toBe(0);
  });
});

describe('the store’s validator', () => {
  it('keeps one budget per known category, positive and whole', () => {
    const clean = sanitizeBudgets(
      [
        { categoryId: 'food', monthly: 80000.4, alerts: true },
        { categoryId: 'food', monthly: 1 },
        { categoryId: 'gone', monthly: 1 },
        { categoryId: 'cafe', monthly: 0 },
        { categoryId: 'cafe', monthly: 'x' },
        { categoryId: 'fun', monthly: 5, alerts: 'yes' },
        null,
      ],
      new Set(['food', 'cafe', 'fun']),
    );
    expect(clean).toEqual([
      { categoryId: 'food', monthly: 80000, alerts: true },
      { categoryId: 'fun', monthly: 5 },
    ]);
    expect(sanitizeBudgets('junk', new Set())).toEqual([]);
  });

  it('keeps fired keys only while they are strings', () => {
    expect(sanitizeFired(['a', 'a', 3, '', null])).toEqual(['a']);
    expect(sanitizeFired(undefined)).toEqual([]);
  });
});
