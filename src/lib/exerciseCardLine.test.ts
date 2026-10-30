import { describe, expect, it } from 'vitest';

import type { DraftSet } from './draft';
import { countOfSets, exerciseSubline, warmupPercents } from './exerciseCardLine';
import type { Exercise } from '../types/models';

const bench = {
  name: 'Bench press',
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
} as Exercise;

const row = (weightKg: number | null, isWarmup = false) =>
  ({ weightKg, count: 8, isWarmup, isCompleted: false }) as DraftSet;

describe('exerciseSubline (redesign #3)', () => {
  it('reads "4 sets · target 80 kg × 8" off the first working row', () => {
    const entry = {
      targetSets: 4,
      targetRepsMax: 8,
      exercise: bench,
      sets: [row(32.5, true), row(80), row(80), row(80), row(80)],
    };
    expect(exerciseSubline(entry, 'metric')).toBe('4 sets · target 80 kg × 8');
  });

  it('keeps a rep range', () => {
    const entry = {
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 10,
      exercise: bench,
      sets: [row(60), row(60), row(60)],
    };
    expect(exerciseSubline(entry, 'metric')).toBe('3 sets · target 60 kg × 8–10');
  });

  it('says reps without a weight on unweighted work', () => {
    const pullUp = { ...bench, requiresWeight: false } as Exercise;
    const entry = { targetSets: 3, targetRepsMax: 6, exercise: pullUp, sets: [row(null)] };
    expect(exerciseSubline(entry, 'metric')).toBe('1 set · target 6 reps');
  });

  it('states a weighted dip as added load', () => {
    const dip = { ...bench, loadMode: 'added_bodyweight' } as Exercise;
    const entry = { targetSets: 2, targetRepsMax: 5, exercise: dip, sets: [row(20), row(20)] };
    expect(exerciseSubline(entry, 'metric')).toBe('2 sets · target +20 kg × 5');
  });

  it('keeps a ladder whole as the target', () => {
    const entry = {
      targetSets: 3,
      exercise: bench,
      ladder: { max: 16, earned: 0 },
      sets: [row(null), row(null), row(null)],
    };
    expect(exerciseSubline(entry, 'metric')).toBe('3 sets · target 16 + 10 + 6');
  });

  it('is translated', () => {
    const entry = { targetSets: 4, targetRepsMax: 8, exercise: bench, sets: [row(80), row(80)] };
    expect(exerciseSubline(entry, 'metric', 'ru')).toContain('2 подхода');
  });
});

describe('countOfSets', () => {
  it('counts rounds as rounds', () => {
    expect(countOfSets(1, true, 'en')).toBe('1 round');
    expect(countOfSets(4, false, 'en')).toBe('4 sets');
  });
});

describe('warmupPercents', () => {
  it('rounds snapped plates back onto the scheme', () => {
    expect(warmupPercents([{ weightKg: 32.5 }, { weightKg: 47.5 }, { weightKg: 62.5 }], 80)).toBe(
      '40 · 60 · 80',
    );
  });

  it('says nothing without rows or a working weight', () => {
    expect(warmupPercents([], 80)).toBeNull();
    expect(warmupPercents([{ weightKg: 20 }], null)).toBeNull();
  });
});
