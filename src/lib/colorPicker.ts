/**
 * The in-app colour picker's arithmetic: a hue strip, a tone grid, and the way
 * back from a typed hex to the swatches it is nearest.
 *
 * ── WHY SWATCHES AND NOT A WHEEL ──────────────────────────────────────────
 *
 * Android has no system colour picker, and the prototype's `<input type=color>`
 * has no React Native equivalent. A continuous wheel or a 2-D drag field is a
 * gesture surface inside a sheet that is itself dragged to dismiss, and a finger
 * cannot land on one exact pixel of it anyway. Twelve hues and a grid of tones
 * under the chosen one is a finite set of targets a thumb can hit, and the hex
 * field is there for anybody who knows exactly what they want.
 *
 * HSL rather than OKLCH for the grid: every swatch has to be a real sRGB colour,
 * and an evenly spaced OKLCH grid falls outside the gamut in half its cells. The
 * accent derived FROM the choice is still OKLab (`lib/theme.ts`).
 *
 * Pure, so it is tested without a renderer.
 */

import { hexToRgb, normalizeHex, rgbToHex } from './theme';

/** Twelve hues, 30° apart, starting at red. */
export const PICKER_HUES: readonly number[] = Array.from({ length: 12 }, (_, i) => i * 30);

/** Rows of the tone grid, most saturated first. */
export const PICKER_SATURATIONS: readonly number[] = [100, 78, 56, 34];

/** Columns of the tone grid, darkest first. Neither end is black or white. */
export const PICKER_LIGHTNESS: readonly number[] = [28, 38, 48, 58, 68, 78];

/** `hsl(h, s%, l%)` as `#RRGGBB`. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  if (sat === 0) return rgbToHex([lig * 255, lig * 255, lig * 255]);
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return rgbToHex([channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255]);
}

/** `#RRGGBB` as `{ h 0–360, s 0–100, l 0–100 }`. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

/** The tone grid for one hue: `PICKER_SATURATIONS` rows × `PICKER_LIGHTNESS` columns. */
export function toneGrid(hue: number): string[][] {
  return PICKER_SATURATIONS.map((s) => PICKER_LIGHTNESS.map((l) => hslToHex(hue, s, l)));
}

/**
 * Which of the twelve hues a colour belongs to — so opening the picker on an
 * existing colour, or typing one, shows the grid it came from. Greys have no
 * hue and land on the first.
 */
export function nearestHueIndex(hex: string): number {
  const { h, s } = hexToHsl(hex);
  if (s < 1) return 0;
  return Math.round(h / 30) % PICKER_HUES.length;
}

/**
 * What the hex field holds, as a colour or null. Forgiving about the `#` and the
 * case, and nothing else: a half-typed value is not a colour yet.
 */
export function parseTypedHex(value: string): string | null {
  return normalizeHex(value.replace(/\s/g, ''));
}
