import { describe, expect, it } from 'vitest';

import { t, translatedKeys } from './i18n';
import {
  SET_KINDS,
  SET_TYPE_LEGEND,
  kindChipLabel,
  kindDescription,
  kindRowName,
  setSheetLabel,
  setSheetTitle,
  setWellFace,
} from './setType';

/**
 * Group A of the 2.9 redesign: the set row, the inline editor and the set-type
 * sheet. Every new string is in Russian, and the picker words are the brief's.
 */

describe('2.9 redesign A strings', () => {
  it('every new string is in Russian', () => {
    const keys = [
      'setType:Normal',
      'Normal set',
      'As many as possible',
      'Counts toward your volume',
      'Light set, not counted',
      'Lower the weight, keep going',
      'Until no clean rep is left',
      'Max reps at this weight',
      SET_TYPE_LEGEND,
      'Tap a set number to change it.',
      'Got it',
      'Set {n} · Set type & reps left',
      'Reps left (RIR)',
      'Log set',
      'Mark set {n} as warm-up',
      'Reorder this set',
      'Not said',
    ];
    for (const key of keys) expect(translatedKeys()).toContain(key);
  });

  it('says "Normal" for a set type in a word that is not the debrief answer', () => {
    expect(kindChipLabel('working', 'en')).toBe('Normal');
    expect(kindChipLabel('working', 'ru')).not.toBe(t('Normal', 'ru'));
  });
});

describe('the picker words (redesign #2 and the sheet)', () => {
  it('chips read Normal, Warm-up, Drop set, To failure, As many as possible', () => {
    expect(SET_KINDS.map((k) => kindChipLabel(k, 'en'))).toEqual([
      'Normal',
      'Warm-up',
      'Drop set',
      'To failure',
      'As many as possible',
    ]);
  });

  it('sheet rows read Normal set first, then the chip words, each with its line of why', () => {
    expect(SET_KINDS.map((k) => kindRowName(k, 'en'))).toEqual([
      'Normal set',
      'Warm-up',
      'Drop set',
      'To failure',
      'As many as possible',
    ]);
    expect(SET_KINDS.map((k) => kindDescription(k, 'en'))).toEqual([
      'Counts toward your volume',
      'Light set, not counted',
      'Lower the weight, keep going',
      'Until no clean rep is left',
      'Max reps at this weight',
    ]);
  });

  it('the set well shows the type letter instead of the number', () => {
    expect(setWellFace('working', 3)).toBe('3');
    expect(setWellFace('warmup', null)).toBe('W');
    expect(setWellFace('drop', 2)).toBe('D');
    expect(setWellFace('failure', 3)).toBe('F');
    expect(setWellFace('amrap', 4)).toBe('A');
  });

  it('the sheet title names the set by its working number, a warm-up by its letter', () => {
    expect(setSheetLabel('failure', 3)).toBe('3');
    expect(setSheetLabel('warmup', null)).toBe('W');
    expect(setSheetTitle('working', 2, 'en')).toBe('Set 2 · Set type & reps left');
    expect(setSheetTitle('warmup', null, 'en')).toBe('Set W · Set type & reps left');
  });
});
