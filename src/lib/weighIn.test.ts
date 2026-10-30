import { describe, expect, it } from 'vitest';

import {
  nudgeWeighIn,
  WEIGH_IN_START_KG,
  weighInDisplay,
  weighInFromDisplay,
  weighInStart,
} from './weighIn';
import { BODYWEIGHT_LIMITS } from './bodyweightLog';

/**
 * The weigh-in on Body measurements (redesign #14): where the well starts, and
 * that a nudge or a typed number always lands inside the believable range, in
 * the user's own units.
 */

describe('where the well starts', () => {
  it('prefers the last reading, then the setting, then the seed', () => {
    expect(weighInStart([{ at: '2026-10-01T08:00:00.000Z', kg: 81.4 }], 80)).toBe(81.4);
    expect(weighInStart([], 80)).toBe(80);
    expect(weighInStart([])).toBe(WEIGH_IN_START_KG);
  });
});

describe('units', () => {
  it('shows kilograms as typed and pounds to one decimal', () => {
    expect(weighInDisplay(81.4, 'metric')).toBe(81.4);
    expect(weighInDisplay(81.4, 'imperial')).toBeCloseTo(179.5, 1);
  });

  it('turns a typed number back into kilograms', () => {
    expect(weighInFromDisplay(81.4, 'metric')).toBe(81.4);
    expect(weighInFromDisplay(180, 'imperial')).toBeCloseTo(81.6, 1);
  });

  it('clamps a typo into the believable range', () => {
    expect(weighInFromDisplay(5, 'metric')).toBe(BODYWEIGHT_LIMITS.min);
    expect(weighInFromDisplay(900, 'metric')).toBe(BODYWEIGHT_LIMITS.max);
  });
});

describe('the ± nudge', () => {
  it('moves by half a kilo', () => {
    expect(nudgeWeighIn(81, 1, 'metric')).toBe(81.5);
    expect(nudgeWeighIn(81, -1, 'metric')).toBe(80.5);
  });

  it('moves by a pound in imperial', () => {
    const kg = weighInFromDisplay(180, 'imperial');
    expect(weighInDisplay(nudgeWeighIn(kg, 1, 'imperial'), 'imperial')).toBeCloseTo(181, 0);
  });

  it('stops at the floor', () => {
    expect(nudgeWeighIn(BODYWEIGHT_LIMITS.min, -1, 'metric')).toBe(BODYWEIGHT_LIMITS.min);
  });
});
