import { describe, expect, it } from 'vitest';

import {
  CATCH_UP_DAYS,
  amountWhenFor,
  cleanSchedule,
  countsFor,
  describeSchedule,
  describeTotals,
  dueList,
  dueOccurrences,
  isOccurrence,
  nextOccurrence,
  nextWord,
  occurrenceAmountId,
  occurrencesBetween,
  ordinal,
  periodOf,
  rescheduledStart,
  sanitizeRecurring,
  scheduleOfKind,
  skipLabel,
  unansweredThrough,
  type RecurringPayment,
} from './recurring';
import { shiftDay } from './days';

/**
 * Recurring payments (M2). The rules worth pinning: the 31st lands on a short
 * month's last day; a catch-up lists every missed occurrence, oldest first, and
 * writes nothing; an occurrence is answered once, whatever happens to the
 * schedule after; and what a confirm writes is on the due date, or for its
 * month when the payment is a whole-month one.
 */

function payment(over: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    id: 'rent',
    name: 'Rent',
    categoryId: 'home',
    accountId: 'cash',
    direction: 'expense',
    value: 150000,
    schedule: { kind: 'monthly', day: 5 },
    startsOn: '2026-09-01',
    note: '',
    handled: {},
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

describe('the 31st of the month', () => {
  it('falls on the last day of February, in a leap year and out of one', () => {
    const on31 = { kind: 'monthly', day: 31 } as const;
    expect(occurrencesBetween(on31, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(occurrencesBetween(on31, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('is due on 28 February, once', () => {
    const item = payment({ schedule: { kind: 'monthly', day: 31 }, startsOn: '2026-02-01' });
    expect(dueOccurrences(item, '2026-02-27')).toEqual([]);
    expect(dueOccurrences(item, '2026-02-28').map((d) => d.date)).toEqual(['2026-02-28']);
    expect(isOccurrence(item.schedule, '2026-02-28')).toBe(true);
    expect(isOccurrence(item.schedule, '2026-03-28')).toBe(false);
  });

  it('a yearly 29 February falls on the 28th in other years', () => {
    const leap = { kind: 'yearly', month: 1, day: 29 } as const;
    expect(occurrencesBetween(leap, '2026-01-01', '2028-12-31')).toEqual([
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });
});

describe('weekly and yearly', () => {
  it('weekly falls on its weekday, every seven days', () => {
    // 2026-10-05 is a Monday.
    expect(occurrencesBetween({ kind: 'weekly', weekday: 2 }, '2026-10-05', '2026-10-21')).toEqual([
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
    ]);
  });

  it('a period is the month, the ISO week or the year', () => {
    expect(periodOf({ kind: 'monthly', day: 5 }, '2026-10-05')).toBe('M:2026-10');
    expect(periodOf({ kind: 'weekly', weekday: 6 }, '2026-10-11')).toBe('W:2026-10-05');
    expect(periodOf({ kind: 'yearly', month: 2, day: 3 }, '2027-03-03')).toBe('Y:2027');
  });
});

describe('catch-up after the app was closed for weeks', () => {
  it('lists every missed occurrence as due, oldest first', () => {
    const rent = payment({ startsOn: '2026-07-01' });
    const gym = payment({
      id: 'gym',
      name: 'Gym',
      schedule: { kind: 'weekly', weekday: 0 },
      startsOn: '2026-09-20',
    });
    const due = dueList([rent, gym], '2026-10-06');
    expect(due.map((d) => `${d.item.id} ${d.date}`)).toEqual([
      'rent 2026-07-05',
      'rent 2026-08-05',
      'rent 2026-09-05',
      'gym 2026-09-21',
      'gym 2026-09-28',
      'rent 2026-10-05',
      'gym 2026-10-05',
    ]);
  });

  it('is only a list: nothing is answered by asking', () => {
    const rent = payment({ startsOn: '2026-07-01' });
    dueOccurrences(rent, '2026-10-06');
    expect(rent.handled).toEqual({});
  });

  it('leaves out what was answered, and nothing before the start', () => {
    const rent = payment({
      startsOn: '2026-08-10',
      handled: { 'M:2026-09': { status: 'skipped', date: '2026-09-05' } },
    });
    expect(dueOccurrences(rent, '2026-10-06').map((d) => d.date)).toEqual(['2026-10-05']);
  });

  it('reaches back no further than the cap', () => {
    const rent = payment({ startsOn: '2020-01-01' });
    const due = dueOccurrences(rent, '2026-10-06');
    expect(due[0].date >= shiftDay('2026-10-06', -CATCH_UP_DAYS)).toBe(true);
    expect(due.length).toBeLessThanOrEqual(14);
  });

  it('asks nothing of a payment created after its day this month', () => {
    const rent = payment({ startsOn: '2026-10-09' });
    expect(dueOccurrences(rent, '2026-10-09')).toEqual([]);
    expect(nextOccurrence(rent, '2026-10-09')).toBe('2026-11-05');
  });
});

describe('no duplicates', () => {
  it('names the amount after its occurrence, so it can only be written once', () => {
    expect(occurrenceAmountId('rent', 'M:2026-10')).toBe('amt_rec_rent_M2026-10');
    expect(occurrenceAmountId('rent', 'M:2026-10')).toBe(occurrenceAmountId('rent', 'M:2026-10'));
  });

  it('a double launch asks the same question, not two', () => {
    const rent = payment();
    expect(dueList([rent], '2026-10-05')).toEqual(dueList([rent], '2026-10-05'));
    expect(dueList([rent], '2026-10-05')).toHaveLength(2);
  });
});

describe('editing the schedule', () => {
  it('moving the day inside a month already answered does not ask again', () => {
    const rent = payment({
      handled: {
        'M:2026-09': { status: 'paid', date: '2026-09-05', amountId: 'x' },
        'M:2026-10': { status: 'paid', date: '2026-10-05', amountId: 'y' },
      },
    });
    const moved: RecurringPayment = {
      ...rent,
      schedule: { kind: 'monthly', day: 20 },
      startsOn: rescheduledStart(rent, { kind: 'monthly', day: 20 }),
    };
    expect(dueOccurrences(moved, '2026-10-25')).toEqual([]);
    expect(nextOccurrence(moved, '2026-10-25')).toBe('2026-11-20');
  });

  it('a new kind of schedule starts after the last answer', () => {
    const rent = payment({
      handled: { 'M:2026-10': { status: 'paid', date: '2026-10-05', amountId: 'y' } },
    });
    const weekly = { kind: 'weekly', weekday: 0 } as const;
    expect(rescheduledStart(rent, weekly)).toBe('2026-10-06');
    const moved = { ...rent, schedule: weekly, startsOn: rescheduledStart(rent, weekly) };
    // 5 Oct was a Monday and is already paid for: only the 12th is due.
    expect(dueOccurrences(moved, '2026-10-12').map((d) => d.date)).toEqual(['2026-10-12']);
  });

  it('an unchanged schedule keeps its start', () => {
    const rent = payment({ handled: { 'M:2026-10': { status: 'skipped', date: '2026-10-05' } } });
    expect(rescheduledStart(rent, { kind: 'monthly', day: 5 })).toBe('2026-09-01');
  });
});

describe('what a confirm writes', () => {
  it('a day amount on the due date', () => {
    expect(amountWhenFor(payment(), '2026-10-05')).toEqual({ kind: 'day', date: '2026-10-05' });
  });

  it('or, for a whole-month payment, an amount for the occurrence’s month', () => {
    expect(amountWhenFor(payment({ wholeMonth: true }), '2026-10-05')).toEqual({
      kind: 'month',
      year: 2026,
      month: 9,
    });
    expect(countsFor(payment({ wholeMonth: true }), '2026-10-05')).toBe('counts for October');
    expect(countsFor(payment(), '2026-10-05')).toBeNull();
  });

  it('never a whole-month amount for a weekly payment', () => {
    const weekly = payment({ wholeMonth: true, schedule: { kind: 'weekly', weekday: 0 } });
    expect(amountWhenFor(weekly, '2026-10-05').kind).toBe('day');
  });
});

describe('the forecast’s view', () => {
  it('counts overdue and coming occurrences up to a date, answered ones out', () => {
    const rent = payment({
      startsOn: '2026-08-01',
      handled: { 'M:2026-08': { status: 'paid', date: '2026-08-05' } },
    });
    expect(unansweredThrough(rent, '2026-10-02', '2026-10-31')).toEqual([
      '2026-09-05',
      '2026-10-05',
    ]);
  });
});

describe('words', () => {
  it('describe the schedule', () => {
    expect(describeSchedule({ kind: 'monthly', day: 5 })).toBe('Monthly on the 5th');
    expect(describeSchedule({ kind: 'monthly', day: 22 })).toBe('Monthly on the 22nd');
    expect(describeSchedule({ kind: 'weekly', weekday: 0 })).toBe('Weekly on Monday');
    expect(describeSchedule({ kind: 'yearly', month: 2, day: 3 })).toBe('Yearly on 3 March');
    expect(describeSchedule({ kind: 'monthly', day: 5 }, 'ru')).toBe('Ежемесячно, 5-го');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '31st',
    ]);
  });

  it('skip says the period', () => {
    expect(skipLabel({ kind: 'monthly', day: 1 })).toBe('Skip this month');
    expect(skipLabel({ kind: 'weekly', weekday: 1 })).toBe('Skip this week');
    expect(skipLabel({ kind: 'yearly', month: 1, day: 1 })).toBe('Skip this year');
  });

  it('the next date reads as due, or plainly', () => {
    expect(nextWord('2026-10-05', '2026-10-05')).toBe('Due today');
    expect(nextWord('2026-10-01', '2026-10-05')).toBe('Due 1 October');
    expect(nextWord('2026-11-01', '2026-10-05')).toBe('1 November');
    expect(nextWord('2027-03-03', '2026-10-05')).toBe('3 March 2027');
  });

  it('totals state each period as itself, outgoing only, in the log’s scale', () => {
    const items = [
      payment(),
      payment({ id: 'p', value: 5900 }),
      payment({ id: 'c', value: 64000, schedule: { kind: 'yearly', month: 2, day: 3 } }),
      payment({ id: 's', value: 999999, direction: 'income' }),
    ];
    expect(describeTotals(items, 'AMD', 0)).toBe('155,900 AMD a month · 64,000 AMD a year');
    expect(describeTotals([payment({ value: 1250 })], 'USD', 2)).toBe('12.50 USD a month');
  });
});

describe('the store’s validator', () => {
  const directions = new Map([
    ['home', 'expense' as const],
    ['salary', 'income' as const],
  ]);
  const accounts = new Set(['cash', 'online']);

  it('keeps a well-formed payment and takes the side from the category', () => {
    const [clean] = sanitizeRecurring(
      [payment({ categoryId: 'salary', direction: 'expense' })],
      directions,
      accounts,
      'cash',
    );
    expect(clean.direction).toBe('income');
  });

  it('drops one with no category, no value, a broken schedule or no start', () => {
    const bad = [
      payment({ id: 'a', categoryId: 'gone' }),
      payment({ id: 'b', value: 0 }),
      payment({ id: 'c', schedule: { kind: 'monthly', day: 32 } }),
      payment({ id: 'd', startsOn: '2026-02-31' }),
      { id: 'e' },
      null,
    ];
    expect(sanitizeRecurring(bad, directions, accounts, 'cash')).toEqual([]);
  });

  it('sends an unknown account to the first one, and cleans the answers', () => {
    const [clean] = sanitizeRecurring(
      [
        {
          ...payment({ accountId: 'gone', wholeMonth: true }),
          handled: {
            'M:2026-10': { status: 'paid', date: '2026-10-05', amountId: 'x' },
            junk: { status: 'paid', date: '2026-10-05' },
            'M:2026-11': { status: 'maybe', date: '2026-11-05' },
          },
        },
      ],
      directions,
      accounts,
      'cash',
    );
    expect(clean.accountId).toBe('cash');
    expect(clean.wholeMonth).toBe(true);
    expect(clean.handled).toEqual({
      'M:2026-10': { status: 'paid', date: '2026-10-05', amountId: 'x' },
    });
  });

  it('schedules are whole numbers in range', () => {
    expect(cleanSchedule({ kind: 'weekly', weekday: 7 })).toBeNull();
    expect(cleanSchedule({ kind: 'yearly', month: 11, day: 31 })).toEqual({
      kind: 'yearly',
      month: 11,
      day: 31,
    });
    expect(scheduleOfKind('weekly', '2026-10-07')).toEqual({ kind: 'weekly', weekday: 2 });
    expect(scheduleOfKind('monthly', '2026-10-07')).toEqual({ kind: 'monthly', day: 7 });
  });
});
