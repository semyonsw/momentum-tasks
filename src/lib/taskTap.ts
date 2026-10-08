/**
 * What a tap, a hold and an empty day do on the Tasks screen (U1, U6, U13).
 *
 * ── A TAP IS "I DID IT", AND NOTHING ELSE ─────────────────────────────────
 *
 * The circle used to CYCLE: unanswered → done → missed on purpose → unanswered.
 * The third state is the one that keeps a habit list honest (`lib/tasks.ts` has
 * the argument), but putting it one tap past `done` meant a double tap — a
 * bounce, a thumb that landed twice — quietly excused a day and took it out of
 * the denominator. Nobody looking at the row could tell that had happened.
 *
 * So the tap toggles `done` ↔ unanswered and can never write `missed`. Excusing
 * a day is a SENTENCE you choose from the row's hold menu, and it says what it
 * did in a toast with an Undo. Rejected: keeping the cycle and adding a toast to
 * its third step (the mark still lands by accident, it just apologises), and a
 * confirm sheet on the skip (ceremony charged to every deliberate skip).
 *
 * A tap on a row that is ALREADY excused makes it `done`, as the design draws
 * it: a tap means "I did it", and a day you meant to skip and then did after
 * all is a done day. Taking the skip back without claiming the task is in the
 * hold menu (`unskip`), which returns the row to unanswered.
 *
 * Nothing here rewrites the log. An old `missed` stays `missed` until somebody
 * taps that row on that day.
 *
 * ── THE HOLD MENU KEEPS WHAT THE HOLD USED TO DO ──────────────────────────
 *
 * A long press used to lift the row for reordering. It opens the menu now, and
 * `Move` is in it, so nothing the hold could do went away — it is one step
 * longer, and the step is a word you can read rather than a gesture you had to
 * have been told about.
 */

import type { TaskMark } from './tasks';

/** The circle's tap: done ↔ unanswered. An excused row becomes done. */
export function toggledMark(current: TaskMark | null): TaskMark | null {
  return current === 'done' ? null : 'done';
}

export type TaskRowAction = 'skip' | 'unskip' | 'pause' | 'move' | 'open';

/**
 * The hold menu for one row, top to bottom.
 *
 * `move` only with something to move past — one row can only be dropped where
 * it already is, the same rule the old long press had. `pause` (T3) sits under
 * the skip because it is the same answer for a run of days: the one-day version
 * first, the many-day one next to it.
 */
export function taskRowActions(mark: TaskMark | null, visibleRows: number): TaskRowAction[] {
  const actions: TaskRowAction[] = [mark === 'missed' ? 'unskip' : 'skip', 'pause'];
  if (visibleRows > 1) actions.push('move');
  actions.push('open');
  return actions;
}

/**
 * What the screen says when there are no rows (U13), and it says it ONCE.
 *
 *  - `first`: there are no live tasks at all, so the one useful thing on the
 *    screen is the editor — a ghost card that opens it.
 *  - `quiet`: there are tasks, none of them asks this day. One line.
 *  - `null`: there are rows; they speak for themselves.
 *
 * It used to be two lines saying "nothing" in different words, one under the
 * dial and one under the empty list.
 */
export function tasksEmptyState(liveTasks: number, visibleRows: number): 'first' | 'quiet' | null {
  if (visibleRows > 0) return null;
  return liveTasks === 0 ? 'first' : 'quiet';
}

/** The "tap a circle, hold a row" line: only with two rows or more (U13). */
export function showTasksHint(visibleRows: number): boolean {
  return visibleRows >= 2;
}
