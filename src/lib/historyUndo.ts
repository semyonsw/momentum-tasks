/**
 * WHEN A REMOVAL'S UNDO STOPS BEING SAFE — the History screen's `Removed · Undo`.
 *
 * The Undo is a snapshot of the whole workout taken before the removal, and
 * pressing it writes that snapshot back. So any OTHER edit to the log while the
 * toast is up — a weight corrected, a title typed, the day moved — sits on top of
 * a snapshot that does not contain it, and Undo would silently revert it along
 * with the removal.
 *
 * The fix is that a later edit retires the Undo: the toast goes before the edit
 * lands. Rejected: snapshotting only the removed rows and splicing them back in,
 * which is the more generous Undo but a new merge with its own ordering bugs —
 * and the toast is up for a few seconds, so the window it closes is small.
 */

/**
 * `edit`, wrapped so that calling it first retires any pending Undo (`dismiss`).
 * Arguments and the return value pass through untouched.
 */
export function supersedesUndo<A extends unknown[], R>(
  edit: (...args: A) => R,
  dismiss: () => void,
): (...args: A) => R {
  return (...args: A) => {
    dismiss();
    return edit(...args);
  };
}
