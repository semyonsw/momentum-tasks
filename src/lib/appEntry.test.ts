import { describe, expect, it } from 'vitest';

import { mountsFor } from './appEntry';

/**
 * The background work each app starts. The failure this guards is the one that
 * cannot be seen on a screen: an app running another app's timers or alerts
 * against data it only keeps.
 */
describe('mountsFor', () => {
  it('runs the training log’s machinery in Workout only', () => {
    expect(mountsFor('workout')).toMatchObject({
      sessionClock: true,
      history: true,
      healthConnect: true,
    });
    for (const variant of ['tasks', 'expenses'] as const) {
      expect(mountsFor(variant)).toMatchObject({
        sessionClock: false,
        history: false,
        healthConnect: false,
      });
    }
  });

  it('raises budget alerts in Expenses only — never from the money Workout still keeps', () => {
    expect(mountsFor('expenses').budgetAlerts).toBe(true);
    expect(mountsFor('workout').budgetAlerts).toBe(false);
    expect(mountsFor('tasks').budgetAlerts).toBe(false);
  });

  it('keeps the reminder sync in every app; the sync decides which reminders are whose', () => {
    expect(['workout', 'tasks', 'expenses'].every((v) => mountsFor(v as never).reminders)).toBe(
      true,
    );
  });
});
