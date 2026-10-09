import { describe, expect, it } from 'vitest';

import { transferPair, type Amount } from './money';
import {
  compactMoney,
  describeSpendDay,
  isSpending,
  moneyMonth,
  spendLevel,
  type SpendMonth,
} from './moneyCalendar';

/**
 * The money calendar (M4). The rules worth pinning are the three exclusions —
 * transfers, incomes, whole-month amounts on a day — and the scale, which must
 * be a statement a person can check against the numbers in the cells.
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
    createdAt: `2026-09-01T00:00:0${seq % 10}.000Z`,
    ...over,
  };
}

function forMonth(year: number, month: number, value: number, over: Partial<Amount> = {}): Amount {
  return spent('2026-01-01', value, { ...over, when: { kind: 'month', year, month } });
}

const TODAY = '2026-09-20';
const on = (cal: SpendMonth, day: number) => {
  const cell = cal.weeks.flat().find((c) => c.day === day);
  if (!cell) throw new Error(`no day ${day}`);
  return cell;
};

describe('transfers', () => {
  it('are not spending, by id or by category', () => {
    const pair = transferPair(
      { fromAccountId: 'cash', toAccountId: 'card', value: 50000, date: '2026-09-05' },
      { transferId: 'tr1', outId: 'o', inId: 'i' },
      '2026-09-05T10:00:00.000Z',
    );
    if (!pair) throw new Error('no pair');
    const [out, into] = pair;
    // An expense half that lost its id still sits in the transfer category.
    const orphan = spent('2026-09-05', 7000, { categoryId: 'transfer_out' });
    expect(isSpending(out)).toBe(false);
    expect(isSpending(into)).toBe(false);
    expect(isSpending(orphan)).toBe(false);

    const cal = moneyMonth([out, into, orphan, spent('2026-09-05', 1200)], 2026, 8, TODAY);
    expect(on(cal, 5)).toMatchObject({ total: 1200, count: 1, level: 4 });
    expect(cal.total).toBe(1200);
  });
});

describe('incomes', () => {
  it('are not on the calendar at all', () => {
    const cal = moneyMonth(
      [spent('2026-09-03', 400), spent('2026-09-03', 300000, { direction: 'income' })],
      2026,
      8,
      TODAY,
    );
    expect(on(cal, 3).total).toBe(400);
    expect(cal.total).toBe(400);
  });
});

describe('whole-month amounts', () => {
  const amounts = [
    forMonth(2026, 8, 150000, { categoryId: 'home' }),
    forMonth(2026, 8, 5900, { categoryId: 'phone' }),
    forMonth(2026, 8, 100000, { categoryId: 'home' }),
    forMonth(2026, 7, 999999, { categoryId: 'home' }), // August: another month
    spent('2026-09-01', 2000),
  ];
  const cal = moneyMonth(amounts, 2026, 8, TODAY);

  it('sit on no day, so they neither fill a square nor move the scale', () => {
    expect(on(cal, 1)).toMatchObject({ total: 2000, level: 4 });
    expect(cal.peak).toBe(2000);
    expect(cal.daysTotal).toBe(2000);
  });

  it('are summed apart, by category, largest first, and count in the month', () => {
    expect(cal.wholeTotal).toBe(255900);
    expect(cal.whole).toEqual([
      { categoryId: 'home', total: 250000, count: 2 },
      { categoryId: 'phone', total: 5900, count: 1 },
    ]);
    expect(cal.total).toBe(257900);
  });
});

describe('the account filter', () => {
  const amounts = [
    spent('2026-09-10', 1000, { accountId: 'cash' }),
    spent('2026-09-10', 4000, { accountId: 'card' }),
    forMonth(2026, 8, 9000, { accountId: 'card' }),
  ];

  it('keeps one account’s spending, or everyone’s with null', () => {
    expect(on(moneyMonth(amounts, 2026, 8, TODAY, 'cash'), 10).total).toBe(1000);
    expect(on(moneyMonth(amounts, 2026, 8, TODAY, 'card'), 10).total).toBe(4000);
    expect(moneyMonth(amounts, 2026, 8, TODAY, 'cash').wholeTotal).toBe(0);
    expect(moneyMonth(amounts, 2026, 8, TODAY, 'card').wholeTotal).toBe(9000);
    expect(on(moneyMonth(amounts, 2026, 8, TODAY, null), 10)).toMatchObject({
      total: 5000,
      count: 2,
    });
  });

  it('rescales to the account shown, so its own dearest day is the darkest', () => {
    const cash = moneyMonth(
      [...amounts, spent('2026-09-11', 200, { accountId: 'cash' })],
      2026,
      8,
      TODAY,
      'cash',
    );
    expect(cash.peak).toBe(1000);
    expect(on(cash, 10).level).toBe(4);
    expect(on(cash, 11).level).toBe(1);
  });
});

describe('an empty month', () => {
  it('has every day at zero and nothing in the strip', () => {
    const cal = moneyMonth([spent('2026-08-31', 5000), spent('2026-10-01', 5000)], 2026, 8, TODAY);
    const days = cal.weeks.flat().filter((c) => c.day !== null);
    expect(days).toHaveLength(30);
    expect(days.every((c) => c.total === 0 && c.level === 0 && c.count === 0)).toBe(true);
    expect(cal).toMatchObject({ total: 0, daysTotal: 0, wholeTotal: 0, peak: 0, whole: [] });
  });

  it('works on no amounts at all', () => {
    expect(moneyMonth([], 2026, 1, TODAY).total).toBe(0);
  });
});

describe('the grid', () => {
  it('is Monday-first, padded at the start only, with today and the future marked', () => {
    // 1 September 2026 is a Tuesday: one pad.
    const cal = moneyMonth([], 2026, 8, TODAY);
    expect(cal.weeks[0][0].day).toBeNull();
    expect(cal.weeks[0][1]).toMatchObject({ day: 1, date: '2026-09-01' });
    expect(cal.weeks.at(-1)?.at(-1)?.day).toBe(30);
    expect(on(cal, 20)).toMatchObject({ isToday: true, isFuture: false });
    expect(on(cal, 21)).toMatchObject({ isToday: false, isFuture: true });
    expect(cal.label).toBe('September 2026');
  });

  it('gives February its 29th in a leap year', () => {
    expect(
      moneyMonth([], 2024, 1, TODAY)
        .weeks.flat()
        .filter((c) => c.day).length,
    ).toBe(29);
  });

  it('names the category that took the most that day', () => {
    const cal = moneyMonth(
      [
        spent('2026-09-07', 500, { categoryId: 'cafe' }),
        spent('2026-09-07', 900, { categoryId: 'food' }),
        spent('2026-09-07', 600, { categoryId: 'cafe' }),
      ],
      2026,
      8,
      TODAY,
    );
    expect(on(cal, 7)).toMatchObject({ total: 2000, count: 3, topCategoryId: 'cafe' });
  });
});

describe('the four steps', () => {
  it('are quarters of the month’s dearest day', () => {
    expect(spendLevel(0, 1000)).toBe(0);
    expect(spendLevel(1, 1000)).toBe(1);
    expect(spendLevel(250, 1000)).toBe(1);
    expect(spendLevel(251, 1000)).toBe(2);
    expect(spendLevel(500, 1000)).toBe(2);
    expect(spendLevel(501, 1000)).toBe(3);
    expect(spendLevel(750, 1000)).toBe(3);
    expect(spendLevel(751, 1000)).toBe(4);
    expect(spendLevel(1000, 1000)).toBe(4);
    expect(spendLevel(5, 0)).toBe(0);
    expect(spendLevel(Number.NaN, 10)).toBe(0);
  });

  it('put the dearest day at the top and every other day against it', () => {
    const cal = moneyMonth(
      [
        spent('2026-09-01', 152000),
        spent('2026-09-02', 100000),
        spent('2026-09-03', 50000),
        spent('2026-09-04', 3000),
      ],
      2026,
      8,
      TODAY,
    );
    expect([1, 2, 3, 4, 5].map((d) => on(cal, d).level)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('the compact cell figure', () => {
  it('writes 7-digit AMD as thousands or millions', () => {
    expect(compactMoney(152000)).toBe('152k');
    expect(compactMoney(152499)).toBe('152k');
    expect(compactMoney(2400)).toBe('2.4k');
    expect(compactMoney(2000)).toBe('2k');
    expect(compactMoney(1234567)).toBe('1.2M');
    expect(compactMoney(9999999)).toBe('10M');
    expect(compactMoney(25000000)).toBe('25M');
    expect(compactMoney(999999999999)).toBe('1000B');
  });

  it('never writes a unit it has outgrown', () => {
    expect(compactMoney(999)).toBe('999');
    expect(compactMoney(999600)).toBe('1M');
    expect(compactMoney(9960)).toBe('10k');
  });

  it('keeps small amounts whole, and nothing spent is blank', () => {
    expect(compactMoney(900)).toBe('900');
    expect(compactMoney(0)).toBe('');
    expect(compactMoney(-5)).toBe('');
  });

  it('reads the log’s scale', () => {
    expect(compactMoney(1250, 2)).toBe('12.5');
    expect(compactMoney(40, 2)).toBe('0.4');
    expect(compactMoney(4, 2)).toBe('0.04');
    expect(compactMoney(15200000, 2)).toBe('152k');
    expect(compactMoney(45000, 2)).toBe('450');
  });
});

describe('the line under the grid', () => {
  const cal = moneyMonth(
    [
      spent('2026-09-12', 152000, { categoryId: 'food' }),
      spent('2026-09-12', 400, { categoryId: 'cafe' }),
    ],
    2026,
    8,
    TODAY,
  );

  it('gives the exact figure the cell abbreviates', () => {
    expect(describeSpendDay(on(cal, 12), 'AMD', 0, 'en', 'Food')).toBe(
      '12 September · 152,400 AMD · 2 amounts · mostly Food',
    );
    expect(describeSpendDay(on(cal, 12), 'AMD', 0, 'ru', 'Еда')).toBe(
      '12 сентября · 152,400 AMD · суммы: 2 · в основном Еда',
    );
  });

  it('says a quiet day was quiet', () => {
    expect(describeSpendDay(on(cal, 13), 'AMD', 0)).toBe('13 September · nothing spent');
  });

  it('respects the scale', () => {
    const usd = moneyMonth([spent('2026-09-02', 1250)], 2026, 8, TODAY);
    expect(describeSpendDay(on(usd, 2), 'USD', 2)).toBe('2 September · 12.50 USD · 1 amount');
  });
});
