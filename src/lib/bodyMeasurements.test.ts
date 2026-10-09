import { describe, expect, it } from 'vitest';

import {
  cleanCm,
  cmToDisplay,
  describeMeasurementChange,
  displayToCm,
  formatLength,
  lengthUnitLabel,
  MAX_MEASUREMENT_ENTRIES,
  measurementLabel,
  measurementSeries,
  readingDelta,
  recordMeasurement,
  removeMeasurement,
  sanitizeMeasurements,
  stepMeasurement,
  summarizeMeasurement,
} from './bodyMeasurements';

describe('units: canonical cm, shown per unit system', () => {
  it('converts cm to inches and back', () => {
    expect(cmToDisplay(2.54, 'imperial')).toBeCloseTo(1, 10);
    expect(cmToDisplay(82.5, 'metric')).toBe(82.5);
    expect(displayToCm(1, 'imperial')).toBe(2.54);
    expect(displayToCm(82.5, 'metric')).toBe(82.5);
  });

  it('round-trips every tenth of an inch from 4 to 98 inches exactly as typed', () => {
    for (let tenths = 40; tenths <= 980; tenths += 1) {
      const typed = tenths / 10;
      const stored = displayToCm(typed, 'imperial');
      expect(formatLength(stored, 'imperial')).toBe(typed.toFixed(1));
    }
  });

  it('shows one decimal always, rounded in the shown unit', () => {
    expect(formatLength(37, 'metric')).toBe('37.0');
    expect(formatLength(82.46, 'metric')).toBe('82.5');
    expect(formatLength(82.5, 'imperial')).toBe('32.5'); // 32.48 in
    expect(formatLength(100, 'imperial')).toBe('39.4');
  });

  it('labels the unit in both languages', () => {
    expect(lengthUnitLabel('metric', 'en')).toBe('cm');
    expect(lengthUnitLabel('imperial', 'en')).toBe('in');
    expect(lengthUnitLabel('metric', 'ru')).toBe('см');
    expect(lengthUnitLabel('imperial', 'ru')).toBe('дюйм');
  });

  it('steps to the next half unit, snapping an odd typed value', () => {
    expect(stepMeasurement(82.5, 1, 'metric')).toBe(83);
    expect(stepMeasurement(82.3, 1, 'metric')).toBe(82.5);
    expect(stepMeasurement(82.3, -1, 'metric')).toBe(82);
    // 32.5 in → 33.0 in, stored in cm
    const up = stepMeasurement(displayToCm(32.5, 'imperial'), 1, 'imperial');
    expect(formatLength(up, 'imperial')).toBe('33.0');
    expect(up).toBe(83.82);
  });

  it('never steps outside the believable range', () => {
    expect(stepMeasurement(10, -1, 'metric')).toBe(10);
    expect(stepMeasurement(250, 1, 'metric')).toBe(250);
  });
});

describe('the sanitizer', () => {
  it('is absent for nothing, junk and an empty log', () => {
    expect(sanitizeMeasurements(undefined)).toBeUndefined();
    expect(sanitizeMeasurements(null)).toBeUndefined();
    expect(sanitizeMeasurements('waist')).toBeUndefined();
    expect(sanitizeMeasurements([])).toBeUndefined();
    expect(sanitizeMeasurements({})).toBeUndefined();
    expect(sanitizeMeasurements({ waist: [] })).toBeUndefined();
  });

  it('drops unknown sites, bad dates, bad values and out-of-range readings', () => {
    const log = sanitizeMeasurements({
      waist: [
        { day: '2026-10-05', cm: 82.5 },
        { day: '2026-02-31', cm: 82 },
        { day: 'yesterday', cm: 82 },
        { day: '2026-10-01', cm: 'big' },
        { day: '2026-10-02', cm: Number.NaN },
        { day: '2026-10-03', cm: 5 },
        { day: '2026-10-04', cm: 900 },
        null,
        'x',
      ],
      shoeSize: [{ day: '2026-10-05', cm: 27 }],
    });
    expect(log).toEqual({ waist: [{ day: '2026-10-05', cm: 82.5 }] });
  });

  it('sorts newest first, keeps one per day (the first written), and caps', () => {
    const log = sanitizeMeasurements({
      arm: [
        { day: '2026-09-01', cm: 36 },
        { day: '2026-10-01', cm: 37 },
        { day: '2026-09-01', cm: 35 },
      ],
    });
    expect(log?.arm).toEqual([
      { day: '2026-10-01', cm: 37 },
      { day: '2026-09-01', cm: 36 },
    ]);

    const many = Array.from({ length: MAX_MEASUREMENT_ENTRIES + 20 }, (_, i) => {
      const d = new Date(2020, 0, 1 + i);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { day, cm: 80 };
    });
    expect(sanitizeMeasurements({ waist: many })?.waist).toHaveLength(MAX_MEASUREMENT_ENTRIES);
  });

  it('rounds to 0.01 cm', () => {
    expect(cleanCm(82.456)).toBe(82.46);
    expect(sanitizeMeasurements({ neck: [{ day: '2026-10-05', cm: 38.8621 }] })?.neck?.[0].cm).toBe(
      38.86,
    );
  });
});

describe('recording and removing', () => {
  it('a second reading on the same day replaces the first', () => {
    const once = recordMeasurement(undefined, 'waist', '2026-10-05', 83);
    const twice = recordMeasurement(once, 'waist', '2026-10-05', 82.5);
    expect(twice).toEqual({ waist: [{ day: '2026-10-05', cm: 82.5 }] });
  });

  it('an old date goes in its place in the series', () => {
    let log = recordMeasurement(undefined, 'chest', '2026-10-05', 103);
    log = recordMeasurement(log, 'chest', '2026-08-10', 101);
    expect(log?.chest?.map((e) => e.day)).toEqual(['2026-10-05', '2026-08-10']);
  });

  it('an unusable value leaves the log as it was', () => {
    const log = recordMeasurement(undefined, 'chest', '2026-10-05', 103);
    expect(recordMeasurement(log, 'chest', '2026-10-06', Number.NaN)).toBe(log);
    expect(recordMeasurement(log, 'chest', 'not a day', 100)).toBe(log);
  });

  it('removing the last reading makes the log absent again', () => {
    let log = recordMeasurement(undefined, 'calf', '2026-10-05', 38);
    log = recordMeasurement(log, 'neck', '2026-10-05', 39);
    log = removeMeasurement(log, 'calf', '2026-10-05');
    expect(log).toEqual({ neck: [{ day: '2026-10-05', cm: 39 }] });
    expect(removeMeasurement(log, 'neck', '2026-10-05')).toBeUndefined();
  });

  it('removing a day that has no reading changes nothing', () => {
    const log = recordMeasurement(undefined, 'neck', '2026-10-05', 39);
    expect(removeMeasurement(log, 'neck', '2026-10-04')).toEqual(log);
    expect(removeMeasurement(log, 'waist', '2026-10-05')).toBe(log);
  });
});

describe('reading a site', () => {
  const entries = [
    { day: '2026-10-05', cm: 82.5 },
    { day: '2026-09-01', cm: 83.8 },
    { day: '2026-08-10', cm: 84.5 },
  ];

  it('series is oldest first, in the shown unit', () => {
    expect(measurementSeries(entries, 'metric')).toEqual([84.5, 83.8, 82.5]);
    expect(measurementSeries(entries, 'imperial')[0]).toBeCloseTo(84.5 / 2.54, 10);
  });

  it('describes the change since the first reading', () => {
    const summary = summarizeMeasurement(entries);
    expect(summary?.count).toBe(3);
    expect(describeMeasurementChange(summary!, 'metric', 'en')).toBe('−2.0 cm since 10 August');
    expect(describeMeasurementChange(summary!, 'imperial', 'en')).toBe('−0.8 in since 10 August');
    expect(describeMeasurementChange(summary!, 'metric', 'ru')).toBe('−2.0 см с 10 августа');
  });

  it('names the year when the series crosses one', () => {
    const summary = summarizeMeasurement([
      { day: '2026-01-05', cm: 80 },
      { day: '2025-11-01', cm: 80.02 },
    ]);
    expect(describeMeasurementChange(summary!, 'metric', 'en')).toBe(
      '±0.0 cm since 1 November 2025',
    );
  });

  it('a single reading says so; nothing is null', () => {
    expect(describeMeasurementChange(summarizeMeasurement([entries[0]])!, 'metric', 'en')).toBe(
      'One reading',
    );
    expect(summarizeMeasurement(undefined)).toBeNull();
    expect(summarizeMeasurement([])).toBeNull();
  });

  it('each reading states its change from the one before', () => {
    expect(readingDelta(entries, 0, 'metric', 'en')).toBe('−1.3 cm');
    expect(readingDelta(entries, 2, 'metric', 'en')).toBeNull();
  });

  it('names every site in both languages', () => {
    expect(measurementLabel('waist', 'en')).toBe('Waist');
    expect(measurementLabel('waist', 'ru')).toBe('Талия');
    expect(measurementLabel('hips', 'ru')).toBe('Бёдра');
  });
});
