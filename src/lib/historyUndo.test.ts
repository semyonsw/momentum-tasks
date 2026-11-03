import { describe, expect, it, vi } from 'vitest';

import { supersedesUndo } from './historyUndo';

/**
 * The Undo is a whole-workout snapshot, so an edit made while it is offered must
 * retire it — otherwise Undo silently reverts that edit along with the removal.
 */
describe('supersedesUndo', () => {
  it('dismisses the pending Undo before the edit lands', () => {
    const calls: string[] = [];
    const edit = supersedesUndo(
      (weight: number) => calls.push(`edit ${weight}`),
      () => calls.push('dismiss'),
    );
    edit(82.5);
    expect(calls).toEqual(['dismiss', 'edit 82.5']);
  });

  it('passes arguments and the result through untouched', () => {
    const inner = vi.fn((a: string, b: number) => `${a}:${b}`);
    const edit = supersedesUndo(inner, () => undefined);
    expect(edit('w1', 3)).toBe('w1:3');
    expect(inner).toHaveBeenCalledWith('w1', 3);
  });
});
