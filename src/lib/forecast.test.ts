import { describe, expect, it } from 'vitest';

import {
  FORECAST_MIN_DAYS,
  averageDailySpend,
  describeForecast,
  monthEndForecast,
  monthEndOf,
  recurringAmountIds,
} from './forecast';
import { shiftDay } from './days';
import { transferPair, type Amount, type MoneyAccount } from './money';
import type { RecurringPayment } from './recurring';

/**
 * The month-end forecast (M3): the arithmetic, the definition of the average,
 * the word `estimate`, and the cases where there is no forecast at all.
 */

let seq = 0;
function amount(date: string, value: number, over: Partial<Amount> = {}): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense',
    value,
    when: { kind: 'day', date },
    note: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function account(id: string, opening: number, over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name: id, glyph: '•', order: 0, opening, archivedAt: null, ...over };
}

function rent(over: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    id: 'rent',
    name: 'Rent',
    categoryId: 'home',
    accountId: 'cash',
    direction: 'expense',
    value: 50000,
    schedule: { kind: 'monthly', day: 20 },
    startsOn: '2026-10-01',
    note: '',
    handled: {},
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const TODAY = '2026-10-10';

/** 1,000 a day on each of the 28 days before today. */
function steadyMonth(accountId = 'cash'): Amount[] {
  return Array.from({ length: 28 }, (_, i) =>
    amount(shiftDay(TODAY, -(i + 1)), 1000, { accountId }),
  );
}

describe('the average daily spend', () => {
  it('is the mean over the last 28 full days, empty days counted as zero', () => {
    const amounts = [
      amount(shiftDay(TODAY, -1), 14000),
      amount(shiftDay(TODAY, -28), 14000),
      // Outside the window, and today itself, are not in it.
      amount(shiftDay(TODAY, -29), 99999),
      amount(TODAY, 99999),
    ];
    expect(averageDailySpend({ amounts, accountId: 'cash', today: TODAY })).toEqual({
      perDay: 1000,
      days: 28,
    });
  });

  it('leaves out whole-month amounts, incomes, transfers and recurring ones', () => {
    const pair = transferPair(
      { fromAccountId: 'cash', toAccountId: 'online', value: 70000, date: shiftDay(TODAY, -2) },
      { transferId: 't', outId: 'o', inId: 'i' },
      '2026-10-01T00:00:00.000Z',
    );
    if (!pair) throw new Error('no pair');
    const amounts = [
      ...steadyMonth(),
      amount('2026-01-01', 90000, { when: { kind: 'month', year: 2026, month: 9 } }),
      amount(shiftDay(TODAY, -3), 50000, { direction: 'income', categoryId: 'salary' }),
      ...pair,
      amount(shiftDay(TODAY, -5), 50000, { id: 'amt_rec_rent_M2026-10' }),
    ];
    const average = averageDailySpend({
      amounts,
      accountId: 'cash',
      today: TODAY,
      exclude: new Set(['amt_rec_rent_M2026-10']),
    });
    expect(average?.perDay).toBe(1000);
  });

  it('uses the history there is between 14 and 28 days', () => {
    const amounts = [amount(shiftDay(TODAY, -20), 20000)];
    expect(averageDailySpend({ amounts, accountId: 'cash', today: TODAY })).toEqual({
      perDay: 1000,
      days: 20,
    });
  });
});

describe('no data, no forecast', () => {
  const accounts = [account('cash', 100000)];

  it('none under 14 days of history', () => {
    const amounts = [amount(shiftDay(TODAY, -(FORECAST_MIN_DAYS - 1)), 500)];
    expect(
      monthEndForecast({ accounts, amounts, recurring: [], accountId: 'cash', today: TODAY }),
    ).toBeNull();
  });

  it('none with nothing recorded at all', () => {
    expect(
      monthEndForecast({ accounts, amounts: [], recurring: [], accountId: 'cash', today: TODAY }),
    ).toBeNull();
  });

  it('none without an account — missing, or archived', () => {
    const amounts = steadyMonth();
    expect(
      monthEndForecast({ accounts: [], amounts, recurring: [], accountId: null, today: TODAY }),
    ).toBeNull();
    expect(
      monthEndForecast({
        accounts: [account('cash', 0, { archivedAt: '2026-10-01' })],
        amounts,
        recurring: [],
        accountId: 'cash',
        today: TODAY,
      }),
    ).toBeNull();
  });
});

describe('the arithmetic', () => {
  it('balance − planned − average × days left', () => {
    const amounts = steadyMonth();
    const forecast = monthEndForecast({
      accounts: [account('cash', 200000)],
      amounts,
      recurring: [rent()],
      accountId: 'cash',
      today: TODAY,
    });
    // 200,000 − 28,000 spent = 172,000. Rent 50,000 on the 20th. 21 days left at 1,000.
    expect(forecast).toEqual({
      value: 172000 - 50000 - 21000,
      on: '2026-10-31',
      balance: 172000,
      planned: -50000,
      perDay: 1000,
      spendAhead: 21000,
      daysLeft: 21,
    });
  });

  it('an overdue, unanswered payment is still planned; an answered one is not', () => {
    const amounts = steadyMonth();
    const accounts = [account('cash', 200000)];
    const overdue = rent({ schedule: { kind: 'monthly', day: 5 }, startsOn: '2026-09-01' });
    expect(
      monthEndForecast({ accounts, amounts, recurring: [overdue], accountId: 'cash', today: TODAY })
        ?.planned,
    ).toBe(-100000); // 5 Sep and 5 Oct, both unanswered.
    const answered = rent({
      schedule: { kind: 'monthly', day: 5 },
      startsOn: '2026-09-01',
      handled: {
        'M:2026-09': { status: 'paid', date: '2026-09-05' },
        'M:2026-10': { status: 'skipped', date: '2026-10-05' },
      },
    });
    expect(
      monthEndForecast({
        accounts,
        amounts,
        recurring: [answered],
        accountId: 'cash',
        today: TODAY,
      })?.planned,
    ).toBe(0);
  });

  it('a recurring income adds', () => {
    const forecast = monthEndForecast({
      accounts: [account('cash', 0)],
      amounts: steadyMonth(),
      recurring: [rent({ direction: 'income', value: 300000 })],
      accountId: 'cash',
      today: TODAY,
    });
    expect(forecast?.planned).toBe(300000);
  });

  it('does not count a recurring payment twice — in its history and in its plan', () => {
    const paid = amount('2026-09-20', 50000, { id: 'amt_rec_rent_M2026-09' });
    const item = rent({
      handled: { 'M:2026-09': { status: 'paid', date: '2026-09-20', amountId: paid.id } },
    });
    expect(recurringAmountIds([item])).toEqual(new Set([paid.id]));
    const withRent = monthEndForecast({
      accounts: [account('cash', 200000)],
      amounts: [...steadyMonth(), paid],
      recurring: [item],
      accountId: 'cash',
      today: TODAY,
    });
    expect(withRent?.perDay).toBe(1000);
  });

  it('on the last day of the month there is nothing ahead to spend', () => {
    const today = '2026-10-31';
    const amounts = Array.from({ length: 28 }, (_, i) => amount(shiftDay(today, -(i + 1)), 500));
    const forecast = monthEndForecast({
      accounts: [account('cash', 50000)],
      amounts,
      recurring: [],
      accountId: 'cash',
      today,
    });
    expect(forecast?.daysLeft).toBe(0);
    expect(forecast?.value).toBe(forecast?.balance);
    expect(monthEndOf('2028-02-10')).toBe('2028-02-29');
  });
});

describe('per account vs all', () => {
  const accounts = [account('cash', 100000), account('online', 300000)];
  const amounts = [...steadyMonth('cash'), ...steadyMonth('online')];
  const recurring = [rent({ accountId: 'online' })];

  it('one subsection reads only its own balance, plans and spending', () => {
    const cash = monthEndForecast({
      accounts,
      amounts,
      recurring,
      accountId: 'cash',
      today: TODAY,
    });
    expect(cash?.balance).toBe(72000);
    expect(cash?.planned).toBe(0);
    expect(cash?.perDay).toBe(1000);
  });

  it('all together is the sum of the parts', () => {
    const one = (accountId: string) =>
      monthEndForecast({ accounts, amounts, recurring, accountId, today: TODAY });
    const all = monthEndForecast({ accounts, amounts, recurring, accountId: null, today: TODAY });
    expect(all?.balance).toBe((one('cash')?.balance ?? 0) + (one('online')?.balance ?? 0));
    expect(all?.planned).toBe(-50000);
    expect(all?.perDay).toBe(2000);
    expect(all?.value).toBe((one('cash')?.value ?? 0) + (one('online')?.value ?? 0));
  });
});

describe('the line', () => {
  it('is labelled as an estimate, in both languages, in the log’s scale', () => {
    const forecast = monthEndForecast({
      accounts: [account('cash', 200000)],
      amounts: steadyMonth(),
      recurring: [rent()],
      accountId: 'cash',
      today: TODAY,
    });
    if (!forecast) throw new Error('no forecast');
    expect(describeForecast(forecast, 'AMD', 0)).toBe('≈ 101,000 AMD on 31 October · estimate');
    expect(describeForecast(forecast, 'AMD', 0, 'ru')).toBe('≈ 101,000 AMD к 31 октября · оценка');
    expect(describeForecast({ ...forecast, value: 1250 }, 'USD', 2)).toContain('12.50 USD');
  });
});
