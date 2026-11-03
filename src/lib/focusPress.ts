/**
 * What a press on focus mode's DONE actually means — decided here, away from the
 * renderer, because every one of these was a tap that logged the wrong thing.
 *
 *  • A SECOND DONE inside the cooldown is the same press bouncing, not a second
 *    set. The 180 ms ripple wait already swallowed one inside the wait; but when
 *    no rest follows the set (mid-superset, auto-rest off) the same DONE stays on
 *    screen, and a double-tap 250 ms apart logged the NEXT set too. With reduced
 *    motion there was no wait and so no guard at all.
 *  • UNDO WHILE A DONE IS STILL PENDING takes back that DONE, not the set before
 *    it. The chip sits right above DONE; pressed inside the ripple wait it used to
 *    un-log the previous set and then let the pending one log anyway — the
 *    opposite of what the thumb asked for.
 *  • DONE ON A HOLD THAT HAS HELD NOTHING YET logs the set as planned. Committing
 *    a clock that reads 0 s logs nothing at all, while the flash and the buzz say
 *    it did.
 */

import type { TimerPhase } from './setTimer';

/** Long enough to swallow a double-tap, far shorter than any real set. */
export const DONE_COOLDOWN_MS = 400;

/** Whether a DONE press at `now` is a new press, given the last one it acted on. */
export function acceptsDone(lastAcceptedAt: number | null, now: number): boolean {
  return lastAcceptedAt == null || now - lastAcceptedAt >= DONE_COOLDOWN_MS;
}

/** What undo does: cancel a DONE still waiting to log, or take back a logged set. */
export function undoAction(donePending: boolean): 'cancel-pending' | 'uncomplete' {
  return donePending ? 'cancel-pending' : 'uncomplete';
}

/**
 * How DONE ends a timed set: `commit` logs what the clock read, `log` logs the
 * set as planned. Only a hold that has actually counted a second has a reading
 * worth logging.
 */
export function holdDoneEnding(
  phase: TimerPhase | null | undefined,
  workedSeconds: number | null | undefined,
): 'commit' | 'log' {
  return phase === 'work' && (workedSeconds ?? 0) > 0 ? 'commit' : 'log';
}
