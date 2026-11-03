/**
 * Focus mode's hold controls swap under the thumb — so a press right after the
 * swap is the previous press bouncing, not a new decision.
 *
 *   idle        [ ▶ Start ]
 *   get ready   [ Start now ]          [ ✕ ]
 *   running     [+15] [ ⏸ Stop ]       [ ✕ ]
 *
 * The row is rebuilt on every phase change, and the buttons that start a hold sit
 * where the buttons that end one land. A double-tap on `Start` with no lead-in, or
 * on `Start now`, put its second tap on `Stop` — the hold was over before it began,
 * logged at 0 s, by a press that meant "go". The same happens to a single tap on
 * `Start now` that arrives just as the get-ready count runs out by itself.
 *
 * REJECTED: debouncing each button. The bounce does not land on the button that was
 * pressed — that button is gone — so the guard has to belong to the ROW and be
 * keyed on the moment the row changed, not on the last press.
 */

import type { TimerPhase } from './setTimer';

/** Long enough to swallow a double-tap, far shorter than any reaction to a new row. */
export const HOLD_ROW_SETTLE_MS = 300;

/** Which control row is on screen. `over` is gone within a frame; it reads as running. */
export type HoldRowPhase = 'idle' | 'prepare' | 'running';

export function holdRowPhase(phase: TimerPhase | null | undefined): HoldRowPhase {
  if (phase == null) return 'idle';
  return phase === 'prepare' ? 'prepare' : 'running';
}

/**
 * Whether a press at `now` on the row counts, given when the row last changed.
 * Null means it has not changed since it appeared, which is not a bounce.
 */
export function acceptsHoldRowPress(rowChangedAt: number | null, now: number): boolean {
  return rowChangedAt == null || now - rowChangedAt >= HOLD_ROW_SETTLE_MS;
}
