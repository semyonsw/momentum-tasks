import { describe, expect, it } from 'vitest';

import {
  RIR_LIMIT,
  atLimit,
  cleanRir,
  describeRir,
  effortApplies,
  effortLine,
  formatRir,
  rirChipLabel,
  rirChoices,
  rpeLabel,
  rpeOf,
  withRir,
} from './effort';

describe('cleanRir — the one validator', () => {
  it('keeps every value on the scale', () => {
    for (const value of rirChoices()) expect(cleanRir(value)).toBe(value);
  });

  it('drops what is off the scale rather than clamping it', () => {
    expect(cleanRir(37)).toBeUndefined();
    expect(cleanRir(5.5)).toBeUndefined();
    expect(cleanRir(-1)).toBeUndefined();
    expect(cleanRir(-0.5)).toBeUndefined();
  });

  it('drops what is not a number at all', () => {
    expect(cleanRir(Number.NaN)).toBeUndefined();
    expect(cleanRir(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(cleanRir('2')).toBeUndefined();
    expect(cleanRir(null)).toBeUndefined();
    expect(cleanRir(undefined)).toBeUndefined();
    expect(cleanRir({ rir: 2 })).toBeUndefined();
  });

  it('snaps an in-range value to the nearest half step', () => {
    expect(cleanRir(1.3)).toBe(1.5);
    expect(cleanRir(1.2)).toBe(1);
    expect(cleanRir(4.9)).toBe(5);
  });
});

describe('the scale', () => {
  it('is eleven choices, 0 to 5 in halves', () => {
    expect(rirChoices()).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });

  it('reads RPE as 10 − RIR', () => {
    expect(rpeOf(2)).toBe(8);
    expect(rpeOf(0)).toBe(10);
    expect(rpeOf(0.5)).toBe(9.5);
    expect(rpeLabel(1.5)).toBe('@8.5');
    expect(rpeLabel(0)).toBe('@10');
  });

  it('never prints a trailing .0', () => {
    expect(formatRir(2)).toBe('2');
    expect(formatRir(2.5)).toBe('2.5');
    expect(rirChipLabel(0)).toBe('RIR 0');
    expect(rirChipLabel(1.5)).toBe('RIR 1.5');
  });

  it('says both readings in both languages', () => {
    expect(describeRir(2, 'en')).toBe('2 in reserve · RPE 8');
    expect(describeRir(2, 'ru')).toContain('RPE 8');
    expect(describeRir(2, 'ru')).not.toBe(describeRir(2, 'en'));
  });
});

describe('where it applies', () => {
  it('is offered on reps and nothing else', () => {
    expect(effortApplies('reps')).toBe(true);
    expect(effortApplies('seconds')).toBe(false);
    expect(effortApplies('meters')).toBe(false);
    expect(effortApplies('rounds')).toBe(false);
  });
});

describe('at the limit', () => {
  it('is RIR ≤ 0.5, i.e. RPE ≥ 9.5', () => {
    expect(RIR_LIMIT).toBe(0.5);
    expect(atLimit({ rir: 0 })).toBe(true);
    expect(atLimit({ rir: 0.5 })).toBe(true);
    expect(atLimit({ rir: 1 })).toBe(false);
  });

  it('is never assumed for a set nobody graded', () => {
    expect(atLimit({})).toBe(false);
  });
});

describe('effortLine — for the assistant', () => {
  it('lists every working set in order, with a dash for the silent ones', () => {
    expect(effortLine([{ rir: 2 }, { rir: 1 }, {}, { rir: 0 }])).toBe('2 1 - 0');
  });

  it('is null when no set says anything', () => {
    expect(effortLine([{}, {}])).toBeNull();
    expect(effortLine([])).toBeNull();
  });
});

describe('withRir', () => {
  it('says, changes and takes back, leaving everything else alone', () => {
    const set: { id: string; count: number; rir?: number } = { id: 'a', count: 5 };
    expect(withRir(set, 2)).toEqual({ id: 'a', count: 5, rir: 2 });
    expect(withRir({ ...set, rir: 2 }, 0.5)).toEqual({ id: 'a', count: 5, rir: 0.5 });
    expect(withRir({ ...set, rir: 2 }, null)).toEqual({ id: 'a', count: 5 });
    expect('rir' in withRir({ ...set, rir: 2 }, null)).toBe(false);
  });

  it('ignores a value off the scale', () => {
    const set = { id: 'a', rir: 1 };
    expect(withRir(set, 37)).toBe(set);
    expect(withRir(set, Number.NaN)).toBe(set);
  });
});
