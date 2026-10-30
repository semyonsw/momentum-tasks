import { describe, expect, it } from 'vitest';

import { translatedKeys } from './i18n';

/**
 * The 2.9 redesign's tasks and finance strings (group F: #19, #20, the Finance
 * top bar's `Accounts`). A key the dictionary lacks shows English to a Russian
 * reader, silently — this is the one place that notices.
 */
describe('2.9 redesign: tasks and finance strings', () => {
  it('every new string is in Russian', () => {
    const keys = [
      'Same menu as press-and-hold',
      'An excused day — your streak stays',
      'Skipped on purpose',
      'Tap the circle to tick a task off. ⋯ or hold for more. “On purpose” means an excused day — it doesn’t break your streak.',
      'Tap a category to add an amount. › opens it.',
      'Accounts',
      'Add account',
      'AI coach',
    ];
    for (const key of keys) expect(translatedKeys()).toContain(key);
  });
});
