/**
 * HIT TARGETS — how much invisible slop a control needs so a thumb can find it.
 *
 * The rule is 44 dp a side for anything you tap, and 48 for anything you tap
 * mid-workout, with chalk on your hands and your pulse at 160. A control can
 * reach that two ways: be that big, or be smaller and carry a `hitSlop`. Being
 * that big is better when the layout has the room — a target you can SEE the
 * edge of is one you aim at — and slop is for the places it does not: a chip in
 * a wrapping row of 38 dp chips, a stepper's 36 dp circle beside its value.
 *
 * Why a function rather than `hitSlop={8}` at every site: the number at the site
 * used to be whatever looked about right, and the audit found 28 dp chevrons with
 * a slop of 8 sitting beside 34 dp chips with a slop of 8 — the same constant on
 * two different deficits. `hitSlopFor(36, 48)` says what the control is and what
 * it has to reach, and the arithmetic stops being a guess.
 *
 * Why the sides can be capped (`slopInsets`): two controls side by side with
 * symmetric slop OVERLAP, and in the overlap the platform picks one — so a press
 * aimed at `+` can land on `−`. A side that faces a neighbour gets at most half
 * the gap, and the target grows outwards instead, where there is nothing to hit.
 *
 * Rejected: a `<HitTarget>` wrapper that measures itself and pads to 44. It
 * would need a layout pass before it knew its own slop — the first-frame bug
 * `stepperFont.ts` describes — and the visual size is always a constant at the
 * call site anyway.
 */

/** The floor for anything tapped. */
export const TOUCH_MIN = 44;
/** The floor for anything tapped mid-workout. */
export const TOUCH_MIN_WORKOUT = 48;

/**
 * The slop each side needs for a control `visual` dp across to reach `min`.
 * Rounded UP — a target a half dp short is short — and never negative.
 */
export function hitSlopFor(visual: number, min: number = TOUCH_MIN): number {
  if (!Number.isFinite(visual) || !Number.isFinite(min)) return 0;
  return Math.max(0, Math.ceil((min - visual) / 2));
}

/** The size a control actually answers to: its own, plus the slop both sides. */
export function reach(visual: number, slop: number): number {
  return visual + 2 * Math.max(0, slop);
}

export interface SlopInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * `hitSlopFor` as the four sides React Native takes, with any side that faces a
 * neighbour capped (pass half the gap). A cap only ever SHRINKS a side.
 */
export function slopInsets(
  visual: number,
  min: number = TOUCH_MIN,
  caps: Partial<SlopInsets> = {},
): SlopInsets {
  const slop = hitSlopFor(visual, min);
  const side = (cap: number | undefined) =>
    cap == null || !Number.isFinite(cap) ? slop : Math.max(0, Math.min(slop, cap));
  return {
    top: side(caps.top),
    bottom: side(caps.bottom),
    left: side(caps.left),
    right: side(caps.right),
  };
}
