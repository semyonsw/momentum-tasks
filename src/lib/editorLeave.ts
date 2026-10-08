/**
 * THE TWO DRAFT EDITORS' EXITS — the routine editor and the exercise editor.
 *
 * Both hold a draft that is committed only by their one commit action and
 * cancelled by leaving. T-U3 moved that commit out of the header's top-right
 * corner into the floating slot (`FloatingAction`, the worded pill, as Task
 * detail has it) — and moving it is exactly the change that can quietly break
 * the leave rules around it, so the rules are written down here, once, instead
 * of as an inline `&&` chain in each screen:
 *
 *   • BACK ASKS ONLY WHEN THERE IS SOMETHING TO LOSE. `dirty` comes from each
 *     editor's own comparison (`routineDraftChanged`, `exerciseDraftChanged`);
 *     an untouched draft leaves on one press, as it always did.
 *   • THE GUARD STANDS DOWN while something else owns back — a sheet, a confirm,
 *     a row in the air — and once the screen is on its way out (`leaving`), so
 *     the exit slide is never interrupted by its own question.
 *   • THE COMMIT SLOT is absent while something else owns the screen (a row in
 *     the air has `Drop` in the header; a sheet has its own buttons), asleep
 *     while the draft cannot be committed (an exercise with no name), and awake
 *     otherwise. Asleep, not missing: a button that appears under a thumb
 *     already on its way gets pressed by accident (see `FloatingAction`).
 *
 * Saving is not a way of LEAVING in this sense: the screen's owner pops it
 * directly on save, which never consults the guard (`navigation/leaveGuard.ts`
 * is asked only by hardware back and the edge swipe).
 */

export interface EditorExit {
  /** The draft differs from what was opened. */
  dirty: boolean;
  /** Discarded or saved, and sliding away: nothing left to guard. */
  leaving: boolean;
  /** A sheet, confirm or lifted row is up and answers back itself. */
  busy: boolean;
}

/** What the screen's own ‹ does. */
export function editorBack(dirty: boolean): 'ask' | 'leave' {
  return dirty ? 'ask' : 'leave';
}

/** Whether hardware back and the edge swipe must ask first. */
export function editorGuardsBack({ dirty, leaving, busy }: EditorExit): boolean {
  return dirty && !leaving && !busy;
}

/** The floating commit's state. */
export function editorCommitSlot({
  busy,
  canCommit,
}: {
  busy: boolean;
  canCommit: boolean;
}): 'hidden' | 'asleep' | 'awake' {
  if (busy) return 'hidden';
  return canCommit ? 'awake' : 'asleep';
}
