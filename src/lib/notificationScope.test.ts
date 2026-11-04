import { describe, expect, it } from 'vitest';

import { APP_VARIANTS } from './appVariant';
import { channelsFor, notificationScope, reminderChannelDescription } from './notificationScope';

/**
 * What each app may notify about. The invariant worth a test: every kind of
 * notification has exactly ONE app that sends it, so nothing is lost when the
 * combined app splits and nothing buzzes twice once the backup is imported.
 */

describe('who sends what', () => {
  it('every kind has exactly one sender', () => {
    for (const kind of ['taskReminders', 'workoutReminders', 'budgetAlerts'] as const) {
      const senders = APP_VARIANTS.filter((v) => notificationScope(v)[kind]);
      expect(senders, kind).toHaveLength(1);
    }
  });

  it('is the app whose log it belongs to', () => {
    expect(notificationScope('tasks').taskReminders).toBe(true);
    expect(notificationScope('workout').workoutReminders).toBe(true);
    expect(notificationScope('expenses').budgetAlerts).toBe(true);
  });
});

describe('the channels', () => {
  it('timer channels only in Workout; the reminder channel in all three', () => {
    expect(channelsFor('workout')).toEqual(['go', 'getset', 'reminder']);
    expect(channelsFor('tasks')).toEqual(['reminder']);
    expect(channelsFor('expenses')).toEqual(['reminder']);
  });

  it('the reminder channel says what THIS app sends on it', () => {
    expect(reminderChannelDescription('workout')).toMatch(/workout/);
    expect(reminderChannelDescription('tasks')).toMatch(/task/);
    expect(reminderChannelDescription('expenses')).toMatch(/budget/);
    const all = APP_VARIANTS.map(reminderChannelDescription);
    expect(new Set(all).size).toBe(3);
  });
});
