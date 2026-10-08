import { describe, expect, it } from 'vitest';

import { aiCardShown } from './aiEntry';

describe('the assistant card', () => {
  it('shows on a phone that never closed it and never chatted', () => {
    expect(aiCardShown('Tasks', undefined, false)).toBe(true);
    expect(aiCardShown('Tasks', [], false)).toBe(true);
  });

  it('goes after the ✕, in that section only', () => {
    expect(aiCardShown('Tasks', ['Tasks'], false)).toBe(false);
    expect(aiCardShown('Workout', ['Tasks'], false)).toBe(true);
    expect(aiCardShown('Expenses', ['Tasks'], false)).toBe(true);
  });

  it('goes after the first chat in that section', () => {
    expect(aiCardShown('Expenses', undefined, true)).toBe(false);
  });
});
