/**
 * When a row that grows in must be fully open, whether or not its animation said so.
 *
 * `GrowIn` (components/motion.tsx) opens a new row from zero height: it waits for
 * the content's `onLayout` to learn the height, animates to it, and only then
 * drops the fixed height. Every one of those steps is a callback that can fail to
 * arrive — a layout event that never fires for content inside a zero-height,
 * clipped parent, a height animation interrupted by a re-measure and never
 * finished, a JS-driven height the renderer does not commit. Any of them left the
 * row at height 0 — invisible, though it was in the store — until closing and
 * reopening the card remounted it as an old row. That was the `+ Add set` bug:
 * "the set is only there after I close and reopen the exercise".
 *
 * So the animation is decoration with a DEADLINE. Past it the row is drawn at
 * its natural height and full opacity no matter what the animation is doing. The
 * store was written first, as everywhere in the motion pass; this makes sure the
 * screen catches up with it.
 */

/** Slack past the nominal duration — a frame or two of JS-thread jank, and then some. */
export const GROW_IN_GRACE_MS = 250;

/** Milliseconds after mount by which a growing row must be settled open. */
export function growInDeadline(durationMs: number, scale: number): number {
  const nominal = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 0;
  return Math.round(nominal * factor) + GROW_IN_GRACE_MS;
}
