import { describe, expect, it } from 'vitest';

import { translatedKeys } from './i18n';

/**
 * Group D of the 2.9 redesign — training history's Calendar, the past-workout
 * editor and the weigh-in on Body measurements. Every string it added reaches a
 * Russian phone in Russian.
 */
describe('2.9 redesign: D strings', () => {
  it('every new string of the history calendar, past-workout editing and body is in Russian', () => {
    const keys = [
      'Calendar',
      'Open',
      'A dot means you trained that day. Tap it to open the workout.',
      'Shows the workout under the month',
      '{date}, {minutes} min. Move to another day',
      'Tap a set to correct it',
      'Correct the sets of {name}',
      'Edit the name, start and length of {title}',
      'Edit name, start and length',
      'Move to another day',
      'Move here',
      'Log weight',
      'Nothing logged yet',
      'Opens the keypad',
    ];
    for (const key of keys) expect(translatedKeys()).toContain(key);
  });
});
