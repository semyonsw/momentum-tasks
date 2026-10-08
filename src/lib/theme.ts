/**
 * The theme — three colours, and everything the app paints is derived from them.
 *
 *   c1 ──────── c2 ──────── c3        the stops, left to right
 *                │
 *                ├── acc     mix(c2 80%, white) in OKLab — text and icons on black
 *                ├── onAcc   ink or near-black, whichever reads on a c2 fill
 *                └── tint(a) c2 at alpha a — lit cards, chips, borders, glows
 *
 * ── WHY THREE COLOURS AND NOT ONE ─────────────────────────────────────────
 *
 * Momentum is three logs in one app — training, daily tasks, money — and the
 * icon is three arcs of one ring. A gradient of three stops is what lets the
 * floating action, the rings and the lamps carry all three without inventing a
 * colour per section, which is the thing the one-hue rule was protecting against.
 * The one-hue rule survives: every tint in the app is still ONE of these three,
 * and never a fourth colour picked for a single component.
 *
 * ── WHY OKLAB FOR THE ACCENT ──────────────────────────────────────────────
 *
 * The accent is c2 lightened for text on near-black. An sRGB mix toward white
 * washes a saturated violet into lilac-grey at the same ratio that barely moves
 * a lime; OKLab is perceptually even, so "80% of c2" is the same step of
 * lightness for every preset — which is what makes one contrast decision hold
 * for eight themes and whatever three colours somebody picks for Custom.
 *
 * Pure and dependency-free, so the whole derivation is tested without a renderer.
 * `theme/tokens.ts` is where the result is poured into the tokens the screens read.
 */

export type ThemeId =
  'lime' | 'emerald' | 'electric' | 'aqua' | 'sunset' | 'sapphire' | 'aurora' | 'ember' | 'custom';

export type ThemeColors = readonly [string, string, string];

export interface ThemePreset {
  id: Exclude<ThemeId, 'custom'>;
  name: string;
  /** The one-line description under the swatch. */
  tag: string;
  colors: ThemeColors;
}

/** The default is the first entry, and the icon is exported in it. */
export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'lime',
    name: 'Fintech Lime',
    tag: 'Default · money and growth',
    colors: ['#C6F432', '#3DDC84', '#00A389'],
  },
  {
    id: 'emerald',
    name: 'Emerald',
    tag: 'The original green, plus teal',
    colors: ['#1E7A4C', '#3FA96C', '#2BC4A4'],
  },
  {
    id: 'electric',
    name: 'Electric Violet',
    tag: 'Blue, violet, pink',
    colors: ['#1E72FF', '#9624FF', '#FF4FD8'],
  },
  {
    id: 'aqua',
    name: 'Aqua Tech',
    tag: 'The 2026 blue-green',
    colors: ['#00C2A8', '#0EA5E9', '#6366F1'],
  },
  {
    id: 'sunset',
    name: 'Sunset Pulse',
    tag: 'Workout energy',
    colors: ['#FF7A18', '#FF3D68', '#A62BFF'],
  },
  {
    id: 'sapphire',
    name: 'Deep Sapphire',
    tag: 'Calm and trust',
    colors: ['#1D4ED8', '#3B82F6', '#22D3EE'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    tag: 'Acid, cyan, violet',
    colors: ['#7CFF6B', '#00E5FF', '#8B5CF6'],
  },
  {
    id: 'ember',
    name: 'Ember',
    tag: 'Warm focus',
    colors: ['#F59E0B', '#F97316', '#EF4444'],
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'lime';

/** What Custom starts as before anybody touches a dot. Warm, and unlike any preset. */
export const DEFAULT_CUSTOM_COLORS: ThemeColors = ['#FF5F6D', '#FFC371', '#47E891'];

const THEME_IDS: readonly ThemeId[] = [...THEME_PRESETS.map((p) => p.id), 'custom'];

/** A theme id this build knows, or the default — a blob from a later build is a thing. */
export function usableThemeId(value: unknown): ThemeId {
  return THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : DEFAULT_THEME_ID;
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** `#RRGGBB`, upper-case, or null for anything that is not six hex digits. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = HEX.exec(value.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}

/** Three usable hex colours, filling any bad slot from the Custom default. */
export function usableCustomColors(value: unknown): ThemeColors {
  const list = Array.isArray(value) ? value : [];
  return [0, 1, 2].map(
    (i) => normalizeHex(list[i]) ?? DEFAULT_CUSTOM_COLORS[i],
  ) as unknown as ThemeColors;
}

/** The three stops a theme id stands for. */
export function themeColors(themeId: ThemeId, custom: ThemeColors): ThemeColors {
  if (themeId === 'custom') return usableCustomColors(custom);
  return (THEME_PRESETS.find((p) => p.id === themeId) ?? THEME_PRESETS[0]).colors;
}

/** The display name; Custom is not a preset and has no entry to read it from. */
export function themeName(themeId: ThemeId): string {
  if (themeId === 'custom') return 'Custom';
  return (THEME_PRESETS.find((p) => p.id === themeId) ?? THEME_PRESETS[0]).name;
}

/* ------------------------------------------------------------------ */
/* Colour arithmetic                                                   */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = normalizeHex(hex) ?? '#000000';
  return [
    parseInt(clean.slice(1, 3), 16),
    parseInt(clean.slice(3, 5), 16),
    parseInt(clean.slice(5, 7), 16),
  ];
}

function channelHex(v: number): string {
  return Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

/** `rgba(r,g,b,a)` — the spelling every style prop in the app already uses. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  return `rgba(${r},${g},${b},${a})`;
}

/** Space-separated channels, the shape `global.css`'s variables take. */
export function rgbChannels(hex: string): string {
  return hexToRgb(hex).join(' ');
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const fromLinear = (c: number) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toOklab(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: Rgb): string {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return rgbToHex([
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** `color-mix(in oklab, a weight, b)` — `weight` is a's share, 0–1. */
export function mixOklab(a: string, b: string, weight: number): string {
  const x = toOklab(a);
  const y = toOklab(b);
  return fromOklab([0, 1, 2].map((i) => x[i] * weight + y[i] * (1 - weight)) as Rgb);
}

/** The same mix in plain sRGB, for tints over the page where OKLab buys nothing. */
export function mixSrgb(a: string, b: string, weight: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] * weight + y[i] * (1 - weight)) as Rgb);
}

/* ------------------------------------------------------------------ */
/* The derived theme                                                   */
/* ------------------------------------------------------------------ */

/** Above this c2 luminance, glyphs on a gradient fill go dark. */
const DARK_GLYPH_ABOVE = 0.45;
export const ON_ACC_DARK = '#06120A';
export const ON_ACC_LIGHT = '#FFFFFF';

/**
 * THE NEUTRALS — the page, its two surface steps, the hairline and the three
 * inks. They never change with the theme, and they live here rather than only in
 * `theme/tokens.ts` so the contrast rule below can be TESTED: tokens.ts imports
 * `react-native`, which the suite deliberately cannot load.
 *
 * `inkFaint` was #57615C, which is 3.1:1 on the page — the colour of 166 labels,
 * empty states and two undo-able actions, unreadable at arm's length under gym
 * light. #7D8882 is the design's raised value (U3): 5.5:1 on the page and still
 * ≥ 4.5:1 on `surfaceAlt`, the lightest thing text sits on, while staying a clear
 * step below `inkMuted` so the three inks remain three. `global.css` repeats
 * these as channels, and a test holds the two spellings together.
 */
export const NEUTRALS = {
  bg: '#060807',
  surface: '#0E1211',
  surfaceAlt: '#141A18',
  hairline: '#1E2523',
  ink: '#ECF1EE',
  inkMuted: '#8A968F',
  inkFaint: '#7D8882',
} as const;

/** WCAG 2 contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PAGE = NEUTRALS.bg;

export interface DerivedTheme {
  c1: string;
  c2: string;
  c3: string;
  /** Accent text and icons on black. Replaces `greenBright`. */
  acc: string;
  /** Glyph and text colour on a gradient or c2 fill. */
  onAcc: string;
  /** A deep c2 over the page, for tracks, connectors and drop rules. Replaces `greenDim`. */
  dim: string;
  /** The faintest c2 wash over the page. Replaces `greenWash`. */
  wash: string;
}

export function deriveTheme(colors: ThemeColors): DerivedTheme {
  const [c1, c2, c3] = [0, 1, 2].map((i) => normalizeHex(colors[i]) ?? DEFAULT_CUSTOM_COLORS[i]);
  return {
    c1,
    c2,
    c3,
    acc: mixOklab(c2, '#FFFFFF', 0.8),
    onAcc: luminance(c2) > DARK_GLYPH_ABOVE ? ON_ACC_DARK : ON_ACC_LIGHT,
    dim: mixSrgb(c2, PAGE, 0.3),
    wash: mixSrgb(c2, PAGE, 0.08),
  };
}
