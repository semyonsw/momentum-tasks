/**
 * How much motion this app plays: always 1.
 *
 * ── IT USED TO READ ANDROID'S "REMOVE ANIMATIONS" ─────────────────────────
 *
 * With that setting on, this returned 0 and every duration in the motion pass
 * collapsed to its end state. Momentum's navigation IS motion — the section
 * grows out of the tile you tapped, the nav blob stretches toward the next slot,
 * a pushed screen slides over the one it came from — and with those gone the
 * app stops explaining where you are. The phone this is built for has the
 * setting on for reasons that have nothing to do with this app (it was the
 * developer-options way to make the launcher snappier), so the design decision
 * is to ignore it: animations always on.
 *
 * The hook stays, rather than every call site losing its `* scale`, so the day
 * that decision is revisited it is one file again. The two loops that checked
 * for zero (the marquee, the breathing lamps) now always run.
 */

/** Always 1. Multiply durations by it. */
export function useMotionScale(): number {
  return 1;
}
