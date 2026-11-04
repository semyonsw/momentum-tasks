import { describe, expect, it } from 'vitest';

import { translatedKeys } from './i18n';

/** Group B of the 2.9 redesign: the session, the exercise card, the Finish sheet. */
describe('2.9 redesign B strings', () => {
  it('every new string of the session, the card and the Finish sheet is in Russian', () => {
    const keys = [
      '{sets} · target {what}',
      'Editing · tap ⋮⋮ to move a set',
      'Now tap ⋮⋮ where it should go',
      'Set {n} is lifted. Tap to put it back',
      'Move the lifted set here, to place {n}',
      'Move set {n}',
      'Move up',
      'Move down',
      'Change the rest: {what}',
      'Options',
      'Auto-start rest',
      'Rest timer starts when you log a set',
      'Back, workout keeps running',
      'Workout still running — resume it from the Workout tab',
      'Volume',
      'Keep training',
      'Changed from the plan',
      'Save and make {sets} the plan for {exercise}',
      'Save and update {count} exercises in the plan',
      'Next {routine} starts with {shape}.',
      'Other exercises stay as planned.',
    ];
    for (const key of keys) expect(translatedKeys()).toContain(key);
  });
});
