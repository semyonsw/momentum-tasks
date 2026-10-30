import { describe, expect, it } from 'vitest';

import { canMoveSet, movableRange, moveSetTo } from './setOrder';

/** Moving a set in edit mode: the plan can be rearranged, the history cannot. */

const row = (localId: string, isCompleted = false) => ({ localId, isCompleted });
const ids = (sets: readonly { localId: string }[]) => sets.map((s) => s.localId);

describe('movableRange', () => {
  it('is every row of an exercise not yet started', () => {
    expect(movableRange([row('a'), row('b'), row('c')])).toEqual([0, 2]);
  });

  it('starts below the last logged row', () => {
    expect(movableRange([row('a', true), row('b'), row('c', true), row('d'), row('e')])).toEqual([
      3, 4,
    ]);
  });

  it('is null when fewer than two rows could trade places', () => {
    expect(movableRange([row('a', true), row('b')])).toBeNull();
    expect(movableRange([row('a', true), row('b', true)])).toBeNull();
    expect(movableRange([])).toBeNull();
  });
});

describe('moveSetTo', () => {
  const plan = [row('w', true), row('a'), row('b'), row('c')];

  it('moves an unlogged row down and up', () => {
    expect(ids(moveSetTo(plan, 'a', 3))).toEqual(['w', 'b', 'c', 'a']);
    expect(ids(moveSetTo(plan, 'c', 1))).toEqual(['w', 'c', 'a', 'b']);
  });

  it('never moves a row into history — the target is held below the last logged set', () => {
    expect(ids(moveSetTo(plan, 'b', 0))).toEqual(['w', 'b', 'a', 'c']);
  });

  it('returns the same array for a logged row, an unknown id or a no-op', () => {
    expect(moveSetTo(plan, 'w', 3)).toBe(plan);
    expect(moveSetTo(plan, 'zz', 1)).toBe(plan);
    expect(moveSetTo(plan, 'a', 1)).toBe(plan);
  });
});

describe('canMoveSet', () => {
  it('is true only inside the movable range', () => {
    const sets = [row('w', true), row('a'), row('b')];
    expect(canMoveSet(sets, 'w')).toBe(false);
    expect(canMoveSet(sets, 'a')).toBe(true);
    expect(canMoveSet([row('w', true), row('a')], 'a')).toBe(false);
  });
});
