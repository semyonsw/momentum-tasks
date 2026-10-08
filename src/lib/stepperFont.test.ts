import { describe, expect, it } from 'vitest';

import { figureFontSize, segmentFontSize, statFontSize, stepperFontSize } from './stepperFont';

describe('stepperFontSize', () => {
  it('keeps short numbers at full size from the first frame', () => {
    expect(stepperFontSize('4')).toBe(20);
    expect(stepperFontSize('12')).toBe(20);
    expect(stepperFontSize('BW')).toBe(20);
  });

  it('steps down for longer values instead of auto-shrinking', () => {
    expect(stepperFontSize('100')).toBe(17);
    expect(stepperFontSize('22.5')).toBe(14);
    expect(stepperFontSize('102.5')).toBe(12.5);
  });

  it('never returns a size smaller than readable', () => {
    expect(stepperFontSize('1234567')).toBeGreaterThanOrEqual(12.5);
  });
});

describe('statFontSize', () => {
  it('shrinks with the value, never below 13', () => {
    expect(statFontSize('4')).toBe(20);
    expect(statFontSize('12,400')).toBe(20);
    expect(statFontSize('124,500 ֏')).toBe(16);
    expect(statFontSize('1,240,500 ֏ total')).toBe(13);
  });
});

describe('segmentFontSize', () => {
  it('keeps the design size when the label fits, or before the track is measured', () => {
    expect(segmentFontSize('Every day', 74)).toBe(13.5);
    expect(segmentFontSize('Pick days', 0)).toBe(13.5);
  });

  it('shrinks a long translation a little, and never to nothing', () => {
    const long = segmentFontSize('Выбрать дни', 74);
    expect(long).toBeLessThan(13.5);
    expect(long).toBeGreaterThanOrEqual(12.5);
    expect(segmentFontSize('Каждый рабочий день', 20)).toBe(12.5);
  });
});

describe('figureFontSize', () => {
  it('is 26 for a balance that fits the tile, smaller for a long one, never under 16', () => {
    expect(figureFontSize('12,500', 134)).toBe(26);
    expect(figureFontSize('-1,234,567', 134)).toBeLessThan(26);
    expect(figureFontSize('-1,234,567,890.50', 100)).toBe(16);
  });

  it('reaches the larger ceiling it is given, and only when it fits', () => {
    expect(figureFontSize('284,600', 200, 30)).toBe(30);
    expect(figureFontSize('12,486,300', 160, 30)).toBeLessThan(30);
    expect(figureFontSize('284,600', 200)).toBe(26);
  });
});
