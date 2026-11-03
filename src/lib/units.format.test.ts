import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  countStep,
  countUnitLabel,
  daysBetween,
  formatChartDate,
  formatClock,
  formatCountdown,
  formatCount,
  formatDuration,
  formatShortDate,
  formatVolumeKg,
  formatWeight,
  kgToLb,
  lbToKg,
  resolveIncrementKg,
  roundToStep,
  unitLabel,
} from './units';

/**
 * The conversions and formatters `units.test.ts` leaves to its callers.
 *
 * Storage is always kilograms and display converts at the edge, so these are the
 * functions that decide whether an imperial lifter's 225 lb comes back as 225 —
 * and whether a 22.5 kg dumbbell reads as one.
 */

describe('kg ⇄ lb', () => {
  it('uses the exact international pound', () => {
    expect(lbToKg(1)).toBe(0.45359237);
    expect(kgToLb(0.45359237)).toBe(1);
  });

  it('round-trips the common plates without drift', () => {
    for (const lb of [2.5, 5, 10, 25, 35, 45, 135, 225, 315, 405]) {
      expect(kgToLb(lbToKg(lb))).toBeCloseTo(lb, 10);
    }
  });

  it('converts 20 kg and 100 kg to the numbers on a gym chart', () => {
    expect(kgToLb(20)).toBeCloseTo(44.092, 3);
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });
});

describe('roundToStep', () => {
  it('rounds to the nearest step, as the doc example says', () => {
    expect(roundToStep(26.4, 2.5)).toBe(27.5);
    expect(roundToStep(26.1, 2.5)).toBe(25);
  });

  it('removes float drift on fractional steps', () => {
    expect(roundToStep(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundToStep(3.75, 1.25)).toBe(3.75);
    expect(roundToStep(101.3, 1.25)).toBe(101.25);
  });

  it('rounds halves up', () => {
    expect(roundToStep(1.25, 2.5)).toBe(2.5);
  });

  it('leaves the value alone for a zero or negative step', () => {
    expect(roundToStep(26.4, 0)).toBe(26.4);
    expect(roundToStep(26.4, -2.5)).toBe(26.4);
  });
});

describe('resolveIncrementKg', () => {
  it('prefers the exercise’s own increment', () => {
    expect(resolveIncrementKg(1.25, 2.5, 'metric')).toBe(1.25);
    expect(resolveIncrementKg(1.25, 2.5, 'imperial')).toBe(1.25);
  });

  it('falls back to the policy in metric', () => {
    expect(resolveIncrementKg(undefined, 2.5, 'metric')).toBe(2.5);
    expect(resolveIncrementKg(0, 2.5, 'metric')).toBe(2.5);
    expect(resolveIncrementKg(-1, 2.5, 'metric')).toBe(2.5);
  });

  it('falls back to a loadable 5 lb in imperial, not 2.5 kg', () => {
    const kg = resolveIncrementKg(undefined, 2.5, 'imperial');
    expect(kgToLb(kg)).toBeCloseTo(5, 10);
  });
});

describe('formatWeight', () => {
  it('is a dash for no weight', () => {
    expect(formatWeight(null, 'metric')).toBe('—');
    expect(formatWeight(null, 'imperial', 'assisted')).toBe('—');
  });

  it('trims .0 but keeps .5', () => {
    expect(formatWeight(80, 'metric')).toBe('80');
    expect(formatWeight(22.5, 'metric')).toBe('22.5');
    expect(formatWeight(22.04, 'metric')).toBe('22');
  });

  it('converts to pounds for display only', () => {
    expect(formatWeight(lbToKg(225), 'imperial')).toBe('225');
    expect(formatWeight(20, 'imperial')).toBe('44.1');
  });

  it('signs the load the way the lifter thinks of it', () => {
    expect(formatWeight(30, 'metric', 'added_bodyweight')).toBe('+30');
    expect(formatWeight(20, 'metric', 'assisted')).toBe('−20');
    expect(formatWeight(0, 'metric', 'added_bodyweight')).toBe('+0');
    expect(formatWeight(12.5, 'metric', 'none')).toBe('12.5');
  });
});

describe('labels', () => {
  it('names the weight unit', () => {
    expect(unitLabel('metric')).toBe('kg');
    expect(unitLabel('imperial')).toBe('lb');
    expect(unitLabel('metric', 'ru')).not.toBe('kg');
  });

  it('names the count unit, singular for a round', () => {
    expect(countUnitLabel('reps')).toBe('reps');
    expect(countUnitLabel('seconds')).toBe('min');
    expect(countUnitLabel('meters')).toBe('m');
    expect(countUnitLabel('rounds')).toBe('round');
  });

  it('has a Russian word for every count unit', () => {
    for (const unit of ['reps', 'seconds', 'meters', 'rounds'] as const) {
      expect(countUnitLabel(unit, 'ru')).not.toBe('');
    }
  });
});

describe('counts and steps', () => {
  it('formats metres as a plain integer', () => {
    expect(formatCount(1500, 'meters')).toBe('1500');
  });

  it('steps time by 15 s, metres by 25, reps by one', () => {
    expect(countStep('seconds')).toBe(15);
    expect(countStep('rounds')).toBe(15);
    expect(countStep('meters')).toBe(25);
    expect(countStep('reps')).toBe(1);
  });
});

describe('formatClock', () => {
  it('reads m:ss with zero-padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(3600)).toBe('60:00');
  });

  it('rounds, because a countdown at 89.6 s honestly reads 1:30', () => {
    expect(formatClock(89.6)).toBe('1:30');
    expect(formatClock(89.4)).toBe('1:29');
  });

  it('never goes negative', () => {
    expect(formatClock(-12)).toBe('0:00');
  });
});

describe('formatCountdown', () => {
  it('reads 0:00 only when the countdown is actually over', () => {
    // The rest pill rounded, so it said 0:00 with 0.4 s — and a final tone — to go.
    expect(formatCountdown(0.4)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('shows the same whole second the count-in beeps for', () => {
    expect(formatCountdown(89.4)).toBe('1:30');
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(90.1)).toBe('1:31');
  });

  it('never goes negative', () => {
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('formatDuration', () => {
  it('reads whole minutes past an hour as minutes', () => {
    expect(formatDuration(3600)).toBe('60 min');
  });

  it('is "no rest" for a negative duration', () => {
    expect(formatDuration(-30)).toBe('no rest');
    expect(formatDuration(0, 'ru')).toBe('без отдыха');
  });
});

describe('daysBetween (instants)', () => {
  it('counts calendar dates, not 24-hour spans', () => {
    // 22.75 raw days, 23 dates apart.
    expect(daysBetween('2026-08-01T18:00:00.000Z', '2026-08-24T12:00:00.000Z')).toBe(23);
  });

  it('is order-independent', () => {
    expect(daysBetween('2026-09-20T00:00:00.000Z', '2026-09-10T23:59:00.000Z')).toBe(10);
    expect(daysBetween('2026-09-10T23:59:00.000Z', '2026-09-20T00:00:00.000Z')).toBe(10);
  });

  it('is 0 on the same UTC date', () => {
    expect(daysBetween('2026-09-10T00:00:00.000Z', '2026-09-10T23:59:59.000Z')).toBe(0);
  });

  it('accepts Date objects', () => {
    expect(daysBetween(new Date('2026-02-28T12:00:00Z'), new Date('2026-03-01T12:00:00Z'))).toBe(1);
  });
});

describe('formatVolumeKg', () => {
  it('groups thousands with a space', () => {
    expect(formatVolumeKg(6240)).toBe('6 240 kg');
    expect(formatVolumeKg(1234567)).toBe('1 234 567 kg');
    expect(formatVolumeKg(100000)).toBe('100 000 kg');
  });

  it('leaves three digits ungrouped', () => {
    expect(formatVolumeKg(0)).toBe('0 kg');
    expect(formatVolumeKg(999)).toBe('999 kg');
  });

  it('rounds and never goes negative', () => {
    expect(formatVolumeKg(999.6)).toBe('1 000 kg');
    expect(formatVolumeKg(-50)).toBe('0 kg');
  });
});

describe('dates on the phone’s own calendar', () => {
  /*
   * Yerevan is UTC+4 — the zone the `formatShortDate` comment names: a workout at
   * 02:00 local on the 17th is the 16th in UTC and must still read "17 Aug".
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

  it('dates an early-morning workout to the local day, not UTC’s', () => {
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

/**
 * Non-finite inputs never reach the screen as "NaN". `Math.max(0, NaN)` is NaN,
 * so the "never negative" clamps used to let it through; every caller passes
 * stored, sanitized numbers, so this guards a latent case.
 */
describe('NaN never reaches the screen', () => {
  it('formatClock(NaN) is a clock, not "NaN:NaN"', () => {
    expect(formatClock(NaN)).toBe('0:00');
  });

  it('formatVolumeKg(NaN) is a number, not "NaN kg"', () => {
    expect(formatVolumeKg(NaN)).toBe('0 kg');
  });

  it('formatDuration(NaN) is no rest, not a NaN clock', () => {
    expect(formatDuration(NaN)).toBe('no rest');
  });
});
