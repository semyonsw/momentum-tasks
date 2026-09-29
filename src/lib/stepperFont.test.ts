import { describe, expect, it } from 'vitest';

import { stepperFontSize } from './stepperFont';

describe('stepperFontSize', () => {
  it('keeps short numbers at full size from the first frame', () => {
    expect(stepperFontSize('4')).toBe(20);
    expect(stepperFontSize('12')).toBe(20);
    expect(stepperFontSize('BW')).toBe(20);
  });

  it('steps down for longer values instead of auto-shrinking', () => {
    expect(stepperFontSize('100')).toBe(17);
    expect(stepperFontSize('22.5')).toBe(14);
    expect(stepperFontSize('102.5')).toBe(12);
  });

  it('never returns a size smaller than readable', () => {
    expect(stepperFontSize('1234567')).toBeGreaterThanOrEqual(12);
  });
});
