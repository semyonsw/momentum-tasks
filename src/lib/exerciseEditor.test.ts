import { describe, expect, it } from 'vitest';

import { advancedLabels, advancedRows, WEIGHT_CHOICES } from './exerciseEditor';
import { emptyExerciseDraft, type ExerciseDraft } from './exerciseDraft';
import { translatedKeys } from './i18n';

function draft(patch: Partial<ExerciseDraft>): ExerciseDraft {
  return { ...emptyExerciseDraft('Row'), ...patch };
}

describe('advancedRows', () => {
  it('a weighted rep exercise folds the ladder, MAX and the increment — nudges are on, so no row', () => {
    expect(
      advancedRows(draft({ requiresWeight: true, countUnit: 'reps', ladderOn: false })),
    ).toEqual(['ladder', 'max', 'increment']);
  });

  it('a ladder states that nudges are off', () => {
    expect(
      advancedRows(draft({ requiresWeight: true, countUnit: 'reps', ladderOn: true })),
    ).toEqual(['ladder', 'max', 'increment', 'overload']);
  });

  it('unweighted work has no increment, and says why it has no nudges', () => {
    expect(advancedRows(draft({ requiresWeight: false, countUnit: 'reps' }))).toEqual([
      'ladder',
      'max',
      'overload',
    ]);
  });

  it('time and distance never offer a ladder or MAX', () => {
    for (const countUnit of ['seconds', 'meters', 'rounds'] as const) {
      const rows = advancedRows(draft({ requiresWeight: false, countUnit }));
      expect(rows).not.toContain('ladder');
      expect(rows).not.toContain('max');
    }
  });

  it('is never empty, so the Advanced row always has something to open', () => {
    for (const requiresWeight of [true, false]) {
      for (const countUnit of ['reps', 'seconds', 'meters', 'rounds'] as const) {
        expect(advancedRows(draft({ requiresWeight, countUnit })).length).toBeGreaterThan(0);
      }
    }
  });

  it('names the rows in render order', () => {
    expect(
      advancedLabels(draft({ requiresWeight: true, countUnit: 'reps', ladderOn: true })),
    ).toEqual(['Rep ladder', 'Reps to MAX', 'Increment', 'Overload nudges']);
  });
});

describe('WEIGHT_CHOICES', () => {
  it('offers each weighted load mode once, in the brief’s order', () => {
    expect(WEIGHT_CHOICES.map((c) => c.value)).toEqual([
      'external',
      'added_bodyweight',
      'assisted',
    ]);
  });

  it('every label and example is in Russian', () => {
    for (const choice of WEIGHT_CHOICES) {
      expect(translatedKeys()).toContain(choice.label);
      expect(translatedKeys()).toContain(choice.example);
    }
  });
});
