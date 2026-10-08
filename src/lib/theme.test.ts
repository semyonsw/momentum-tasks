import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  DEFAULT_CUSTOM_COLORS,
  NEUTRALS,
  ON_ACC_DARK,
  ON_ACC_LIGHT,
  THEME_PRESETS,
  contrastRatio,
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

/**
 * READABILITY (T-U1). The app is read at arm's length under gym light, so the
 * floor is WCAG AA for body text — 4.5:1 — for every colour text is drawn in,
 * on every surface text sits on. `inkFaint` failed it at 3.1:1 for two years
 * because nothing measured it; this does.
 */
describe('text contrast', () => {
  const grounds = {
    bg: NEUTRALS.bg,
    surface: NEUTRALS.surface,
    surfaceAlt: NEUTRALS.surfaceAlt,
  };
  const inks = { ink: NEUTRALS.ink, inkMuted: NEUTRALS.inkMuted, inkFaint: NEUTRALS.inkFaint };

  it('computes the WCAG ratio', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#000000'));
  });

  for (const [inkName, ink] of Object.entries(inks)) {
    for (const [groundName, ground] of Object.entries(grounds)) {
      it(`${inkName} is at least 4.5:1 on ${groundName}`, () => {
        expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('keeps the three inks three distinct steps, brightest first', () => {
    expect(luminance(NEUTRALS.ink)).toBeGreaterThan(luminance(NEUTRALS.inkMuted));
    expect(luminance(NEUTRALS.inkMuted)).toBeGreaterThan(luminance(NEUTRALS.inkFaint));
  });

  it('holds the accent text of every built-in theme to the same floor', () => {
    const themes = [...THEME_PRESETS.map((p) => p.colors), DEFAULT_CUSTOM_COLORS];
    for (const colors of themes) {
      const { acc } = deriveTheme(colors);
      for (const ground of Object.values(grounds)) {
        expect(contrastRatio(acc, ground), `${acc} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('agrees with global.css, the second spelling of the neutrals', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'global.css'), 'utf8');
    const vars: Record<string, string> = {
      '--bg': NEUTRALS.bg,
      '--surface': NEUTRALS.surface,
      '--surface-alt': NEUTRALS.surfaceAlt,
      '--hairline': NEUTRALS.hairline,
      '--ink': NEUTRALS.ink,
      '--ink-muted': NEUTRALS.inkMuted,
      '--ink-faint': NEUTRALS.inkFaint,
    };
    for (const [name, hex] of Object.entries(vars)) {
      const match = css.match(new RegExp(`${name}:\\s*(\\d+) (\\d+) (\\d+);`));
      expect(match, name).not.toBeNull();
      expect(match!.slice(1, 4).map(Number), name).toEqual(hexToRgb(hex));
    }
  });
});

/** Every .ts/.tsx under `src`, tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Source lines with comment-only lines dropped, so prose about a size is not a size. */
function codeLines(path: string): { line: string; at: string }[] {
  const root = join(__dirname, '..');
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line, index) => ({ line, at: `${relative(root, path)}:${index + 1}` }))
    .filter(({ line }) => !/^\s*(\*|\/\/|\/\*)/.test(line));
}

/**
 * THE TYPE FLOOR (U21). Nothing is drawn smaller than `micro`, 12.5 — the
 * smallest step of the scale in `tailwind.config.js`. A grep rather than a render
 * because the sizes that slipped under it (10–11.5 on FinishSheet labels, the AI
 * blocks, bubble kickers) were all literals written beside a className.
 *
 * What it scans, in every non-test .ts/.tsx under `src`:
 *   - `fontSize: N` in a style object, and `fontSize={N}` on an SVG `<Text>`;
 *   - Tailwind arbitrary sizes, `text-[Npx]`.
 * Named sizes (`text-micro` and up) are the scale itself and are checked below
 * against `tailwind.config.js`. A size computed at runtime (`stepperFontSize`,
 * `segmentFontSize`, …) is not a literal; those functions' own tests hold them
 * to the same floor.
 */
describe('the type floor', () => {
  const MICRO = 12.5;
  const files = sourceFiles(join(__dirname, '..'));

  it('finds the source it is meant to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no literal font size below micro anywhere in src', () => {
    const offenders: string[] = [];
    const patterns = [
      /fontSize:\s*(\d+(?:\.\d+)?)\b/g,
      /fontSize=\{(\d+(?:\.\d+)?)\}/g,
      /text-\[(\d+(?:\.\d+)?)px\]/g,
    ];
    for (const file of files) {
      for (const { line, at } of codeLines(file)) {
        for (const pattern of patterns) {
          for (const match of line.matchAll(pattern)) {
            if (Number(match[1]) < MICRO) offenders.push(`${at}  ${match[0]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('starts the named scale at micro', () => {
    const config = readFileSync(join(__dirname, '..', '..', 'tailwind.config.js'), 'utf8');
    const block = config.slice(config.indexOf('fontSize: {'), config.indexOf('spacing: {'));
    const sizes = [...block.matchAll(/\['(\d+(?:\.\d+)?)px'/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBe(MICRO);
  });
});

/**
 * THE FONT-SCALE RULE (U4). Text follows the phone's font size up to 1.3×;
 * `allowFontScaling={false}` is kept only where a number's size is MEASURED or
 * fitted to its box — the focus-mode numerals and clock, the timer pill, the
 * rolling digits, the day dial, the set row's numerals and the landing tile's
 * figure. A new `false` anywhere else is the 136-of-them problem coming back.
 */
describe('font scaling', () => {
  const ALLOWED = new Set([
    'components/FocusClock.tsx',
    'components/FocusMode.tsx',
    'components/RollingNumber.tsx',
    'components/SetRow.tsx',
    'components/TimerPill.tsx',
    'screens/HomeScreen.tsx',
    'screens/LandingScreen.tsx',
    'screens/TasksScreen.tsx',
  ]);

  it('turns scaling off only on the measured focal numerals', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(__dirname, '..'))) {
      for (const { line, at } of codeLines(file)) {
        if (line.includes('allowFontScaling={false}') && !ALLOWED.has(at.split(':')[0])) {
          offenders.push(at);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
