/**
 * The inline set editor (`QuickAdjust`) and focus mode: which one owns a number.
 *
 *   board ── tap 8 REPS on row 3 ──► the editor opens under row 3
 *        └─ Focus ──► focus mode edits the up-next set, DONE moves the cursor
 *        ◄─ close ── back to the board
 *
 * THE BUG THIS FILE EXISTS FOR. The editor's open/closed state is local to the
 * exercise card, and nothing in focus mode ever touched it: focus mode's DONE and
 * ± write to the store directly, past the card's own `✓` handler, which is the
 * only thing that closed the editor. So an editor left open (or half-typed) on the
 * board was still sitting there after a trip through focus mode — under a row
 * whose numbers focus mode had just changed, sometimes under the row that had
 * become the up-next one, sometimes in typing mode holding a number from before.
 * The first chip press then only closed the typing box, the second one moved the
 * number, and "press + then −" was the way to get the row to read right again.
 *
 * Three rules, each one a function below:
 *
 *  1. FOCUS MODE CLOSES EVERY INLINE EDITOR, and the editor does not come back
 *     when focus mode closes. One editor for a number at a time.
 *  2. EVERY ROW HAS AN INLINE EDITOR, the up-next one included (redesign #1).
 *     That row's numbers used to open focus mode instead, which made the one row
 *     you were about to lift the one row whose numbers you could not nudge in
 *     place; focus mode now has its two labelled doors (the dock pill and the
 *     card's chip) and nothing else. A row that no longer exists has no editor.
 *  3. A CHIP PRESS ALWAYS DOES SOMETHING. Mid-type it takes the typed number; with
 *     nothing typed it closes the box AND nudges, rather than being swallowed. And
 *     a typed buffer is dropped the moment the number under it changes from
 *     anywhere else, because what was typed was typed against the old one.
 */

import type { NudgeField } from './setNudge';

export interface EditorTarget {
  setId: string;
  field: NudgeField;
}

export interface EditorContext {
  /** The ids of the sets the card is drawing right now. */
  setIds: readonly string[];
  /** Focus mode is on screen over the board. */
  focusModeOpen: boolean;
}

/** Rules 1 and 2: the editor to draw, or null. */
export function visibleEditor(
  open: EditorTarget | null,
  context: EditorContext,
): EditorTarget | null {
  if (open == null) return null;
  if (context.focusModeOpen) return null;
  if (!context.setIds.includes(open.setId)) return null;
  return open;
}

/**
 * Rule 1, as a transition: does the card's stored editor state need clearing?
 *
 * Clearing (rather than only hiding while focus mode is up) is the point — an
 * editor that reappears when focus mode closes is the stale box again.
 */
export function shouldCloseEditor(open: EditorTarget | null, context: EditorContext): boolean {
  return open != null && visibleEditor(open, context) == null;
}

export type ChipPress =
  /** Mid-type with a number in the box: take that number, ignore the chip. */
  | { kind: 'commit-typed' }
  /** Not typing, or typing nothing: nudge (and close the box if it was open). */
  | { kind: 'nudge'; closeTyping: boolean };

/** Rule 3: what one ± chip press does, given the typing box's state. */
export function chipPress(typing: boolean, buffer: string): ChipPress {
  if (typing && buffer.trim() !== '') return { kind: 'commit-typed' };
  return { kind: 'nudge', closeTyping: typing };
}

/**
 * Rule 3's second half: the field's number, as a key that changes when it does.
 * `QuickAdjust` drops its typing box when this key moves under it.
 */
export function editorValueKey(
  set: { weightKg: number | null; count: number },
  field: NudgeField,
): string {
  return field === 'weight' ? `w:${set.weightKg ?? ''}` : `c:${set.count}`;
}
