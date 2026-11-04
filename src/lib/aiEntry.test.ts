import { describe, expect, it } from 'vitest';

import { aiCardShown } from './aiEntry';

describe('the assistant card', () => {
  it('shows on a phone that never closed it and never chatted', () => {
    expect(aiCardShown(false, false)).toBe(true);
  });

  it('goes after the ✕', () => {
    expect(aiCardShown(true, false)).toBe(false);
  });

  it('goes after the first chat', () => {
    expect(aiCardShown(false, true)).toBe(false);
  });
});
