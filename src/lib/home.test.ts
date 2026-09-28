import { describe, expect, it } from 'vitest';

import { focusFamily, greetingFor, homeSubline } from './home';

describe('greetingFor', () => {
  it('follows the clock, and wraps past midnight into night', () => {
    expect(greetingFor(7)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(18)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good night');
    expect(greetingFor(3)).toBe('Good night');
  });
});

describe('homeSubline', () => {
  it('says where the tasks and the workout stand', () => {
    expect(
      homeSubline({ tasksDone: 6, tasksTotal: 8, nextWorkout: 'Pull', workoutInProgress: false }),
    ).toEqual([
      { key: '{done} of {total} tasks done', vars: { done: 6, total: 8 } },
      { key: '{name} is up next', vars: { name: 'Pull' } },
    ]);
  });

  it('drops a clause with nothing to say, and never says "0 of 0"', () => {
    expect(
      homeSubline({ tasksDone: 0, tasksTotal: 0, nextWorkout: 'Legs', workoutInProgress: true }),
    ).toEqual([{ key: '{name} is in progress', vars: { name: 'Legs' } }]);
    expect(
      homeSubline({ tasksDone: 0, tasksTotal: 0, nextWorkout: null, workoutInProgress: false }),
    ).toEqual([{ key: 'Train · tick · count' }]);
  });

  it('calls a finished day finished', () => {
    expect(
      homeSubline({ tasksDone: 3, tasksTotal: 3, nextWorkout: null, workoutInProgress: false }),
    ).toEqual([{ key: 'Every task done' }]);
  });
});

describe('focusFamily', () => {
  it('takes the movement family off the front of a focus line', () => {
    expect(focusFamily('Pull · back, biceps')).toBe('Pull');
    expect(focusFamily(null)).toBeNull();
    expect(focusFamily('')).toBeNull();
  });
});
