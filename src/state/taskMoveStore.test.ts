import { beforeEach, describe, expect, it } from 'vitest';

import { useTaskMove } from './taskMoveStore';

/**
 * The hand-off between the task's own screen and the day list: one pending
 * request, the latest one wins, and clearing it leaves nothing to replay.
 */
beforeEach(() => useTaskMove.getState().clear());

describe('useTaskMove', () => {
  it('starts empty', () => {
    expect(useTaskMove.getState().request).toBeNull();
  });

  it('holds the request until it is cleared', () => {
    useTaskMove.getState().requestMove({ taskId: 't1', day: '2026-09-12' });
    expect(useTaskMove.getState().request).toEqual({ taskId: 't1', day: '2026-09-12' });
    useTaskMove.getState().clear();
    expect(useTaskMove.getState().request).toBeNull();
  });

  it('a second request replaces the first rather than queueing', () => {
    useTaskMove.getState().requestMove({ taskId: 't1', day: '2026-09-12' });
    useTaskMove.getState().requestMove({ taskId: 't2', day: '2026-09-13' });
    expect(useTaskMove.getState().request).toEqual({ taskId: 't2', day: '2026-09-13' });
  });

  it('notifies a subscriber, which is how a mounted day list picks it up', () => {
    const seen: (string | null)[] = [];
    const unsubscribe = useTaskMove.subscribe((state) => seen.push(state.request?.taskId ?? null));
    useTaskMove.getState().requestMove({ taskId: 't1', day: '2026-09-12' });
    useTaskMove.getState().clear();
    unsubscribe();
    expect(seen).toEqual(['t1', null]);
  });
});
