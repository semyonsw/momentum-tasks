import { describe, expect, it } from 'vitest';

import { formatWhole } from './formatNumber';

/**
 * The level sheet and the badges print these side by side, so the grouping is
 * one fixed form whatever the phone's locale — and a negative stays negative
 * after rounding rather than becoming "-0".
 */
describe('formatWhole', () => {
  it('groups thousands with a comma', () => {
    expect(formatWhole(0)).toBe('0');
    expect(formatWhole(999)).toBe('999');
    expect(formatWhole(2100)).toBe('2,100');
    expect(formatWhole(12480)).toBe('12,480');
    expect(formatWhole(1234567)).toBe('1,234,567');
  });

  it('rounds to a whole number', () => {
    expect(formatWhole(2.4)).toBe('2');
    expect(formatWhole(2.5)).toBe('3');
    expect(formatWhole(999.6)).toBe('1,000');
  });

  it('keeps the sign outside the grouping', () => {
    expect(formatWhole(-2100)).toBe('-2,100');
    expect(formatWhole(-1.5)).toBe('-2');
  });

  it('a negative that rounds to nothing is "0", not "-0"', () => {
    expect(formatWhole(-0.4)).toBe('0');
    expect(formatWhole(-0)).toBe('0');
  });
});
