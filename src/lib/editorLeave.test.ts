import { describe, expect, it } from 'vitest';

import { editorBack } from './editorLeave';

describe('the editor’s own ‹', () => {
  it('leaves an untouched draft on one press', () => {
    expect(editorBack(false)).toBe('leave');
  });

  it('asks before an edited draft goes', () => {
    expect(editorBack(true)).toBe('ask');
  });
});
