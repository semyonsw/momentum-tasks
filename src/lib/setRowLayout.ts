/**
 * The set row's grid and the quick RIR scale — the numbers the 2.9 redesign (#1,
 * #2) fixed, kept here so a test can hold them to the 360 dp promise.
 *
 *   ┌ 12 ┬──── 80 ────┬─ 6 ─┬── 1fr ──┬─ 6 ─┬── 1fr ──┬─ 6 ─┬ 48 ┬ 12 ┐
 *   │    │ [W] 6 [1▾] │     │ 102.5 kg│     │ 12 RIR 2│     │ (✓)│    │
 *   └────┴────────────┴─────┴─────────┴─────┴─────────┴─────┴────┴────┘
 *
 * ── WHY A FIXED LEAD COLUMN ─────────────────────────────────────────────────
 *
 * The `W` toggle comes and goes (it is only offered while a row can still be a
 * warm-up, `warmupToggleRows`), and edit mode puts a ⋮⋮ grip in the same slot. A
 * column that sized to its contents moved the weight under the thumb every time
 * either happened; 80 dp whatever is in it means the weight well's left edge is
 * the same on every row of every card, toggle or spacer, grip or not.
 *
 * ── WHY A WIDTH MODEL AT ALL ────────────────────────────────────────────────
 *
 * At 360 dp each value well is 79 dp, and `102.5 kg` or `12` + `RIR 2` is most of
 * that. There is no renderer in the test suite, so the check is an estimate off
 * Roboto's advance widths — deliberately on the generous side — and the row also
 * lets the numeral shrink to fit (`adjustsFontSizeToFit`) as the last resort. The
 * estimate is what stops a padding or a chip margin creeping up unnoticed until
 * the first real phone crops a weight.
 */

import type { CountUnit, UnitSystem } from '../types/models';
import { DEFAULT_OVERLOAD_POLICY } from './progressiveOverload';
import { countStep, kgToLb, resolveIncrementKg } from './units';

/** The grid, in dp. `log` is the column; the circle inside it is `logCircle`. */
export const SET_ROW = {
  height: 56,
  lead: 80,
  toggle: 30,
  setWell: 44,
  gap: 6,
  log: 48,
  logCircle: 44,
  /** The card's own inner padding, each side. */
  cardPadding: 12,
  /**
   * The value wells' inner padding, each side — tighter than `ValueWell`'s 8,
   * because at 360 dp those 8 were the difference between `102.5 kg` and `102.…`.
   */
  wellPadding: 4,
  /** Between a numeral and its unit or chip. */
  unitGap: 3,
  /** The `RIR 2` chip's inner padding, each side. */
  chipPadding: 5,
} as const;

/** The session list's side gutter, each side, around the cards. */
export const SCREEN_GUTTER = 16;

/**
 * One value well's width at a screen width — the two `1fr` columns share what the
 * lead, the log and the gaps leave. With no weight column the count takes both.
 */
export function valueWellWidth(
  screenWidth: number,
  hasWeight = true,
  gutter = SCREEN_GUTTER,
  cardPadding: number = SET_ROW.cardPadding,
): number {
  const inner = screenWidth - 2 * gutter - 2 * cardPadding;
  const columns = hasWeight ? 2 : 1;
  const gaps = (columns + 1) * SET_ROW.gap;
  return (inner - SET_ROW.lead - SET_ROW.log - gaps) / columns;
}

/** Roboto advance widths in em, rounded up. Anything unlisted gets `OTHER`. */
const ADVANCE: Record<string, number> = {
  '0': 0.57,
  '1': 0.57,
  '2': 0.57,
  '3': 0.57,
  '4': 0.57,
  '5': 0.57,
  '6': 0.57,
  '7': 0.57,
  '8': 0.57,
  '9': 0.57,
  '.': 0.28,
  ',': 0.28,
  ':': 0.28,
  ' ': 0.25,
  '+': 0.58,
  '−': 0.58,
  '—': 0.8,
  // The letters the row actually draws beside a number: `kg`, `lb`, `RIR`.
  I: 0.28,
  R: 0.64,
  k: 0.53,
  g: 0.57,
  l: 0.25,
  b: 0.57,
};
const OTHER = 0.62;

/** The estimated width of `text` at `fontSize`, in dp. */
export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) em += ADVANCE[ch] ?? OTHER;
  return em * fontSize;
}

/** The value numeral's size: 19, one step down (17) on a warm-up. */
export function valueFontSize(isWarmup: boolean): number {
  return isWarmup ? 17 : 19;
}

/** The unit beside a value: 12.5 px, the type floor. */
export const UNIT_FONT_SIZE = 12.5;

/** The `RIR 2` chip's width. */
export function rirChipWidth(label: string): number {
  return textWidth(label, UNIT_FONT_SIZE) + 2 * SET_ROW.chipPadding;
}

/**
 * Does a well of `wellWidth` hold `value` at full size with `trailing` beside it
 * (a unit's text width, or a chip's)?
 */
export function fitsWell(
  value: string,
  trailingWidth: number,
  wellWidth: number,
  isWarmup = false,
): boolean {
  const needed =
    textWidth(value, valueFontSize(isWarmup)) +
    (trailingWidth > 0 ? SET_ROW.unitGap + trailingWidth : 0) +
    2 * SET_ROW.wellPadding;
  return needed <= wellWidth;
}

/* ------------------------------------------------------------------ */
/* Reps left (RIR), the quick scale                                    */
/* ------------------------------------------------------------------ */

/**
 * The five chips the inline editor and the sheet offer: 0 1 2 3 4+.
 *
 * Whole reps only. The stored scale (`lib/effort.ts`) still runs 0–5 in halves,
 * and a half grade from an older version or a backup stays exactly as it was —
 * it simply lights no chip. `4+` stores 4: past four reps left the answer stops
 * changing anything the nudge does (`RIR_LIMIT` is 0.5), so the scale stops too.
 */
export const RIR_QUICK: readonly number[] = [0, 1, 2, 3, 4];

export function rirQuickLabel(value: number): string {
  return value >= 4 ? '4+' : String(value);
}

/** The chip a stored grade lights, or null (ungraded, or a half step). */
export function rirQuickSelected(rir: number | undefined | null): number | null {
  if (rir == null) return null;
  if (rir >= 4) return 4;
  return Number.isInteger(rir) ? rir : null;
}

/* ------------------------------------------------------------------ */
/* The inline editor's steppers                                        */
/* ------------------------------------------------------------------ */

/**
 * One stepper's step, in the user's own units: `−2.5 | 80 | +2.5`, `−1 | 8 | +1`.
 *
 * WEIGHT STEPS BY THE INCREMENT (redesign #2): the exercise's own, else the app's
 * (2.5 kg, 5 lb) — the same number the overload nudge adds, so `+2.5` here and
 * "try 82.5" there are one plate. The ±0.5 / ±2 pair this replaced is still focus
 * mode's (`nudgeSteps`), where four chips have the room; the inline editor has one
 * button each side, and the one that is worth a button is the plate you own.
 * A count steps by its unit's natural step: a rep, fifteen seconds, 25 m.
 */
export function stepperStep(
  field: 'weight' | 'count',
  exercise: { incrementKg?: number; countUnit: CountUnit },
  unitSystem: UnitSystem,
  policyIncrementKg: number = DEFAULT_OVERLOAD_POLICY.incrementKg,
): number {
  if (field === 'count') return countStep(exercise.countUnit);
  const kg = resolveIncrementKg(exercise.incrementKg, policyIncrementKg, unitSystem);
  return unitSystem === 'imperial' ? Number(kgToLb(kg).toFixed(1)) : kg;
}
