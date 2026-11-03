import { describe, expect, it } from 'vitest';

import { GROW_IN_GRACE_MS, growInDeadline, leaveLatch } from './growIn';

describe('growInDeadline', () => {
  it('is the animation plus the grace', () => {
    expect(growInDeadline(320, 1)).toBe(320 + GROW_IN_GRACE_MS);
  });

  it('scales with the motion scale', () => {
    expect(growInDeadline(320, 0.5)).toBe(160 + GROW_IN_GRACE_MS);
  });

  it('never goes below the grace, even for nonsense input', () => {
    expect(growInDeadline(0, 1)).toBe(GROW_IN_GRACE_MS);
    expect(growInDeadline(Number.NaN, 1)).toBe(GROW_IN_GRACE_MS);
    expect(growInDeadline(300, -1)).toBe(GROW_IN_GRACE_MS);
  });
});

describe('leaveLatch', () => {
  // Regression: removing a set, then collapsing the card inside the 280 ms close,
  // unmounted the row before its animation finished — onLeft never ran and the
  // removed set was saved with the workout.
  it('delivers the removal when a leaving row is unmounted mid-animation', () => {
    let removed = 0;
    const latch = leaveLatch();
    expect(latch.unmount(true, () => removed++)).toBe(true);
    expect(removed).toBe(1);
  });

  it('removes once, whichever path comes first', () => {
    let removed = 0;
    const onLeft = () => removed++;
    const finishedFirst = leaveLatch();
    finishedFirst.fire(onLeft);
    finishedFirst.unmount(true, onLeft);
    const unmountedFirst = leaveLatch();
    unmountedFirst.unmount(true, onLeft);
    unmountedFirst.fire(onLeft);
    expect(removed).toBe(2);
  });

  it('never removes a row that was not leaving', () => {
    let removed = 0;
    expect(leaveLatch().unmount(false, () => removed++)).toBe(false);
    expect(removed).toBe(0);
  });
});
