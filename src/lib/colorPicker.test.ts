import { describe, expect, it } from 'vitest';

import {
  PICKER_HUES,
  PICKER_LIGHTNESS,
  PICKER_SATURATIONS,
  hexToHsl,
  hslToHex,
  nearestHueIndex,
  parseTypedHex,
  toneGrid,
} from './colorPicker';

describe('hslToHex', () => {
  it('hits the primaries', () => {
    expect(hslToHex(0, 100, 50)).toBe('#FF0000');
    expect(hslToHex(120, 100, 50)).toBe('#00FF00');
    expect(hslToHex(240, 100, 50)).toBe('#0000FF');
  });

  it('draws grey when there is no saturation', () => {
    expect(hslToHex(200, 0, 50)).toBe('#808080');
  });

  it('wraps hues past 360', () => {
    expect(hslToHex(360, 100, 50)).toBe(hslToHex(0, 100, 50));
  });
});

describe('hexToHsl', () => {
  it('round-trips a grid swatch', () => {
    const hex = hslToHex(210, 78, 48);
    const { h, s, l } = hexToHsl(hex);
    expect(hslToHex(h, s, l)).toBe(hex);
  });
});

describe('toneGrid', () => {
  it('is saturations × lightness, all valid hex', () => {
    const grid = toneGrid(90);
    expect(grid).toHaveLength(PICKER_SATURATIONS.length);
    for (const row of grid) {
      expect(row).toHaveLength(PICKER_LIGHTNESS.length);
      for (const hex of row) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('has twelve hues to pick from', () => {
    expect(PICKER_HUES).toHaveLength(12);
  });
});

describe('nearestHueIndex', () => {
  it('finds the hue a colour came from', () => {
    expect(nearestHueIndex('#FF0000')).toBe(0);
    expect(nearestHueIndex(hslToHex(210, 100, 50))).toBe(7);
    // 350° is nearer red than rose.
    expect(nearestHueIndex(hslToHex(350, 100, 50))).toBe(0);
  });

  it('puts greys on the first hue', () => {
    expect(nearestHueIndex('#808080')).toBe(0);
  });
});

describe('parseTypedHex', () => {
  it('accepts with or without the hash, any case', () => {
    expect(parseTypedHex('3ddc84')).toBe('#3DDC84');
    expect(parseTypedHex(' #3DDC84 ')).toBe('#3DDC84');
  });

  it('refuses a half-typed value', () => {
    expect(parseTypedHex('#3DD')).toBeNull();
    expect(parseTypedHex('')).toBeNull();
  });
});
