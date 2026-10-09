import { describe, expect, it } from 'vitest';

import {
  describeGoalProgress,
  describeGoalStatus,
  goalPercent,
  goalProgress,
  monthEndAhead,
  monthsLeft,
  orderGoals,
  perMonthNeeded,
  sanitizeGoals,
  type SavingsGoal,
} from './goals';
import { transferPair, type Amount, type MoneyAccount } from './money';

/**
 * Savings goals (M5): progress is the linked subsection's balance — so a
 * transfer in moves it — a past date is said plainly, an archived subsection
 * pauses the goal, and the monthly figure rounds UP in the log's scale.
 */

function account(id: string, opening = 0, over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name: id, glyph: '•', order: 0, opening, archivedAt: null, ...over };
}

function goal(over: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'laptop',
    name: 'New laptop',
    glyph: '💻',
    target: 650000,
    by: '2027-03-31',
    accountId: 'savings',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

const TODAY = '2026-10-09';

function transferIn(value: number, date = '2026-10-02', id = 't1'): Amount[] {
  const pair = transferPair(
    { fromAccountId: 'cash', toAccountId: 'savings', value, date },
    { transferId: id, outId: `${id}o`, inId: `${id}i` },
    `${date}T10:00:00.000Z`,
  );
  if (!pair) throw new Error('no pair');
  return pair;
}

const accounts = [account('cash', 1000000), account('savings')];

describe('progress from transfers', () => {
  it('is the linked subsection’s balance, fed by transfers in', () => {
    const amounts = [...transferIn(300000), ...transferIn(80000, '2026-10-05', 't2')];
    const progress = goalProgress(goal(), accounts, amounts, TODAY, 0);
    expect(progress.saved).toBe(380000);
    expect(progress.left).toBe(270000);
    expect(goalPercent(progress)).toBe(58);
    expect(describeGoalProgress(goal(), progress, 'AMD', 0)).toBe(
      '380,000 of 650,000 AMD · by 31 March 2027',
    );
  });

  it('moves back when money is taken out of the subsection', () => {
    const out = transferPair(
      { fromAccountId: 'savings', toAccountId: 'cash', value: 50000, date: '2026-10-06' },
      { transferId: 'back', outId: 'bo', inId: 'bi' },
      '2026-10-06T10:00:00.000Z',
    );
    if (!out) throw new Error('no pair');
    const progress = goalProgress(goal(), accounts, [...transferIn(300000), ...out], TODAY, 0);
    expect(progress.saved).toBe(250000);
  });

  it('is reached at the target, and only then reads 100%', () => {
    const almost = goalProgress(goal({ target: 1000 }), accounts, transferIn(999), TODAY, 0);
    expect(goalPercent(almost)).toBe(99);
    const done = goalProgress(goal({ target: 1000 }), accounts, transferIn(1200), TODAY, 0);
    expect(done.state).toBe('reached');
    expect(goalPercent(done)).toBe(100);
    expect(done.perMonth).toBeNull();
    expect(describeGoalStatus(done, 'savings', 'AMD', 0)).toBe('Reached');
  });
});

describe('what a month needs', () => {
  it('counts the months left, a remainder as one', () => {
    expect(monthsLeft(TODAY, '2027-03-31')).toBe(6);
    expect(monthsLeft(TODAY, '2026-10-20')).toBe(1);
    expect(monthsLeft(TODAY, '2026-11-09')).toBe(1);
    expect(monthsLeft(TODAY, '2026-11-10')).toBe(2);
    expect(monthsLeft(TODAY, TODAY)).toBe(1);
  });

  it('spreads what is left over them, rounded UP to a whole unit', () => {
    const amounts = transferIn(380000);
    const progress = goalProgress(goal(), accounts, amounts, TODAY, 0);
    expect(progress.perMonth).toBe(45000);
    expect(describeGoalStatus(progress, 'savings', 'AMD', 0)).toBe(
      '45,000 AMD a month to get there',
    );
    expect(perMonthNeeded(100000, 3, 0)).toBe(33334);
    expect(perMonthNeeded(0, 3, 0)).toBe(0);
  });

  it('rounds up to a whole currency unit in a log kept in cents', () => {
    // 100.00 over 3 months = 33.333… → 34.00, stored 3400.
    expect(perMonthNeeded(10000, 3, 2)).toBe(3400);
  });

  it('says nothing about months without a date', () => {
    const progress = goalProgress(goal({ by: undefined }), accounts, transferIn(1000), TODAY, 0);
    expect(progress.state).toBe('active');
    expect(progress.perMonth).toBeNull();
    expect(describeGoalStatus(progress, 'savings', 'AMD', 0)).toBeNull();
    expect(describeGoalProgress(goal({ by: undefined }), progress, 'AMD', 0)).toBe(
      '1,000 of 650,000 AMD',
    );
  });
});

describe('a past-due goal', () => {
  it('says so plainly, with what is still to go, and asks no monthly figure', () => {
    const progress = goalProgress(
      goal({ target: 200000, by: '2026-09-15' }),
      accounts,
      transferIn(80000),
      TODAY,
      0,
    );
    expect(progress.state).toBe('pastDue');
    expect(progress.perMonth).toBeNull();
    expect(describeGoalStatus(progress, 'savings', 'AMD', 0)).toBe(
      'The date has passed · 120,000 AMD to go',
    );
  });

  it('a goal met after its date is simply reached', () => {
    const progress = goalProgress(
      goal({ target: 50000, by: '2026-09-15' }),
      accounts,
      transferIn(80000),
      TODAY,
      0,
    );
    expect(progress.state).toBe('reached');
  });
});

describe('an archived subsection', () => {
  const archived = [account('cash', 0), account('savings', 0, { archivedAt: '2026-10-05' })];

  it('pauses the goal: kept, frozen at its balance, no monthly figure', () => {
    const progress = goalProgress(goal(), archived, transferIn(100000), TODAY, 0);
    expect(progress.state).toBe('paused');
    expect(progress.saved).toBe(100000);
    expect(progress.perMonth).toBeNull();
    expect(describeGoalStatus(progress, 'Savings', 'AMD', 0)).toBe('Paused · Savings is archived');
  });

  it('sorts paused goals last', () => {
    const rows = [
      { id: 'a', state: 'paused' as const },
      { id: 'b', state: 'active' as const },
      { id: 'c', state: 'pastDue' as const },
    ];
    expect(orderGoals(rows).map((row) => row.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('the editor’s date step and the validator', () => {
  it('steps to month ends', () => {
    expect(monthEndAhead(TODAY, 0)).toBe('2026-10-31');
    expect(monthEndAhead(TODAY, 4)).toBe('2027-02-28');
  });

  it('keeps a named goal with a positive target on a known subsection', () => {
    const clean = sanitizeGoals(
      [
        goal({ target: 650000.4, glyph: '' }),
        goal({ id: 'laptop' }),
        goal({ id: 'x', name: ' ' }),
        goal({ id: 'y', target: 0 }),
        goal({ id: 'z', accountId: 'gone' }),
        { ...goal({ id: 'w' }), by: '2027-02-30' },
        null,
      ],
      new Set(['savings']),
    );
    expect(clean.map((g) => g.id)).toEqual(['laptop', 'w']);
    expect(clean[0].target).toBe(650000);
    expect(clean[0].glyph).toBe('🎯');
    expect('by' in clean[1]).toBe(false);
    expect(sanitizeGoals('junk', new Set())).toEqual([]);
  });
});
