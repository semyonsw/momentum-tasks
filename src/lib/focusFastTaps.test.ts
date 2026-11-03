import { describe, expect, it } from 'vitest';

import type { DraftSet } from './draft';
import { columnMove, columnOffset, mayPin } from './rollingDigits';
import { acceptsDone, DONE_COOLDOWN_MS, holdDoneEnding, undoAction } from './focusPress';
import {
  countStepUnitLabel,
  findDraftSet,
  nudgeSet,
  resolvePatch,
  type SetPatch,
} from './setNudge';
import { workNumeralSize } from './focusType';

/**
 * Focus mode under a fast thumb — the "numbers get stuck at 9 → 10" report.
 *
 * Three separate faults made one symptom, and each is pinned here in the form
 * the renderer consumes it: the roll that pinned a stale offset, the ± that
 * computed from the set the screen last drew, and the DONE/undo pair a quick
 * double-tap could turn into the wrong log.
 */

const asSet = (count: number, weightKg: number | null = 20): DraftSet =>
  ({ localId: 's1', count, weightKg }) as DraftSet;

describe('a roll that finishes late does not pin the column', () => {
  it('only the latest roll may set its target outright', () => {
    expect(mayPin(3, 3, true)).toBe(true);
    // tap 1 started roll 3, tap 2 started roll 4; roll 3's callback lands now
    expect(mayPin(3, 4, true)).toBe(false);
    expect(mayPin(4, 4, false)).toBe(false);
  });

  it('9 → 10 reps is a size change, and a stale pin would land between cells', () => {
    const lines = (reps: string) => [
      { value: '100', unit: 'KG' },
      { value: reps, unit: 'REPS' },
    ];
    const before = workNumeralSize(lines('9'), 200, 84);
    const after = workNumeralSize(lines('10'), 200, 84);
    // The precondition of the bug: the two renders differ in size …
    const lhBefore = Math.round(before * 1.1);
    const lhAfter = Math.round(after * 1.1);
    expect(columnMove({ digit: 9, lineHeight: lhBefore }, { digit: 0, lineHeight: lhAfter })).toBe(
      lhBefore === lhAfter ? 'roll' : 'snap',
    );
    // … and the old roll's target, measured in the old cell, is not a whole
    // cell of the new one whenever the size really changed.
    if (lhBefore !== lhAfter) {
      expect(Math.abs(columnOffset(9, lhBefore)) % lhAfter).not.toBe(0);
    }
  });
});

describe('± taps faster than a re-render all count', () => {
  /** A store of one set, patched the way `FocusMode.patchLive` does it. */
  function store(initial: DraftSet) {
    let live = initial;
    const session = () => ({ entries: [{ localId: 'e1', sets: [live] }] });
    const patch = (p: SetPatch) => {
      const set = findDraftSet(session(), 'e1', 's1');
      if (set) live = { ...set, ...resolvePatch(p, set) };
    };
    return { patch, get: () => live };
  }

  it('five + taps on 8 reps reach 13, through the 9 → 10 boundary', () => {
    const s = store(asSet(8));
    for (let i = 0; i < 5; i++) s.patch((set) => nudgeSet(set, 'count', 1, 'metric'));
    expect(s.get().count).toBe(13);
  });

  it('the old way — a value computed from the rendered set — lost taps', () => {
    const s = store(asSet(9));
    const rendered = s.get();
    s.patch(nudgeSet(rendered, 'count', 1, 'metric'));
    s.patch(nudgeSet(rendered, 'count', 1, 'metric'));
    expect(s.get().count).toBe(10); // two taps, one step: the regression
  });

  it('weight taps stack the same way, without float drift', () => {
    const s = store(asSet(5, 97.5));
    for (let i = 0; i < 3; i++) s.patch((set) => nudgeSet(set, 'weight', 0.5, 'metric'));
    expect(s.get().weightKg).toBe(99);
    s.patch((set) => nudgeSet(set, 'weight', 2, 'metric'));
    expect(s.get().weightKg).toBe(101);
  });

  it('minus taps stop at zero', () => {
    const s = store(asSet(1));
    for (let i = 0; i < 4; i++) s.patch((set) => nudgeSet(set, 'count', -1, 'metric'));
    expect(s.get().count).toBe(0);
  });

  it('a set deleted under the tap is left alone', () => {
    expect(findDraftSet({ entries: [] }, 'e1', 's1')).toBeNull();
    expect(findDraftSet(null, 'e1', 's1')).toBeNull();
  });

  it('a plain patch still passes through unchanged', () => {
    expect(resolvePatch({ count: 7 }, asSet(3))).toEqual({ count: 7 });
  });
});

describe('DONE and undo under a double-tap', () => {
  it('a second DONE inside the cooldown is ignored', () => {
    expect(acceptsDone(null, 1000)).toBe(true);
    expect(acceptsDone(1000, 1250)).toBe(false);
    expect(acceptsDone(1000, 1000 + DONE_COOLDOWN_MS)).toBe(true);
  });

  it('undo while DONE is pending cancels that DONE, not the set before it', () => {
    expect(undoAction(true)).toBe('cancel-pending');
    expect(undoAction(false)).toBe('uncomplete');
  });

  it('DONE on a hold that has counted nothing logs the set as planned', () => {
    expect(holdDoneEnding('work', 0)).toBe('log');
    expect(holdDoneEnding('work', 12)).toBe('commit');
    expect(holdDoneEnding('prepare', 0)).toBe('log');
    expect(holdDoneEnding(null, null)).toBe('log');
  });
});

describe('the ± circles speak their step in its own unit', () => {
  it('a timed count steps in seconds, not the minutes its cell reads in', () => {
    expect(countStepUnitLabel('seconds', 'en')).toBe('sec');
    expect(countStepUnitLabel('rounds', 'en')).toBe('sec');
    expect(countStepUnitLabel('reps', 'en')).toBe('reps');
  });
});
