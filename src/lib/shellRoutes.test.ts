import { describe, expect, it } from 'vitest';

import { allowedStack, routeAllowed, routeSection } from './shellRoutes';

/**
 * The one door every push goes through. What it must guarantee is that no app
 * can show another app's screen — however it was asked for — while the screens
 * every app shares still open everywhere.
 */
describe('routeAllowed', () => {
  it('lets each app open its own section’s screens', () => {
    expect(routeAllowed('workout', { name: 'session' })).toBe(true);
    expect(routeAllowed('tasks', { name: 'taskDetail' })).toBe(true);
    expect(routeAllowed('expenses', { name: 'moneyAmount' })).toBe(true);
  });

  it('refuses another app’s screens', () => {
    expect(routeAllowed('tasks', { name: 'session' })).toBe(false);
    expect(routeAllowed('tasks', { name: 'moneyAmount' })).toBe(false);
    expect(routeAllowed('expenses', { name: 'workoutSettings' })).toBe(false);
    expect(routeAllowed('workout', { name: 'taskSettings' })).toBe(false);
    expect(routeAllowed('workout', { name: 'budgets' })).toBe(false);
  });

  it('decides the chat by the section it carries', () => {
    expect(routeAllowed('tasks', { name: 'aiChat', section: 'Tasks' })).toBe(true);
    expect(routeAllowed('tasks', { name: 'aiChat', section: 'Workout' })).toBe(false);
  });

  it('opens the shared screens in every app', () => {
    for (const name of ['wrapped', 'insights', 'achievements', 'aiSettings', 'aiReview']) {
      expect(routeSection({ name })).toBeNull();
      expect(routeAllowed('expenses', { name })).toBe(true);
    }
  });
});

describe('allowedStack', () => {
  it('drops only the routes this app may not show', () => {
    const stack = [{ name: 'session' }, { name: 'insights' }, { name: 'taskDetail' }];
    expect(allowedStack('tasks', stack)).toEqual([{ name: 'insights' }, { name: 'taskDetail' }]);
  });
});

describe('allowedStack identity', () => {
  it('hands back the same array when nothing was dropped, so a no-op push renders nothing', () => {
    const stack = [{ name: 'session' }];
    expect(allowedStack('workout', stack)).toBe(stack);
  });
});
