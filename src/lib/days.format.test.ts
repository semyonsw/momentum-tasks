import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formatChartDate, formatShortDate } from './days';

describe('dates on the phone’s own calendar', () => {
  /*
   * Yerevan is UTC+4 — the zone the `formatShortDate` comment names: a day
   * ticked at 02:00 local on the 17th is the 16th in UTC and must still read
   * "17 Aug".
   */
  let savedTz: string | undefined;
  beforeAll(() => {
    savedTz = process.env.TZ;
    process.env.TZ = 'Asia/Yerevan';
  });
  afterAll(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it('dates an early-morning instant to the local day, not UTC’s', () => {
    expect(formatShortDate('2026-08-16T22:00:00.000Z')).toBe('17 Aug');
  });

  it('declines the Russian month', () => {
    expect(formatShortDate('2026-09-12T10:00:00.000Z', 'ru')).toBe('12 сентября');
  });

  it('uppercases the chart axis form', () => {
    expect(formatChartDate('2026-08-08T10:00:00.000Z')).toBe('8 AUG');
    expect(formatChartDate('2026-09-12T10:00:00.000Z', 'ru')).toBe('12 СЕНТЯБРЯ');
  });
});
