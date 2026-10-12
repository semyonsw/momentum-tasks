import { describe, expect, it } from 'vitest';

import { FOLD_AT, noteFolds } from './noteFold';

/** The day list's ⌄: only on a note that one line cannot hold. */

describe('noteFolds', () => {
  it('leaves an empty or short note alone', () => {
    expect(noteFolds('')).toBe(false);
    expect(noteFolds('   ')).toBe(false);
    expect(noteFolds('taxi to the gym')).toBe(false);
    expect(noteFolds('x'.repeat(FOLD_AT))).toBe(false);
  });

  it('folds a note with a line break, however short', () => {
    expect(noteFolds('milk\nbread')).toBe(true);
  });

  it('ignores a trailing break', () => {
    expect(noteFolds('milk\n')).toBe(false);
  });

  it('folds a single line longer than one row', () => {
    expect(noteFolds('x'.repeat(FOLD_AT + 1))).toBe(true);
  });
});
