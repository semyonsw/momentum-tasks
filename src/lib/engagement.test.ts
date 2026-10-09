import { describe, expect, it } from 'vitest';

import { ENGAGEMENT_DEFAULT, engagementOn, engagementView, usableEngagement } from './engagement';

/**
 * The one switch. "With it off the app is exactly as it was" is tested HERE,
 * once, because every Wave 3 piece asks `engagementView` whether it may appear.
 */

describe('the switch', () => {
  it('is off by default, and absent reads as off', () => {
    expect(ENGAGEMENT_DEFAULT).toBe(false);
    expect(engagementOn({})).toBe(false);
    expect(engagementOn({ engagement: undefined })).toBe(false);
    expect(engagementOn({ engagement: true })).toBe(true);
  });

  it('persists as true or nothing', () => {
    expect(usableEngagement(true)).toBe(true);
    for (const junk of [false, 'true', 1, null, undefined, {}]) {
      expect(usableEngagement(junk)).toBeUndefined();
    }
  });
});

describe('what may appear', () => {
  it('with the switch off, nothing at all', () => {
    const view = engagementView(false);
    for (const [piece, shown] of Object.entries(view)) expect(shown, piece).toBe(false);
  });

  it('with it on, every piece', () => {
    const view = engagementView(true);
    for (const [piece, shown] of Object.entries(view)) expect(shown, piece).toBe(true);
  });

  it('a 2.2.0 settings blob shows nothing', () => {
    const view = engagementView(engagementOn({}));
    expect(Object.values(view).some(Boolean)).toBe(false);
  });
});
