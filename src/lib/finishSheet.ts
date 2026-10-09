/**
 * Does Finish open the sheet, or save in one tap?
 *
 * The Finish sheet is not a confirmation step: with nothing to say, Finish saves
 * in one tap, as it always has. It opens only when the moment has something in
 * it the user would otherwise never see — unlogged sets (an intention, not
 * history), a ladder that moved, a record that fell (W6), or a milestone that is
 * due (E4). The milestone joined the list after a review found the one-tap path
 * skipped it: the card is stamped when the save lands, so a finish that never
 * opened the sheet neither showed nor stamped it, and the next workout is not a
 * milestone — the celebration was lost for good.
 *
 * A pure function so that rule has a test; ActiveWorkoutScreen only asks it.
 */
export interface FinishMoment {
  /** Sets planned but not logged. */
  unlogged: number;
  /** A rep ladder moved this session. */
  ladderMoved: boolean;
  /** Records broken this session (`recordsBrokenIn`). */
  records: number;
  /** `milestoneDue(...)` — null when none is due or the switch is off. */
  milestone: number | null;
}

export function finishOpensSheet(m: FinishMoment): boolean {
  return m.unlogged > 0 || m.ladderMoved || m.records > 0 || m.milestone != null;
}
