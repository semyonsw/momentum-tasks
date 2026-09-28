import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CUSTOM_COLORS,
  ON_ACC_DARK,
  ON_ACC_LIGHT,
  THEME_PRESETS,
  deriveTheme,
  hexToRgb,
  luminance,
  mixOklab,
  normalizeHex,
  rgba,
  themeColors,
  themeName,
  usableCustomColors,
  usableThemeId,
} from './theme';

/**
 * The theme, as arithmetic. The rule worth pinning is the one a wrong answer
 * would hide: `onAcc` decides whether a ▶ on the gradient can be SEEN, and it
 * must flip at the design's 0.45 luminance for every preset.
 */
describe('the presets', () => {
  it('are the eight the design names, Fintech Lime first', () => {
    expect(THEME_PRESETS.map((p) => p.id)).toEqual([
      'lime',
      'emerald',
      'electric',
      'aqua',
      'sunset',
      'sapphire',
      'aurora',
      'ember',
    ]);
    expect(THEME_PRESETS[0].colors).toEqual(['#C6F432', '#3DDC84', '#00A389']);
  });
});

describe('usableThemeId / usableCustomColors', () => {
  it('lands an unknown id on the default', () => {
    expect(usableThemeId('neon')).toBe('lime');
    expect(usableThemeId('custom')).toBe('custom');
  });

  it('keeps good hex, normalises it, and fills a bad slot from the default', () => {
    expect(usableCustomColors(['#abcdef', 'nope', 12])).toEqual([
      '#ABCDEF',
      DEFAULT_CUSTOM_COLORS[1],
      DEFAULT_CUSTOM_COLORS[2],
    ]);
    expect(usableCustomColors(undefined)).toEqual(DEFAULT_CUSTOM_COLORS);
  });
});

describe('themeColors / themeName', () => {
  it('reads a preset, or Custom’s own three', () => {
    expect(themeColors('ember', DEFAULT_CUSTOM_COLORS)).toEqual(['#F59E0B', '#F97316', '#EF4444']);
    expect(themeColors('custom', ['#111111', '#222222', '#333333'])).toEqual([
      '#111111',
      '#222222',
      '#333333',
    ]);
    expect(themeName('aqua')).toBe('Aqua Tech');
    expect(themeName('custom')).toBe('Custom');
  });
});

describe('colour arithmetic', () => {
  it('parses and prints', () => {
    expect(normalizeHex('3ddc84')).toBe('#3DDC84');
    expect(normalizeHex('#fff')).toBeNull();
    expect(hexToRgb('#3DDC84')).toEqual([61, 220, 132]);
    expect(rgba('#3DDC84', 0.13)).toBe('rgba(61,220,132,0.13)');
  });

  it('has luminance at the ends of the scale', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
  });

  it('mixes in OKLab: the ends are the inputs, and white lightens', () => {
    expect(mixOklab('#3DDC84', '#FFFFFF', 1)).toBe('#3DDC84');
    expect(mixOklab('#3DDC84', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(luminance(mixOklab('#9624FF', '#FFFFFF', 0.8))).toBeGreaterThan(luminance('#9624FF'));
  });
});

describe('deriveTheme', () => {
  it('puts dark glyphs on a light c2 and white ones on a dark c2', () => {
    expect(deriveTheme(THEME_PRESETS[0].colors).onAcc).toBe(ON_ACC_DARK); // lime
    expect(deriveTheme(THEME_PRESETS[2].colors).onAcc).toBe(ON_ACC_LIGHT); // electric
    expect(deriveTheme(THEME_PRESETS[1].colors).onAcc).toBe(ON_ACC_LIGHT); // emerald
  });

  it('makes an accent lighter than c2 for every preset', () => {
    for (const preset of THEME_PRESETS) {
      const theme = deriveTheme(preset.colors);
      expect(luminance(theme.acc)).toBeGreaterThan(luminance(theme.c2));
    }
  });

  it('keeps the tints darker than c2, over the page', () => {
    const theme = deriveTheme(THEME_PRESETS[0].colors);
    expect(luminance(theme.dim)).toBeLessThan(luminance(theme.c2));
    expect(luminance(theme.wash)).toBeLessThan(luminance(theme.dim));
  });
});
