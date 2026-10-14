import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dayKey,
  daysBetween,
  formatLongDay,
  formatMonth,
  formatShortDay,
  monthNames,
  pad,
  parseDay,
  shiftDay,
  weekEnd,
  weekStart,
  weekdayIndex,
  weekdayInitials,
  weekdayLabels,
  weekdayNames,
} from './days';

/**
 * The day arithmetic every calendar in the app stands on — training, tasks and
 * money all key their records by `dayKey`, so a key that is off by one is a
 * workout, a ticked task or a payment filed under the wrong day.
 *
 * Run in a zone WITH daylight saving on purpose (New York: spring forward on
 * 2026-03-08, fall back on 2026-11-01). In UTC every day is 24 hours long and
 * the bug `days.ts` exists to prevent — adding 86,400,000 ms — cannot show.
 */
let savedTz: string | undefined;
beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe('dayKey', () => {
  it('names the LOCAL day, not the UTC one', () => {
    // 23:40 in New York on the 12th is already the 13th in UTC.
    expect(dayKey('2026-09-13T03:40:00.000Z')).toBe('2026-09-12');
    expect(dayKey(new Date(2026, 8, 12, 23, 59, 59))).toBe('2026-09-12');
    expect(dayKey(new Date(2026, 8, 13, 0, 0, 0))).toBe('2026-09-13');
  });

  it('zero-pads month and day', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('is empty for an unparseable date rather than "NaN-NaN-NaN"', () => {
    expect(dayKey('not a date')).toBe('');
    expect(dayKey(new Date(NaN))).toBe('');
    expect(dayKey('')).toBe('');
  });

  it('sorts lexicographically in date order', () => {
    const keys = ['2026-10-01', '2025-12-31', '2026-02-09', '2026-02-10'];
    expect([...keys].sort()).toEqual(['2025-12-31', '2026-02-09', '2026-02-10', '2026-10-01']);
  });
});

describe('pad', () => {
  it('pads to two digits and leaves wider numbers alone', () => {
    expect(pad(0)).toBe('00');
    expect(pad(9)).toBe('09');
    expect(pad(10)).toBe('10');
    expect(pad(123)).toBe('123');
  });
});

describe('parseDay', () => {
  it('returns local midnight', () => {
    const date = parseDay('2026-09-12')!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(12);
    expect(date.getHours()).toBe(0);
  });

  it('round-trips with dayKey', () => {
    for (const key of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31', '2026-03-08']) {
      expect(dayKey(parseDay(key)!)).toBe(key);
    }
  });

  it('rejects a day that does not exist instead of rolling it over', () => {
    expect(parseDay('2026-02-29')).toBeNull();
    expect(parseDay('2026-02-31')).toBeNull();
    expect(parseDay('2026-04-31')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(parseDay('2026-00-10')).toBeNull();
    expect(parseDay('2026-01-00')).toBeNull();
  });

  it('accepts a leap day in a leap year', () => {
    expect(parseDay('2028-02-29')).not.toBeNull();
    expect(parseDay('2000-02-29')).not.toBeNull();
    expect(parseDay('1900-02-29')).toBeNull();
  });

  it('rejects anything not exactly YYYY-MM-DD', () => {
    for (const bad of ['2026-9-12', '2026-09-12T00:00', ' 2026-09-12', '12-09-2026', '', 'today']) {
      expect(parseDay(bad)).toBeNull();
    }
  });
});

describe('shiftDay', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('survives both daylight-saving jumps', () => {
    expect(shiftDay('2026-03-07', 1)).toBe('2026-03-08');
    expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09');
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2026-11-01', 1)).toBe('2026-11-02');
    expect(shiftDay('2026-03-09', -1)).toBe('2026-03-08');
  });

  it('walks a whole year one day at a time without skipping or repeating', () => {
    let key = '2026-01-01';
    const seen = new Set<string>([key]);
    for (let i = 0; i < 365; i += 1) {
      key = shiftDay(key, 1);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(key).toBe('2027-01-01');
  });

  it('is identity for 0 and inverse for -n', () => {
    expect(shiftDay('2026-09-12', 0)).toBe('2026-09-12');
    expect(shiftDay(shiftDay('2026-09-12', 400), -400)).toBe('2026-09-12');
  });

  it('returns an invalid key unchanged', () => {
    expect(shiftDay('garbage', 3)).toBe('garbage');
    expect(shiftDay('2026-02-31', 1)).toBe('2026-02-31');
  });
});

describe('daysBetween', () => {
  it('counts whole days, signed', () => {
    expect(daysBetween('2026-09-12', '2026-09-12')).toBe(0);
    expect(daysBetween('2026-09-12', '2026-09-19')).toBe(7);
    expect(daysBetween('2026-09-19', '2026-09-12')).toBe(-7);
  });

  it('is an integer across a 23-hour and a 25-hour day', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('agrees with shiftDay', () => {
    for (const n of [-40, -1, 1, 59, 200]) {
      expect(daysBetween('2026-03-01', shiftDay('2026-03-01', n))).toBe(n);
    }
  });

  it('is 0 when either side is not a day', () => {
    expect(daysBetween('nope', '2026-09-12')).toBe(0);
    expect(daysBetween('2026-09-12', '')).toBe(0);
  });
});

describe('weeks start on Monday', () => {
  it('indexes Monday as 0 and Sunday as 6', () => {
    expect(weekdayIndex(parseDay('2026-09-14')!)).toBe(0); // Monday
    expect(weekdayIndex(parseDay('2026-09-19')!)).toBe(5); // Saturday
    expect(weekdayIndex(parseDay('2026-09-20')!)).toBe(6); // Sunday
  });

  it('finds the Monday and Sunday of any day in the week', () => {
    for (const day of ['2026-09-14', '2026-09-16', '2026-09-20']) {
      expect(weekStart(day)).toBe('2026-09-14');
      expect(weekEnd(day)).toBe('2026-09-20');
    }
  });

  it('puts a Sunday in the week that started six days earlier, not the next one', () => {
    expect(weekStart('2026-09-13')).toBe('2026-09-07');
  });

  it('spans month, year and DST boundaries', () => {
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
    expect(weekEnd('2026-12-28')).toBe('2027-01-03');
    expect(weekStart('2026-03-08')).toBe('2026-03-02'); // spring-forward Sunday
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // fall-back Sunday
  });

  it('returns an invalid key unchanged', () => {
    expect(weekStart('x')).toBe('x');
  });
});

describe('the tables per language', () => {
  it('has seven weekdays and twelve months in each language', () => {
    for (const lang of ['en', 'ru'] as const) {
      expect(weekdayLabels(lang)).toHaveLength(7);
      expect(weekdayInitials(lang)).toHaveLength(7);
      expect(weekdayNames(lang)).toHaveLength(7);
      expect(monthNames(lang)).toHaveLength(12);
    }
  });

  it('defaults to English and starts on Monday', () => {
    expect(weekdayLabels()[0]).toBe('Mon');
    expect(weekdayNames()[6]).toBe('Sunday');
    expect(weekdayLabels('ru')[0]).toBe('Пн');
    expect(monthNames('ru')[0]).toBe('Январь');
  });
});

describe('formatting days', () => {
  it('formats a short day in both languages', () => {
    expect(formatShortDay('2026-09-12')).toBe('12 September');
    expect(formatShortDay('2026-09-12', 'ru')).toBe('12 сентября');
    expect(formatShortDay('2026-01-01', 'ru')).toBe('1 января');
  });

  it('does not zero-pad the day number', () => {
    expect(formatLongDay('2026-03-05')).toBe('5 March 2026');
  });

  it('prints an unreadable key as-is rather than "NaN undefined"', () => {
    expect(formatLongDay('soon')).toBe('soon');
    expect(formatShortDay('2026-02-30', 'ru')).toBe('2026-02-30');
  });

  it('formats every month', () => {
    expect(formatMonth(2026, 0)).toBe('January 2026');
    expect(formatMonth(2026, 11, 'ru')).toBe('Декабрь 2026');
  });
});
