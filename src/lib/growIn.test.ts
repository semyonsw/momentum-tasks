import { describe, expect, it } from 'vitest';

import { GROW_IN_GRACE_MS, growInDeadline } from './growIn';

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
