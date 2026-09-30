import { describe, expect, it } from 'vitest';

import { addSpare, dropGone, initialBuilds, nextSpare, reconcileBuilds } from './stageBuilds';

/**
 * The pre-built sections, as bookkeeping. The rule worth pinning is the one that
 * keeps a spare invisible as an optimisation: a section you LEFT is never
 * reused, so coming back always finds a build that has never been shown.
 */
describe('reconcileBuilds', () => {
  it('keeps a spare’s id when it goes live, so the early mount is the one shown', () => {
    const stage = addSpare(initialBuilds('Workout'), 'Tasks');
    const tasksId = stage.builds.Tasks?.id;
    const sliding = reconcileBuilds(stage, ['Workout', 'Tasks']);
    expect(sliding.builds.Tasks).toEqual({ id: tasksId, seen: true });
    expect(sliding.builds.Workout).toEqual({ id: 0, seen: true });
  });

  it('drops a section once it is left, and builds a fresh one for the way back', () => {
    const stage = reconcileBuilds(addSpare(initialBuilds('Workout'), 'Tasks'), [
      'Workout',
      'Tasks',
    ]);
    const settled = reconcileBuilds(stage, ['Tasks']);
    expect(settled.builds.Workout).toBeUndefined();
    const back = reconcileBuilds(settled, ['Tasks', 'Workout']);
    expect(back.builds.Workout?.id).not.toBe(0);
  });

  it('keeps a left section mounted until the stage is idle, then drops it', () => {
    const sliding = reconcileBuilds(initialBuilds('Workout'), ['Workout', 'Tasks']);
    const settled = reconcileBuilds(sliding, ['Tasks']);
    expect(settled.gone).toEqual([{ route: 'Workout', id: 0 }]);
    /* Coming straight back gets a new build beside the old one, never the old one. */
    const back = reconcileBuilds(settled, ['Tasks', 'Workout']);
    expect(back.builds.Workout?.id).not.toBe(0);
    expect(back.gone).toEqual([{ route: 'Workout', id: 0 }]);
    const dropped = dropGone(back);
    expect(dropped.gone).toEqual([]);
    expect(dropGone(dropped)).toBe(dropped);
  });

  it('builds a live root that has no spare, and leaves unseen spares alone', () => {
    const stage = addSpare(initialBuilds('Workout'), 'Settings');
    const opened = reconcileBuilds(stage, ['Workout', 'Home']);
    expect(opened.builds.Home?.seen).toBe(true);
    expect(opened.builds.Settings).toEqual({ id: stage.builds.Settings?.id, seen: false });
  });

  it('returns the same object when nothing changed', () => {
    const stage = addSpare(initialBuilds('Tasks'), 'Workout');
    expect(reconcileBuilds(stage, ['Tasks'])).toBe(stage);
  });

  it('never hands two builds the same id', () => {
    let stage = initialBuilds('Workout');
    stage = addSpare(stage, 'Tasks');
    stage = reconcileBuilds(stage, ['Workout', 'Home']);
    stage = addSpare(stage, 'Expenses');
    const ids = Object.values(stage.builds).map((build) => build?.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('nextSpare', () => {
  it('builds the nearest section first', () => {
    const stage = initialBuilds('Expenses');
    expect(['Tasks', 'Settings']).toContain(nextSpare(stage, 'Expenses'));
    const withBoth = addSpare(addSpare(stage, 'Tasks'), 'Settings');
    expect(nextSpare(withBoth, 'Expenses')).toBe('Workout');
  });

  it('goes left to right from Home, and stops when all four are built', () => {
    let stage = initialBuilds('Home');
    expect(nextSpare(stage, 'Home')).toBe('Workout');
    for (const section of ['Workout', 'Tasks', 'Expenses', 'Settings'] as const) {
      stage = addSpare(stage, section);
    }
    expect(nextSpare(stage, 'Home')).toBeNull();
  });

  it('does not rebuild a section that is already mounted', () => {
    const stage = addSpare(initialBuilds('Workout'), 'Tasks');
    expect(addSpare(stage, 'Tasks')).toBe(stage);
  });
});
