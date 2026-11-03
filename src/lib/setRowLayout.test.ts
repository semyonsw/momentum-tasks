import { describe, expect, it } from 'vitest';

import {
  RIR_QUICK,
  SET_ROW,
  UNIT_FONT_SIZE,
  fitsWell,
  rirChipWidth,
  rirQuickLabel,
  rirQuickSelected,
  stepperStep,
  textWidth,
  valueWellWidth,
} from './setRowLayout';

/**
 * The set row's grid (redesign #1) and the inline editor's steps (#2). The width
 * checks are the acceptance line "nothing is cropped at 360 dp with 102.5 kg and
 * 12 + RIR 2", held against an estimate of Roboto's advances.
 */

describe('the grid', () => {
  it('is 80 | 1fr | 1fr | 48 with gap 6, and the lead is toggle + gap + set well', () => {
    expect(SET_ROW.lead).toBe(SET_ROW.toggle + SET_ROW.gap + SET_ROW.setWell);
    expect(SET_ROW.lead).toBe(80);
    expect(SET_ROW.log).toBe(48);
    expect(SET_ROW.gap).toBe(6);
    expect(SET_ROW.height).toBe(56);
  });

  it('gives each value well about 79 dp at 360 and about 105 at 412', () => {
    expect(Math.round(valueWellWidth(360))).toBe(79);
    expect(Math.round(valueWellWidth(412))).toBe(105);
  });

  it('keeps every touch target at 44 dp or more', () => {
    expect(SET_ROW.logCircle).toBeGreaterThanOrEqual(44);
    expect(SET_ROW.setWell).toBeGreaterThanOrEqual(44);
  });
});

describe('nothing crops at 360 dp', () => {
  // The spec's card padding (12), and the 16 the card has had — both must fit.
  for (const cardPadding of [12, 16]) {
    const well = valueWellWidth(360, true, undefined, cardPadding);

    it(`fits "102.5 kg" in a ${well.toFixed(0)} dp well (card padding ${cardPadding})`, () => {
      expect(fitsWell('102.5', textWidth('kg', UNIT_FONT_SIZE), well)).toBe(true);
    });

    it(`fits "12" + the RIR 2 chip in a ${well.toFixed(0)} dp well (card padding ${cardPadding})`, () => {
      expect(fitsWell('12', rirChipWidth('RIR 2'), well)).toBe(true);
      expect(fitsWell('12', rirChipWidth('RIR 4'), well)).toBe(true);
    });

    it(`fits a warm-up's "102.5 kg" one size down (card padding ${cardPadding})`, () => {
      expect(fitsWell('102.5', textWidth('kg', UNIT_FONT_SIZE), well, true)).toBe(true);
    });
  }

  it('fits a three-digit imperial weight with its unit', () => {
    expect(fitsWell('225', textWidth('lb', UNIT_FONT_SIZE), valueWellWidth(360))).toBe(true);
  });

  it('a count alone takes both columns when the exercise has no weight', () => {
    expect(valueWellWidth(360, false)).toBeGreaterThan(2 * valueWellWidth(360) - 1);
  });

  it('would catch a well that is too narrow (the model is not vacuous)', () => {
    expect(fitsWell('102.5', textWidth('kg', UNIT_FONT_SIZE), 60)).toBe(false);
  });
});

describe('reps left, the quick scale', () => {
  it('offers 0 1 2 3 4+', () => {
    expect(RIR_QUICK.map(rirQuickLabel)).toEqual(['0', '1', '2', '3', '4+']);
  });

  it('lights the chip a whole grade is on, and 4+ for anything from four up', () => {
    expect(rirQuickSelected(0)).toBe(0);
    expect(rirQuickSelected(2)).toBe(2);
    expect(rirQuickSelected(4)).toBe(4);
    expect(rirQuickSelected(5)).toBe(4);
    expect(rirQuickSelected(4.5)).toBe(4);
  });

  it('lights nothing for an ungraded set or an older half-step grade', () => {
    expect(rirQuickSelected(undefined)).toBeNull();
    expect(rirQuickSelected(null)).toBeNull();
    expect(rirQuickSelected(1.5)).toBeNull();
  });
});

describe('the inline steppers', () => {
  const reps = { countUnit: 'reps' as const };

  it('step weight by the exercise increment, else the app default of 2.5 kg', () => {
    expect(stepperStep('weight', { ...reps, incrementKg: 1.25 }, 'metric')).toBe(1.25);
    expect(stepperStep('weight', reps, 'metric')).toBe(2.5);
    expect(stepperStep('weight', reps, 'metric', 5)).toBe(5);
  });

  it('step an imperial weight in pounds: 5 lb by default', () => {
    expect(stepperStep('weight', reps, 'imperial')).toBe(5);
  });

  // Regression: the seed's 2.5 / 5 kg increments stepped ±5.5 / ±11 lb, so 140
  // and 145 were unreachable from 135.
  it('snap a converted kg increment to a pound plate in imperial', () => {
    expect(stepperStep('weight', { ...reps, incrementKg: 2.5 }, 'imperial')).toBe(5);
    expect(stepperStep('weight', { ...reps, incrementKg: 5 }, 'imperial')).toBe(10);
    expect(stepperStep('weight', { ...reps, incrementKg: 1.25 }, 'imperial')).toBe(2.5);
    // Under half a plate: the fine pound, never a step of 0.
    expect(stepperStep('weight', { ...reps, incrementKg: 0.5 }, 'imperial')).toBe(1);
    // Metric is untouched.
    expect(stepperStep('weight', { ...reps, incrementKg: 2.5 }, 'metric')).toBe(2.5);
  });

  it('step a count by its unit: a rep, fifteen seconds, 25 m', () => {
    expect(stepperStep('count', reps, 'metric')).toBe(1);
    expect(stepperStep('count', { countUnit: 'seconds' }, 'metric')).toBe(15);
    expect(stepperStep('count', { countUnit: 'meters' }, 'metric')).toBe(25);
  });
});
