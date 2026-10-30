import { describe, expect, it } from 'vitest';

import { translatedKeys } from './i18n';

/**
 * Redesign 2.9, group E — routines (#16), the library, exercise history and the
 * exercise editor (#17), and the training sequence (#18). Every string those
 * screens now show, new or reused, has a Russian entry; a missing one would
 * render in English on a Russian phone.
 */
describe('2.9 redesign E strings', () => {
  it('every routine, library, editor and sequence string is in Russian', () => {
    const keys = [
      // #16 — the add-routine sheet
      'Add routine',
      'Empty',
      'Start blank and add exercises yourself',
      'Random…',
      'Pick muscles and length, Momentum fills it in',
      // #17 — library, history, editor
      'Manage',
      'Edit exercise',
      'Weight',
      'Plates or machine',
      'e.g. barbell squat, leg press, cable row',
      'Bodyweight + extra',
      'e.g. pull-up with a belt, weighted dip',
      'Assisted',
      'e.g. band or machine pull-up — less is harder',
      'Shown on the exercise card while you do it',
      'Advanced',
      'Increment',
      'Rep ladder',
      'Reps to MAX',
      'Overload nudges',
      'Off · the ladder owns the reps',
      'Off · no load to add',
      'Danger zone',
      'Delete',
      'Gone, with all its history.',
      'Delete “{title}”?',
      'It is in {count} {routines}, and will be removed from them.',
      'It is not in any routine.',
      'Sets you already logged stay in your history.',
      'Delete it',
      'Keep it',
      // #18 — the sequence
      'next',
      'Make next',
      'Make {name} the next step',
      'Reorder {name}',
      'Step {position}',
      'Opens the routine',
      'Add a step',
      'Add {name} to the sequence',
      'Moving',
      'Drop',
      'Slide to move it · position {at} of {of}',
      'Long press, then slide to reorder',
      'Move {name} up',
      'Move {name} down',
      'Deleted routine',
      '{exercises} exercises · {sets} sets',
      'Cancel',
    ];
    const have = new Set(translatedKeys());
    expect(keys.filter((key) => !have.has(key))).toEqual([]);
  });
});
