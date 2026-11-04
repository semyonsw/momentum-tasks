import { describe, expect, it } from 'vitest';

import { addSpare, dropGone, initialBuilds, nextSpare, reconcileBuilds } from './stageBuilds';

/**
 * The pre-built roots, as bookkeeping. The rule worth pinning is the one that
 * keeps a spare invisible as an optimisation: a root you LEFT is never reused,
 * so coming back always finds a build that has never been shown.
 */
describe('reconcileBuilds', () => {
  it('keeps a spare’s id when it goes live, so the early mount is the one shown', () => {
    const stage = addSpare(initialBuilds('Tasks'), 'Settings');
    const settingsId = stage.builds.Settings?.id;
    const sliding = reconcileBuilds(stage, ['Tasks', 'Settings']);
    expect(sliding.builds.Settings).toEqual({ id: settingsId, seen: true });
    expect(sliding.builds.Tasks).toEqual({ id: 0, seen: true });
  });

  it('drops a root once it is left, and builds a fresh one for the way back', () => {
    const stage = reconcileBuilds(addSpare(initialBuilds('Tasks'), 'Settings'), [
      'Tasks',
      'Settings',
    ]);
    const settled = reconcileBuilds(stage, ['Settings']);
    expect(settled.builds.Tasks).toBeUndefined();
    const back = reconcileBuilds(settled, ['Settings', 'Tasks']);
    expect(back.builds.Tasks?.id).not.toBe(0);
  });

  it('keeps a left root mounted until the stage is idle, then drops it', () => {
    const sliding = reconcileBuilds(initialBuilds('Tasks'), ['Tasks', 'Settings']);
    const settled = reconcileBuilds(sliding, ['Settings']);
    expect(settled.gone).toEqual([{ route: 'Tasks', id: 0 }]);
    /* Coming straight back gets a new build beside the old one, never the old one. */
    const back = reconcileBuilds(settled, ['Settings', 'Tasks']);
    expect(back.builds.Tasks?.id).not.toBe(0);
    expect(back.gone).toEqual([{ route: 'Tasks', id: 0 }]);
    const dropped = dropGone(back);
    expect(dropped.gone).toEqual([]);
    expect(dropGone(dropped)).toBe(dropped);
  });

  it('builds a live root that has no spare, and leaves unseen spares alone', () => {
    const stage = addSpare(initialBuilds('Tasks'), 'Settings');
    const settled = reconcileBuilds(stage, ['Tasks']);
    expect(settled.builds.Settings).toEqual({ id: stage.builds.Settings?.id, seen: false });
    const opened = reconcileBuilds(initialBuilds('Settings'), ['Settings', 'Tasks']);
    expect(opened.builds.Tasks?.seen).toBe(true);
  });

  it('returns the same object when nothing changed', () => {
    const stage = addSpare(initialBuilds('Tasks'), 'Settings');
    expect(reconcileBuilds(stage, ['Tasks'])).toBe(stage);
  });

  it('never hands two builds the same id', () => {
    let stage = initialBuilds('Tasks');
    stage = addSpare(stage, 'Settings');
    stage = reconcileBuilds(stage, ['Settings']);
    stage = reconcileBuilds(stage, ['Settings', 'Tasks']);
    const ids = [
      ...Object.values(stage.builds).map((build) => build?.id),
      ...stage.gone.map((build) => build.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('nextSpare', () => {
  it('builds the other root, then stops', () => {
    let stage = initialBuilds('Tasks');
    expect(nextSpare(stage, 'Tasks')).toBe('Settings');
    stage = addSpare(stage, 'Settings');
    expect(nextSpare(stage, 'Tasks')).toBeNull();
    expect(nextSpare(initialBuilds('Settings'), 'Settings')).toBe('Tasks');
  });

  it('does not rebuild a root that is already mounted', () => {
    const stage = addSpare(initialBuilds('Tasks'), 'Settings');
    expect(addSpare(stage, 'Settings')).toBe(stage);
  });
});
